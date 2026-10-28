// Squirrel-specific ASCII style: what goes inside the contours.

import * as THREE from 'three';
import { ID } from './squirrel.js';

const FUR = new Set( [ ID.TORSO, ID.HEAD, ID.THIGH, ID.FOOT, ID.ARM, ID.HAND, ID.EAR ] );

// Deterministic per-cell pseudo random number in [0, 1).
function hash2( r, c, seed = 0 ) {

	let n = Math.imul( r + 101 * seed, 73856093 ) ^ Math.imul( c + 7, 19349663 );
	n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
	return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296;

}

// Character cells are about twice as tall as wide, so "/" and "\" sit near 63 degrees.
function strokeChar( dx, dy ) {

	const a = ( ( Math.atan2( dy, dx ) * 180 / Math.PI ) + 180 ) % 180;
	if ( a < 31.5 || a >= 148.5 ) return '-';
	if ( a < 76.5 ) return '/';
	if ( a < 103.5 ) return '|';
	return '\\';

}

// Rasterise a straight stroke between two points given in [0,1] screen coordinates:
// one cell per row for steep strokes, one per column for flat ones.
function stroke( cells, a, b, rows, cols, fixedChar = null ) {

	const ax = a.x * cols, ay = a.y * rows, bx = b.x * cols, by = b.y * rows;
	const char = fixedChar ?? strokeChar( bx - ax, - ( by - ay ) * 2 );
	const put = ( r, c ) => { const cell = cells[ r ]?.[ c ]; if ( cell ) cell.char = char; };
	if ( Math.abs( by - ay ) * 2 >= Math.abs( bx - ax ) ) {

		const r0 = Math.floor( Math.min( ay, by ) ), r1 = Math.floor( Math.max( ay, by ) );
		for ( let r = r0; r <= r1; r ++ ) {

			const t = Math.min( 1, Math.max( 0, ( r + 0.5 - ay ) / ( by - ay ) ) );
			put( r, Math.floor( ax + ( bx - ax ) * t ) );

		}

	} else {

		const c0 = Math.floor( Math.min( ax, bx ) ), c1 = Math.floor( Math.max( ax, bx ) );
		for ( let c = c0; c <= c1; c ++ ) {

			const t = Math.min( 1, Math.max( 0, ( c + 0.5 - ax ) / ( bx - ax ) ) );
			put( Math.floor( ay + ( by - ay ) * t ), c );

		}

	}

}

const BAYER4 = [ 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 ].map( ( v ) => ( v + 0.5 ) / 16 );

export const DEFAULTS = {
	charset: ' .,\'-_|/\\()',
	furRamp: '.:',          // fill for fur cells by darkness, '' = leave empty
	furRampFrom: 0.6,       // darkness where the fur ramp starts
	tail: 'strokes',        // 'strokes' | 'ramp' | 'none'
	tailFan: 0.55,          // how much tail hair fans out from the centre line
	tailDensity: 0.5,       // share of tail cells that get a stroke
	tailRamp: ' .:;',
	beer: 'bubbles',        // 'bubbles' | 'colon' | 'none'
	foam: 'oO',
	eye: '@',
	nose: null,
	whiskers: '-',          // character for the whisker strokes, null = none
	tailMargin: 1,          // keep this many cells inside the tail outline free of strokes
	armLines: true          // outline the arm where it lies on the body
};

