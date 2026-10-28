// Scene -> ASCII conversion.
//
// 1. Render a float G-buffer (zone id, albedo luminance, lambert, view normal, view depth).
// 2. Draw 1px contour lines where zones meet (only for pairs an illustrator would outline) or
//    where depth jumps (self-occlusion, e.g. the tail curling over itself).
// 3. For every character cell holding contour pixels, pick the glyph whose rendered bitmap best
//    matches the contour (blurred SSD, glyph may shift a few pixels inside the cell).
// 4. Remaining covered cells get a per-material fill character from a tone ramp.

import * as THREE from 'three';
import { ID } from './squirrel.js';

export const CELL = { w: 10, h: 20 }; // 0.6em x 1.2em of a 16.67px monospace font
export const FONT = '"Courier New", Courier, monospace';
export const LINE_CHARS = ' .,\'`-_|/\\()<>^~v';

const NID = 32;
const LINE = new Uint8Array( NID * NID );
{

	const setLine = ( a, b ) => { LINE[ a * NID + b ] = LINE[ b * NID + a ] = 1; };
	const BODY = [ ID.TORSO, ID.BELLY, ID.HEAD, ID.THIGH, ID.FOOT, ID.ARM, ID.HAND, ID.EAR ];
	const all = Object.values( ID );
	for ( const a of all ) for ( const b of all ) {

		if ( a !== b && ! ( BODY.includes( a ) && BODY.includes( b ) ) ) setLine( a, b );

	}

	for ( const [ a, b ] of [
		[ ID.THIGH, ID.TORSO ], [ ID.THIGH, ID.BELLY ], [ ID.THIGH, ID.FOOT ], [ ID.FOOT, ID.TORSO ], [ ID.FOOT, ID.BELLY ],
		[ ID.ARM, ID.TORSO ], [ ID.ARM, ID.BELLY ], [ ID.ARM, ID.HEAD ], [ ID.ARM, ID.THIGH ],
		[ ID.HAND, ID.TORSO ], [ ID.HAND, ID.BELLY ], [ ID.EAR, ID.HEAD ]
	] ) setLine( a, b );

}

// ---------------------------------------------------------------------------------------------
// Camera

// Orthographic camera looking along `dir` (towards the scene), frustum fitted to the visible
// geometry so that `cols` character cells span the content width.
export function fitCamera( scene, dir, { cols, cellAspect = CELL.w / CELL.h, margin = 0.6 } ) {

	const box = new THREE.Box3();
	const framed = ( o ) => o.isMesh && ( ! o.userData.beautyOnly || o.userData.frame );
	scene.traverse( ( o ) => { if ( framed( o ) ) box.expandByObject( o ); } );
	const center = box.getCenter( new THREE.Vector3() );

	const cam = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0.1, 400 );
	cam.position.copy( center ).addScaledVector( dir.clone().normalize(), - 120 );
	cam.up.set( 0, 1, 0 );
	cam.lookAt( center );
	cam.updateMatrixWorld();

	let minX = Infinity, maxX = - Infinity, minY = Infinity, maxY = - Infinity;
	const v = new THREE.Vector3(), m = new THREE.Matrix4();
	scene.traverse( ( o ) => {

		if ( ! framed( o ) ) return;
		m.multiplyMatrices( cam.matrixWorldInverse, o.matrixWorld );
		const p = o.geometry.attributes.position;
		const step = Math.max( 1, Math.floor( p.count / 40000 ) );
		for ( let i = 0; i < p.count; i += step ) {

			v.fromBufferAttribute( p, i ).applyMatrix4( m );
			minX = Math.min( minX, v.x ); maxX = Math.max( maxX, v.x );
			minY = Math.min( minY, v.y ); maxY = Math.max( maxY, v.y );

		}

	} );

	minX -= margin; maxX += margin; minY -= margin; maxY += margin;
	const cellW = ( maxX - minX ) / cols;
	const cellH = cellW / cellAspect;
	const rows = Math.ceil( ( maxY - minY ) / cellH );
	const cy = ( minY + maxY ) / 2;
	cam.left = minX; cam.right = maxX;
	cam.top = cy + rows * cellH / 2; cam.bottom = cy - rows * cellH / 2;
	cam.updateProjectionMatrix();
	return { camera: cam, rows, cellW };

}

// ---------------------------------------------------------------------------------------------
// G-buffer

export function renderGBuffer( renderer, scene, camera, W, H ) {

	const rt = new THREE.WebGLRenderTarget( W, H, {
		type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true
	} );

	const saved = [];
	scene.traverse( ( o ) => saved.push( [ o, o.visible, o.material ] ) );
	const background = scene.background;
	scene.background = null;
	const prevTarget = renderer.getRenderTarget();
	const prevClear = renderer.getClearColor( new THREE.Color() ), prevAlpha = renderer.getClearAlpha();

	const out = {};
	for ( const pass of [ 'geom', 'mat' ] ) {

		scene.traverse( ( o ) => {

			if ( o.userData.beautyOnly ) o.visible = false;
			else if ( o.userData.passes ) o.material = o.userData.passes[ pass ];

		} );
		renderer.setRenderTarget( rt );
		renderer.setClearColor( 0x000000, 0 );
		renderer.clear();
		renderer.render( scene, camera );
		out[ pass ] = new Float32Array( W * H * 4 );
		renderer.readRenderTargetPixels( rt, 0, 0, W, H, out[ pass ] );

	}

	for ( const [ o, visible, material ] of saved ) {

		o.visible = visible;
		if ( material ) o.material = material;

	}

	scene.background = background;
	renderer.setRenderTarget( prevTarget );
	renderer.setClearColor( prevClear, prevAlpha );
	rt.dispose();

	// Unpack into top-down planes.
	const N = W * H;
	const id = new Uint8Array( N ), depth = new Float32Array( N ), lum = new Float32Array( N ), lambert = new Float32Array( N );
	const normal = new Float32Array( N * 3 );
	for ( let y = 0; y < H; y ++ ) {

		for ( let x = 0; x < W; x ++ ) {

			const s = ( ( H - 1 - y ) * W + x ) * 4, d = y * W + x;
			const covered = out.mat[ s + 3 ] > 0.5;
			id[ d ] = covered ? Math.round( out.mat[ s ] ) : 0;
			lum[ d ] = out.mat[ s + 1 ];
			lambert[ d ] = out.mat[ s + 2 ];
			depth[ d ] = covered ? out.geom[ s + 3 ] : Infinity;
			normal[ d * 3 ] = out.geom[ s ];
			normal[ d * 3 + 1 ] = out.geom[ s + 1 ];
			normal[ d * 3 + 2 ] = out.geom[ s + 2 ];

		}

	}

	return { W, H, id, depth, lum, lambert, normal };

}

// ---------------------------------------------------------------------------------------------
// Contours

export function contourImage( G, { depthJump = 0.6, noLines = [] } = {} ) {

	const { W, H, id, depth } = G;
	const lines = LINE.slice();
	for ( const [ a, b ] of noLines ) lines[ a * NID + b ] = lines[ b * NID + a ] = 0;
	const E = new Float32Array( W * H );
	const test = ( p, q ) => {

		const a = id[ p ], b = id[ q ];
		if ( a !== b ? lines[ a * NID + b ] : ( a !== 0 && Math.abs( depth[ p ] - depth[ q ] ) > depthJump ) ) {

			E[ depth[ p ] <= depth[ q ] ? p : q ] = 1;

		}

	};

	for ( let y = 0; y < H; y ++ ) {

		for ( let x = 0; x < W; x ++ ) {

			const p = y * W + x;
			if ( x + 1 < W ) test( p, p + 1 );
			if ( y + 1 < H ) test( p, p + W );

		}

	}

	return E;

}

function gaussianKernel( sigma ) {

	const r = Math.ceil( sigma * 3 ), k = [];
	let sum = 0;
	for ( let i = - r; i <= r; i ++ ) {

		const w = Math.exp( - i * i / ( 2 * sigma * sigma ) );
		k.push( w );
		sum += w;

	}

	return k.map( ( w ) => w / sum );

}