export function makeStyle( overrides = {} ) {

	const o = { ...DEFAULTS, ...overrides };

	return ( camera, scene ) => {

		const squirrel = scene.getObjectByName( 'squirrel' );
		const samples = squirrel.userData.tailSamples.map( ( s ) => new THREE.Vector3( s[ 0 ], s[ 1 ], s[ 2 ] ) );
		const view = new THREE.Matrix3().setFromMatrix4( camera.matrixWorldInverse );
		const toCell = ( p ) => {

			const v = p.clone().applyMatrix4( camera.matrixWorldInverse );
			return { x: ( v.x - camera.left ) / ( camera.right - camera.left ), y: ( camera.top - v.y ) / ( camera.top - camera.bottom ) };

		};
		const noLines = [ [ ID.EYE, ID.HEAD ], [ ID.EYE, ID.BELLY ], [ ID.NOSE, ID.HEAD ], [ ID.NOSE, ID.BELLY ] ];
		for ( const k of Object.values( ID ) ) noLines.push( [ ID.TUFT, k ] );
		if ( ! o.armLines ) noLines.push( [ ID.ARM, ID.TORSO ], [ ID.ARM, ID.BELLY ], [ ID.ARM, ID.HEAD ], [ ID.HAND, ID.TORSO ], [ ID.HAND, ID.BELLY ] );
		const t = new THREE.Vector3(), out = new THREE.Vector3();

		function tailChar( cell ) {

			if ( o.tail === 'none' ) return ' ';
			const dark = 1 - cell.shade;
			if ( o.tail === 'ramp' ) return o.tailRamp[ Math.min( o.tailRamp.length - 1, Math.floor( dark * o.tailRamp.length ) ) ];
			if ( BAYER4[ ( cell.r % 4 ) * 4 + ( cell.c % 4 ) ] > o.tailDensity ) return ' ';

			let best = 0, bestD = Infinity;
			for ( let i = 0; i < samples.length; i ++ ) {

				const d = samples[ i ].distanceToSquared( cell.world );
				if ( d < bestD ) { bestD = d; best = i; }

			}

			const a = samples[ Math.max( best - 1, 0 ) ], b = samples[ Math.min( best + 1, samples.length - 1 ) ];
			t.subVectors( b, a ).normalize();
			out.subVectors( cell.world, samples[ best ] );
			out.addScaledVector( t, - out.dot( t ) ).normalize();
			t.addScaledVector( out, o.tailFan ).applyMatrix3( view );
			return strokeChar( t.x, t.y );

		}

		function beerChar( cell ) {

			if ( o.beer === 'colon' ) return ':';
			if ( o.beer === 'none' ) return ' ';
			const u = hash2( cell.r, cell.c, 1 );
			return u < 0.1 ? 'o' : u < 0.36 ? '.' : ' ';

		}

		return {
			charset: o.charset,
			noLines,
			fill( cell ) {

				const id = cell.id;
				if ( FUR.has( id ) ) {

					if ( ! o.furRamp ) return ' ';
					const k = ( 1 - cell.shade - o.furRampFrom ) / ( 1 - o.furRampFrom );
					return k <= 0 ? ' ' : o.furRamp[ Math.min( o.furRamp.length - 1, Math.floor( k * o.furRamp.length ) ) ];

				}

				switch ( id ) {

					case ID.TAIL: return tailChar( cell );
					case ID.BEER: return beerChar( cell );
					case ID.FOAM: return o.foam[ Math.floor( hash2( cell.r, cell.c, 2 ) * o.foam.length ) ];
					default: return ' ';

				}

			},
			post( cells, { rows, cols } ) {

				// Clean margin inside the tail outline.
				for ( let m = 0; m < o.tailMargin; m ++ ) {

					const clear = [];
					for ( const line of cells ) for ( const cell of line ) {

						if ( cell.id !== ID.TAIL || cell.glyph ) continue;
						for ( let dr = - 1; dr <= 1; dr ++ ) for ( let dc = - 1; dc <= 1; dc ++ ) {

							const n = cells[ cell.r + dr ]?.[ cell.c + dc ];
							if ( n && ( n.glyph || n.margin ) && n !== cell ) clear.push( cell );

						}

					}

					for ( const cell of clear ) { cell.char = ' '; cell.margin = true; }

				}

				// Ear tufts as one-cell-wide strokes from base to tip.
				for ( const line of cells ) for ( const cell of line ) if ( cell.id === ID.TUFT && ! cell.glyph ) cell.char = ' ';
				for ( const [ a, b ] of squirrel.userData.tufts ) stroke( cells, toCell( a ), toCell( b ), rows, cols );
				if ( o.whiskers ) for ( const [ a, b ] of squirrel.userData.whiskers ) stroke( cells, toCell( a ), toCell( b ), rows, cols, o.whiskers );

				// One eye character at the centroid of the eye pixels.
				for ( const [ fid, char ] of [ [ ID.EYE, o.eye ], [ ID.NOSE, o.nose ] ] ) {

					if ( ! char ) continue;
					let sr = 0, sc = 0, sw = 0;
					for ( const line of cells ) for ( const cell of line ) {

						const w = cell.shares[ fid ];
						if ( w > 0 ) { sr += w * cell.r; sc += w * cell.c; sw += w; }
						if ( cell.id === fid && ! cell.glyph ) cell.char = ' ';

					}

					if ( sw > 0 ) cells[ Math.round( sr / sw ) ][ Math.round( sc / sw ) ].char = char;

				}

			}
		};

	};

}