export function blur( src, W, H, sigma ) {

	const k = gaussianKernel( sigma ), r = ( k.length - 1 ) / 2;
	const tmp = new Float32Array( W * H ), dst = new Float32Array( W * H );
	for ( let y = 0; y < H; y ++ ) {

		for ( let x = 0; x < W; x ++ ) {

			let s = 0;
			for ( let i = - r; i <= r; i ++ ) {

				const xx = x + i;
				if ( xx >= 0 && xx < W ) s += src[ y * W + xx ] * k[ i + r ];

			}

			tmp[ y * W + x ] = s;

		}

	}

	for ( let y = 0; y < H; y ++ ) {

		for ( let x = 0; x < W; x ++ ) {

			let s = 0;
			for ( let i = - r; i <= r; i ++ ) {

				const yy = y + i;
				if ( yy >= 0 && yy < H ) s += tmp[ yy * W + x ] * k[ i + r ];

			}

			dst[ y * W + x ] = s;

		}

	}

	return dst;

}

// ---------------------------------------------------------------------------------------------
// Glyph bank: each glyph rendered as it appears in a 1.2 line-height monospace line, blurred,
// padded by (mx, my) so it can be compared at small offsets.

export function glyphBank( chars, { cw = CELL.w, ch = CELL.h, mx = 5, my = 3, sigma = 1.2, font = FONT } = {} ) {

	const PW = cw + 2 * mx, PH = ch + 2 * my;
	const canvas = document.createElement( 'canvas' );
	canvas.width = PW; canvas.height = PH;
	const ctx = canvas.getContext( '2d', { willReadFrequently: true } );

	let size = cw / 0.6;
	ctx.font = `${ size }px ${ font }`;
	size *= cw / ctx.measureText( 'M' ).width;
	ctx.font = `${ size }px ${ font }`;
	const m = ctx.measureText( 'M' );
	const baseline = ( ch - ( m.fontBoundingBoxAscent + m.fontBoundingBoxDescent ) ) / 2 + m.fontBoundingBoxAscent;

	const glyphs = [];
	for ( const c of chars ) {

		ctx.fillStyle = '#000';
		ctx.fillRect( 0, 0, PW, PH );
		ctx.fillStyle = '#fff';
		ctx.textBaseline = 'alphabetic';
		ctx.fillText( c, mx, my + baseline );
		const img = ctx.getImageData( 0, 0, PW, PH ).data;
		const cov = new Float32Array( PW * PH );
		let ink = 0;
		for ( let i = 0; i < PW * PH; i ++ ) {

			cov[ i ] = img[ i * 4 ] / 255;
			ink += cov[ i ];

		}

		glyphs.push( { c, ink, cov, blurred: blur( cov, PW, PH, sigma ) } );

	}

	return { glyphs, cw, ch, mx, my, PW, PH, fontSize: size, baseline };

}

// ---------------------------------------------------------------------------------------------

// Default fill: tone ramp over the majority material of a cell.
const RAMP = ' .:-=+*#%@';
export const defaultStyle = {
	charset: LINE_CHARS,
	fill: ( cell ) => RAMP[ Math.floor( Math.min( 0.999, Math.max( 0, 1 - cell.shade ) ) * RAMP.length ) ]
};

// Glyphs that draw a line in the upper part of a cell; such a line reads better as "_" one row up.
const TOP_GLYPHS = '\'`"-~^';

export function convert( G, opts = {} ) {

	const { W, H, id, lum, lambert, depth } = G;
	const style = opts.style ?? defaultStyle;
	const bank = getBank( style.charset, opts );
	const { cw, ch, mx, my, PW, glyphs } = bank;
	const cols = Math.floor( W / cw ), rows = Math.floor( H / ch );
	const penX = opts.penX ?? 0.012, penY = opts.penY ?? 0.04;
	const minCoverage = opts.minCoverage ?? 0.45;
	const camera = opts.camera;

	const E = contourImage( G, { ...opts, noLines: style.noLines ?? [] } );
	const kernel = gaussianKernel( opts.sigma ?? 1.2 ), kr = ( kernel.length - 1 ) / 2;
	const raw = new Float32Array( cw * ch ), tmp = new Float32Array( cw * ch );

	// Blur a cell's own contour pixels (zero outside the cell, so neighbours cannot claim them).
	function cellPatch( r, c, patch ) {

		for ( let v = 0; v < ch; v ++ ) for ( let u = 0; u < cw; u ++ ) raw[ v * cw + u ] = E[ ( r * ch + v ) * W + c * cw + u ];
		for ( let v = 0; v < ch; v ++ ) for ( let u = 0; u < cw; u ++ ) {

			let acc = 0;
			for ( let i = - kr; i <= kr; i ++ ) { const uu = u + i; if ( uu >= 0 && uu < cw ) acc += raw[ v * cw + uu ] * kernel[ i + kr ]; }
			tmp[ v * cw + u ] = acc;

		}

		let e2 = 0;
		for ( let v = 0; v < ch; v ++ ) for ( let u = 0; u < cw; u ++ ) {

			let acc = 0;
			for ( let i = - kr; i <= kr; i ++ ) { const vv = v + i; if ( vv >= 0 && vv < ch ) acc += tmp[ vv * cw + u ] * kernel[ i + kr ]; }
			patch[ v * cw + u ] = acc;
			e2 += acc * acc;

		}

		return e2;

	}

	// sum(G^2) over the cell window for every glyph/shift.
	const shifts = [];
	for ( let dy = - my; dy <= my; dy ++ ) for ( let dx = - mx; dx <= mx; dx ++ ) shifts.push( [ dx, dy ] );
	const g2 = glyphs.map( ( g ) => shifts.map( ( [ dx, dy ] ) => {

		let s = 0;
		for ( let v = 0; v < ch; v ++ ) for ( let u = 0; u < cw; u ++ ) {

			const val = g.blurred[ ( v - dy + my ) * PW + ( u - dx + mx ) ];
			s += val * val;

		}

		return s;

	} ) );

	const patch = new Float32Array( cw * ch );
	const count = new Float32Array( NID ), lumSum = new Float32Array( NID ), lamSum = new Float32Array( NID ), depSum = new Float32Array( NID );
	const cells = [];

	for ( let r = 0; r < rows; r ++ ) {

		const line = [];
		for ( let c = 0; c < cols; c ++ ) {

			count.fill( 0 ); lumSum.fill( 0 ); lamSum.fill( 0 ); depSum.fill( 0 );
			let edgeInk = 0, edgeY = 0;
			for ( let v = 0; v < ch; v ++ ) {

				for ( let u = 0; u < cw; u ++ ) {

					const p = ( r * ch + v ) * W + c * cw + u;
					const k = id[ p ];
					count[ k ] ++; lumSum[ k ] += lum[ p ]; lamSum[ k ] += lambert[ p ];
					if ( k ) depSum[ k ] += depth[ p ];
					edgeInk += E[ p ]; edgeY += E[ p ] * v;

				}

			}

			const e2 = edgeInk > 0 ? cellPatch( r, c, patch ) : 0;

			let major = 0;
			for ( let k = 1; k < NID; k ++ ) if ( count[ k ] > 0 && ( major === 0 || count[ k ] > count[ major ] ) ) major = k;
			const n = count[ major ] || 1;
			const cell = {
				r, c, id: major, coverage: 1 - count[ 0 ] / ( cw * ch ),
				share: ( k ) => count[ k ] / ( cw * ch ),
				lum: lumSum[ major ] / n, lambert: lamSum[ major ] / n,
				shade: lumSum[ major ] / n * ( 0.35 + 0.65 * lamSum[ major ] / n ),
				depth: depSum[ major ] / n,
				edgeInk, edgeY: edgeInk ? edgeY / edgeInk / ch : 0.5,
				glyph: null, char: ' '
			};
			cell.shares = Array.from( count, ( v ) => v / ( cw * ch ) );

			if ( edgeInk > 0 ) {

				let best = e2, bestChar = ' ';
				for ( let gi = 0; gi < glyphs.length; gi ++ ) {

					const g = glyphs[ gi ];
					if ( g.c === ' ' ) continue;
					for ( let si = 0; si < shifts.length; si ++ ) {

						const [ dx, dy ] = shifts[ si ];
						let eg = 0;
						for ( let v = 0; v < ch; v ++ ) {

							const go = ( v - dy + my ) * PW - dx + mx, po = v * cw;
							for ( let u = 0; u < cw; u ++ ) eg += patch[ po + u ] * g.blurred[ go + u ];

						}

							const cost = e2 - 2 * eg + g2[ gi ][ si ] + penX * dx * dx + penY * dy * dy;
						if ( cost < best ) { best = cost; bestChar = g.c; }

					}

				}

				if ( bestChar !== ' ' ) cell.glyph = bestChar;

			}

			if ( camera && major ) {

				const x = cam2world( camera, ( c + 0.5 ) / cols, ( r + 0.5 ) / rows, cell.depth );
				cell.world = x;

			}

			line.push( cell );

		}

		cells.push( line );

	}

	const fillOf = ( cell ) => ( cell.coverage >= minCoverage && cell.id ) ? style.fill( cell ) ?? ' ' : ' ';
	for ( const line of cells ) for ( const cell of line ) cell.char = cell.glyph ?? fillOf( cell );

	// "_" one row up instead of a line hugging the top of a cell.
	if ( opts.lift !== false ) {

		for ( let r = 1; r < rows; r ++ ) {

			for ( let c = 0; c < cols; c ++ ) {

				const cell = cells[ r ][ c ], above = cells[ r - 1 ][ c ];
				if ( cell.glyph && TOP_GLYPHS.includes( cell.glyph ) && cell.edgeY < 0.3 && above.char === ' ' ) {

					above.char = '_';
					above.lifted = true;
					cell.glyph = null;
					cell.char = fillOf( cell );

				}

			}

		}

	}

	style.post?.( cells, { cols, rows, camera, G } );

	const chars = cells.map( ( l ) => l.map( ( cell ) => cell.char ) );
	const cellIds = cells.map( ( l ) => l.map( ( cell ) => cell.id ) );
	return { chars, cellIds, cells, cols, rows, E };

}

const _v = new THREE.Vector3();
function cam2world( camera, u, v, depth ) {

	_v.set( camera.left + u * ( camera.right - camera.left ), camera.top - v * ( camera.top - camera.bottom ), - depth );
	return _v.clone().applyMatrix4( camera.matrixWorld );

}

// Trim blank borders; returns plain lines.
export function toLines( chars ) {

	let lines = chars.map( ( l ) => l.join( '' ).replace( /\s+$/, '' ) );
	while ( lines.length && ! lines[ 0 ] ) lines.shift();
	while ( lines.length && ! lines[ lines.length - 1 ] ) lines.pop();
	const indent = Math.min( ...lines.filter( ( l ) => l ).map( ( l ) => l.match( /^ */ )[ 0 ].length ) );
	return lines.map( ( l ) => l.slice( indent ) );

}

// HTML that survives pasting into Gmail: monospace font, every space a &nbsp;, <br> per line.
export function toGmailHTML( lines, { fontSize = 13, lineHeight = 1.2 } = {} ) {

	const esc = ( s ) => s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( / /g, '&nbsp;' );
	return `<div style="font-family:'Courier New',Courier,monospace;font-size:${ fontSize }px;line-height:${ lineHeight };white-space:nowrap">` +
		lines.map( esc ).join( '<br>' ) + '</div>';

}

const banks = new Map();
function getBank( charset, opts ) {

	const key = JSON.stringify( [ charset, opts.sigma, opts.mx, opts.my ] );
	if ( ! banks.has( key ) ) banks.set( key, glyphBank( charset, opts ) );
	return banks.get( key );

}

export function sceneToAscii( renderer, scene, dir, opts = {} ) {

	const cols = opts.cols ?? 64;
	const { camera, rows } = fitCamera( scene, dir, { cols, margin: opts.margin } );
	const t0 = performance.now();
	const G = renderGBuffer( renderer, scene, camera, cols * CELL.w, rows * CELL.h );
	const t1 = performance.now();
	const style = typeof opts.style === 'function' ? opts.style( camera, scene ) : opts.style;
	const result = convert( G, { ...opts, camera, style } );
	const t2 = performance.now();
	result.lines = toLines( result.chars );
	result.text = result.lines.join( '\n' );
	result.camera = camera;
	result.G = G;
	result.timings = { gbuffer: t1 - t0, convert: t2 - t1 };
	return result;

}
