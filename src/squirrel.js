// Procedural red squirrel (Sciurus vulgaris, with winter ear tufts) holding a Kölsch "Stange".
// Units are centimetres. The squirrel sits on the ground (y = 0), faces +x, its right side is +z.
// Body and tail are smooth SDF compositions meshed with three.js' MarchingCubes addon.

import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { smin, frame, ellipsoid, roundCone, tube, noise3 } from './sdf.js';

// Material/zone ids written into the G-buffer and consumed by the ASCII converter.
export const ID = {
	BG: 0, TORSO: 1, BELLY: 2, HEAD: 3, THIGH: 4, FOOT: 5, ARM: 6, HAND: 7, EAR: 8, TUFT: 9,
	EYE: 10, NOSE: 11, TAIL: 12, GLASS_BASE: 13, BEER: 14, FOAM: 15, GLASS_EMPTY: 16, GROUND: 17
};

const COLOR = {
	fur: [ 0.74, 0.36, 0.15 ],
	furDark: [ 0.52, 0.24, 0.10 ],
	cream: [ 0.96, 0.92, 0.83 ],
	paw: [ 0.60, 0.29, 0.12 ],
	tail: [ 0.68, 0.32, 0.13 ],
	tuft: [ 0.30, 0.15, 0.07 ],
	nose: [ 0.20, 0.13, 0.12 ],
	eye: [ 0.04, 0.03, 0.03 ],
	beer: [ 0.95, 0.72, 0.22 ],
	foam: [ 0.99, 0.98, 0.94 ],
	glass: [ 0.88, 0.93, 0.96 ]
};

// ---------------------------------------------------------------------------------------------
// Pose / proportions

export const POSE = {
	glass: { x: 5.0, z: 3.0, y0: 0, height: 10.0, radius: 1.7, base: 0.8, foamDepth: 1.3, crown: 0.45 },
	eye: { x: 5.0, y: 15.9, z: 2.45, r: 0.62 },
	nose: { x: 8.25, y: 14.45, z: 0, r: 0.45 },
	tufts: [ { base: [ 2.2, 20.2, 1.4 ], tip: [ 1.0, 23.0, 1.5 ], r: 0.36 } ],
	whiskers: [
		{ base: [ 8.0, 14.4, 1.0 ], tip: [ 10.2, 14.9, 2.0 ] },
		{ base: [ 8.0, 14.15, 1.0 ], tip: [ 10.0, 13.5, 1.9 ] }
	],
	tail: [
		[ - 3.4, 1.8, 0, 1.1 ],
		[ - 5.6, 2.2, 0, 1.8 ],
		[ - 7.3, 4.6, 0, 2.3 ],
		[ - 7.8, 8.8, 0, 2.55 ],
		[ - 7.2, 13.2, 0, 2.65 ],
		[ - 6.4, 17.2, 0, 2.6 ],
		[ - 6.6, 20.9, 0, 2.45 ],
		[ - 8.4, 23.4, 0, 2.15 ],
		[ - 11.0, 23.3, 0, 1.8 ],
		[ - 12.4, 21.3, 0, 1.3 ],
		[ - 12.1, 19.4, 0, 0.75 ]
	],
	tailFlatten: 0.62,
	tailFluff: 0.22
};

function mirrorZ( f ) {

	return ( x, y, z ) => f( x, y, - z );

}

function bodyModel() {

	const g = POSE.glass;

	const belly = ellipsoid( frame( 0.0, 5.2, 0, 0, 0, 0.1 ), 4.4, 4.8, 3.9 );
	const chest = ellipsoid( frame( 1.3, 9.6, 0, 0, 0, - 0.3 ), 3.1, 3.9, 2.95 );
	const neck = ellipsoid( frame( 2.5, 12.4, 0, 0, 0, - 0.55 ), 2.4, 2.4, 2.4 );
	const head = ellipsoid( frame( 3.6, 15.4, 0, 0, 0, - 0.12 ), 3.5, 3.2, 3.0 );
	const snout = ellipsoid( frame( 6.15, 14.7, 0, 0, 0, - 0.22 ), 2.2, 1.8, 1.72 );

	const thighR = ellipsoid( frame( - 0.3, 3.4, 2.3, 0, 0, 0.5 ), 3.5, 3.2, 1.9 );
	const footR = ellipsoid( frame( 1.2, 0.7, 2.4, 0, - 0.12, 0 ), 2.4, 0.7, 0.95 );
	const thighL = mirrorZ( thighR ), footL = mirrorZ( footR );

	// Hug: near arm wraps round the front of the glass, far arm reaches its back.
	const upperArmR = roundCone( [ 2.5, 11.0, 2.1 ], [ 2.9, 8.3, 3.4 ], 1.0, 0.78 );
	const foreArmR = roundCone( [ 2.9, 8.3, 3.4 ], [ 3.9, 7.2, 4.4 ], 0.78, 0.6 );
	const handR = ellipsoid( frame( 4.45, 7.1, 4.7, 0, - 0.35, 0.15 ), 0.85, 0.62, 0.5 );
	const upperArmL = roundCone( [ 2.5, 11.0, - 2.1 ], [ 4.0, 8.8, - 1.3 ], 1.0, 0.78 );
	const foreArmL = roundCone( [ 4.0, 8.8, - 1.3 ], [ 4.2, 7.6, 0.9 ], 0.78, 0.6 );
	const handL = ellipsoid( frame( 4.45, 7.5, 1.3, 0, 0.35, 0.15 ), 0.85, 0.62, 0.5 );

	const earR = ellipsoid( frame( 2.5, 18.9, 1.35, 0.2, 0, 0.2 ), 0.9, 1.75, 0.38 );
	const earL = mirrorZ( earR );

	const groups = {
		torso: ( x, y, z ) => smin( smin( belly( x, y, z ), chest( x, y, z ), 2.4 ), neck( x, y, z ), 1.6 ),
		head: ( x, y, z ) => smin( head( x, y, z ), snout( x, y, z ), 1.3 ),
		thigh: ( x, y, z ) => Math.min( thighR( x, y, z ), thighL( x, y, z ) ),
		foot: ( x, y, z ) => Math.min( footR( x, y, z ), footL( x, y, z ) ),
		arm: ( x, y, z ) => Math.min( upperArmR( x, y, z ), foreArmR( x, y, z ), upperArmL( x, y, z ), foreArmL( x, y, z ) ),
		hand: ( x, y, z ) => Math.min( handR( x, y, z ), handL( x, y, z ) ),
		ear: ( x, y, z ) => Math.min( earR( x, y, z ), earL( x, y, z ) )
	};

	const sdf = ( x, y, z ) => {

		let d = smin( groups.torso( x, y, z ), groups.head( x, y, z ), 1.8 );
		d = smin( d, groups.thigh( x, y, z ), 1.4 );
		d = smin( d, groups.foot( x, y, z ), 0.9 );
		d = smin( d, smin( groups.arm( x, y, z ), groups.hand( x, y, z ), 0.5 ), 0.8 );
		d = smin( d, groups.ear( x, y, z ), 0.6 );
		return d;

	};

	return { sdf, groups, box: [ - 6, - 1, - 6, 10, 22, 6 ] };

}

function tailModel() {

	const s = 1 / POSE.tailFlatten;
	const core = tube( POSE.tail, 6 );
	const amp = POSE.tailFluff;
	const sdf = ( x, y, z ) => {

		const d = core( x, y, z * s );
		if ( d > 1.5 ) return d; // far away: skip the noise
		return d - amp * ( noise3( x * 1.3, y * 1.3, z * 1.3 ) + 0.5 * noise3( x * 2.9 + 7, y * 2.9, z * 2.9 ) );

	};

	return { sdf, samples: core.samples, box: [ - 16.5, - 1, - 4, - 1, 27.5, 4 ] };

}

// ---------------------------------------------------------------------------------------------
// Meshing

let sharedMC = null;

function meshFromSDF( sdf, box, res ) {

	if ( ! sharedMC || sharedMC.resolution !== res ) {

		sharedMC = new MarchingCubes( res, new THREE.MeshBasicMaterial(), false, false, 700000 );

	}

	const mc = sharedMC;
	mc.reset();
	mc.isolation = 0;

	const cx = ( box[ 0 ] + box[ 3 ] ) / 2, cy = ( box[ 1 ] + box[ 4 ] ) / 2, cz = ( box[ 2 ] + box[ 5 ] ) / 2;
	const half = Math.max( box[ 3 ] - box[ 0 ], box[ 4 ] - box[ 1 ], box[ 5 ] - box[ 2 ] ) / 2 * ( res / ( res - 6 ) );
	const hs = res / 2, f = mc.field, size2 = res * res;

	for ( let k = 0; k < res; k ++ ) {

		const z = cz + ( k - hs ) / hs * half;
		for ( let j = 0; j < res; j ++ ) {

			const y = cy + ( j - hs ) / hs * half;
			const o = j * res + k * size2;
			for ( let i = 0; i < res; i ++ ) {

				f[ o + i ] = - sdf( cx + ( i - hs ) / hs * half, y, z );

			}

		}

	}

	mc.update();

	const n = mc.count;
	const pos = new Float32Array( n * 3 ), nor = new Float32Array( n * 3 );
	const P = mc.positionArray, N = mc.normalArray;
	for ( let v = 0; v < n; v ++ ) {

		const o = v * 3;
		pos[ o ] = cx + P[ o ] * half;
		pos[ o + 1 ] = cy + P[ o + 1 ] * half;
		pos[ o + 2 ] = cz + P[ o + 2 ] * half;
		const l = Math.hypot( N[ o ], N[ o + 1 ], N[ o + 2 ] ) || 1;
		nor[ o ] = N[ o ] / l;
		nor[ o + 1 ] = N[ o + 1 ] / l;
		nor[ o + 2 ] = N[ o + 2 ] / l;

	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	geo.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	geo.computeBoundingSphere();
	return geo;

}

const smooth = ( e0, e1, x ) => {

	const t = Math.min( Math.max( ( x - e0 ) / ( e1 - e0 ), 0 ), 1 );
	return t * t * ( 3 - 2 * t );

};
const mix3 = ( a, b, t ) => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];

// Per-vertex zone distances (for the per-pixel zone id) and albedo colours.
function decorateBody( geo, model ) {

	const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
	const n = pos.length / 3;
	const dA = new Float32Array( n * 4 ), dB = new Float32Array( n * 4 ), dC = new Float32Array( n * 4 );
	const col = new Float32Array( n * 3 );
	const G = model.groups, e = POSE.eye;

	for ( let v = 0; v < n; v ++ ) {

		const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
		const nx = nor[ v * 3 ], ny = nor[ v * 3 + 1 ];
		const d = [ G.torso( x, y, z ), G.head( x, y, z ), G.thigh( x, y, z ), G.foot( x, y, z ),
			G.arm( x, y, z ), G.hand( x, y, z ), G.ear( x, y, z ) ];
		dA.set( [ d[ 0 ], d[ 1 ], d[ 2 ], d[ 3 ] ], v * 4 );
		dB.set( [ d[ 4 ], d[ 5 ], d[ 6 ], 1e3 ], v * 4 );

		let zone = 0;
		for ( let i = 1; i < d.length; i ++ ) if ( d[ i ] < d[ zone ] ) zone = i;

		// Cream belly: front-facing torso, underside of head and snout (chin and throat).
		let belly = - 1;
		if ( zone === 0 ) belly = nx - 0.38 - Math.max( 0, y - 13.5 ) * 0.3;
		else if ( zone === 1 ) belly = Math.min( - ny - 0.45, x - 3.0 );
		const ex = x - e.x, ey = y - e.y, ez = z - Math.sign( z ) * e.z;
		const ring = 1.05 - Math.sqrt( ex * ex + ey * ey + ez * ez );
		dC.set( [ belly, ring, 0, 0 ], v * 4 );

		let c = mix3( COLOR.fur, COLOR.furDark, smooth( 0.0, - 0.7, nx ) * 0.8 );
		if ( zone === 3 || zone === 5 ) c = COLOR.paw;
		c = mix3( c, COLOR.cream, smooth( - 0.08, 0.08, belly ) );
		if ( zone === 1 ) c = mix3( c, COLOR.cream, smooth( - 0.1, 0.1, ring ) );
		col.set( c, v * 3 );

	}

	geo.setAttribute( 'dA', new THREE.BufferAttribute( dA, 4 ) );
	geo.setAttribute( 'dB', new THREE.BufferAttribute( dB, 4 ) );
	geo.setAttribute( 'dC', new THREE.BufferAttribute( dC, 4 ) );
	geo.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );

}

// ---------------------------------------------------------------------------------------------
// G-buffer materials. Pass "geom" writes (view normal, view depth); pass "mat" writes
// (zone id, albedo luminance, lambert term towards the key light, 1).

const GEOM_VS = /* glsl */`
	varying vec3 vN;
	varying float vDepth;
	void main() {
		vec4 mv = modelViewMatrix * vec4( position, 1.0 );
		vN = normalize( normalMatrix * normal );
		vDepth = - mv.z;
		gl_Position = projectionMatrix * mv;
	}`;

const GEOM_FS = /* glsl */`
	varying vec3 vN;
	varying float vDepth;
	void main() {
		vec3 n = normalize( vN );
		if ( ! gl_FrontFacing ) n = - n;
		gl_FragColor = vec4( n, vDepth );
	}`;

const MAT_VS = /* glsl */`
	#ifdef ZONES
	attribute vec4 dA;
	attribute vec4 dB;
	attribute vec4 dC;
	varying vec4 vA;
	varying vec4 vB;
	varying vec4 vC;
	#endif
	#ifdef USE_COLOR
	varying vec3 vCol;
	#endif
	varying vec3 vN;
	void main() {
		#ifdef ZONES
		vA = dA; vB = dB; vC = dC;
		#endif
		#ifdef USE_COLOR
		vCol = color;
		#endif
		vN = normalize( normalMatrix * normal );
		gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	}`;

const MAT_FS = /* glsl */`
	uniform float uId;
	uniform vec3 uAlbedo;
	uniform vec3 uLight;
	#ifdef ZONES
	varying vec4 vA;
	varying vec4 vB;
	varying vec4 vC;
	#endif
	#ifdef USE_COLOR
	varying vec3 vCol;
	#endif
	varying vec3 vN;
	void main() {
		float id = uId;
		#ifdef ZONES
		float best = vA.x; id = ${ ID.TORSO }.0;
		if ( vA.y < best ) { best = vA.y; id = ${ ID.HEAD }.0; }
		if ( vA.z < best ) { best = vA.z; id = ${ ID.THIGH }.0; }
		if ( vA.w < best ) { best = vA.w; id = ${ ID.FOOT }.0; }
		if ( vB.x < best ) { best = vB.x; id = ${ ID.ARM }.0; }
		if ( vB.y < best ) { best = vB.y; id = ${ ID.HAND }.0; }
		if ( vB.z < best ) { best = vB.z; id = ${ ID.EAR }.0; }
		if ( ( id == ${ ID.TORSO }.0 || id == ${ ID.HEAD }.0 ) && vC.x > 0.0 ) id = ${ ID.BELLY }.0;
		#endif
		vec3 alb = uAlbedo;
		#ifdef USE_COLOR
		alb = vCol;
		#endif
		vec3 n = normalize( vN );
		if ( ! gl_FrontFacing ) n = - n;
		float lambert = max( dot( n, normalize( uLight ) ), 0.0 );
		gl_FragColor = vec4( id, dot( alb, vec3( 0.299, 0.587, 0.114 ) ), lambert, 1.0 );
	}`;

// Key light in view space: from the upper left, slightly in front.
export const KEY_LIGHT = new THREE.Vector3( - 0.45, 0.75, 0.55 ).normalize();

function passMaterials( id, albedo, { zones = false, vertexColors = false, side = THREE.FrontSide } = {} ) {

	const defines = {};
	if ( zones ) defines.ZONES = '';
	return {
		geom: new THREE.ShaderMaterial( { vertexShader: GEOM_VS, fragmentShader: GEOM_FS, side } ),
		mat: new THREE.ShaderMaterial( {
			vertexShader: MAT_VS, fragmentShader: MAT_FS, defines, vertexColors, side,
			uniforms: { uId: { value: id }, uAlbedo: { value: new THREE.Vector3( ...albedo ) }, uLight: { value: KEY_LIGHT } }
		} )
	};

}

function addMesh( parent, geometry, beauty, id, albedo, opts = {} ) {

	const mesh = new THREE.Mesh( geometry, beauty );
	mesh.userData.beauty = beauty;
	mesh.userData.passes = passMaterials( id, albedo, opts );
	mesh.userData.id = id;
	parent.add( mesh );
	return mesh;

}

const std = ( c, extra = {} ) => new THREE.MeshStandardMaterial( { color: new THREE.Color( ...c ), roughness: 0.85, ...extra } );

// ---------------------------------------------------------------------------------------------

export function buildSquirrel( { resolution = 128 } = {} ) {

	const group = new THREE.Group();
	group.name = 'squirrel';
	const timings = {};

	let t = performance.now();
	const body = bodyModel();
	const bodyGeo = meshFromSDF( body.sdf, body.box, resolution );
	decorateBody( bodyGeo, body );
	addMesh( group, bodyGeo, new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.9 } ),
		ID.TORSO, COLOR.fur, { zones: true, vertexColors: true } ).name = 'body';
	timings.body = performance.now() - t;

	t = performance.now();
	const tail = tailModel();
	const tailGeo = meshFromSDF( tail.sdf, tail.box, resolution );
	addMesh( group, tailGeo, std( COLOR.tail, { roughness: 1 } ), ID.TAIL, COLOR.tail ).name = 'tail';
	group.userData.tailSamples = tail.samples;
	timings.tail = performance.now() - t;

	const e = POSE.eye;
	for ( const s of [ 1, - 1 ] ) {

		const eye = addMesh( group, new THREE.SphereGeometry( e.r, 32, 16 ), std( COLOR.eye, { roughness: 0.15 } ), ID.EYE, COLOR.eye );
		eye.position.set( e.x, e.y, s * e.z );
		const glint = new THREE.Mesh( new THREE.SphereGeometry( e.r * 0.28, 12, 8 ), new THREE.MeshBasicMaterial( { color: 0xffffff } ) );
		glint.position.set( e.x + 0.18, e.y + 0.22, s * ( e.z + e.r * 0.82 ) );
		glint.userData.beautyOnly = true;
		group.add( glint );

	}

	const nz = POSE.nose;
	addMesh( group, new THREE.SphereGeometry( nz.r, 24, 12 ), std( COLOR.nose, { roughness: 0.4 } ), ID.NOSE, COLOR.nose )
		.position.set( nz.x, nz.y, nz.z );

	for ( const tuft of POSE.tufts ) {

		for ( const s of [ 1, - 1 ] ) {

			const a = new THREE.Vector3( tuft.base[ 0 ], tuft.base[ 1 ], s * tuft.base[ 2 ] );
			const b = new THREE.Vector3( tuft.tip[ 0 ], tuft.tip[ 1 ], s * tuft.tip[ 2 ] );
			const len = a.distanceTo( b );
			const cone = addMesh( group, new THREE.ConeGeometry( tuft.r, len, 16 ), std( COLOR.tuft ), ID.TUFT, COLOR.tuft );
			cone.position.copy( a ).lerp( b, 0.5 );
			cone.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), b.clone().sub( a ).normalize() );

		}

	}

	for ( const w of POSE.whiskers ) {

		for ( const s of [ 1, - 1 ] ) {

			const a = new THREE.Vector3( w.base[ 0 ], w.base[ 1 ], s * w.base[ 2 ] );
			const b = new THREE.Vector3( w.tip[ 0 ], w.tip[ 1 ], s * w.tip[ 2 ] );
			const hair = new THREE.Mesh( new THREE.CylinderGeometry( 0.025, 0.04, a.distanceTo( b ), 6 ), new THREE.MeshBasicMaterial( { color: 0x3a2a20 } ) );
			hair.position.copy( a ).lerp( b, 0.5 );
			hair.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), b.clone().sub( a ).normalize() );
			hair.userData.beautyOnly = true;
			group.add( hair );

		}

	}

	group.userData.whiskers = POSE.whiskers.map( ( w ) => [ new THREE.Vector3( ...w.base ), new THREE.Vector3( ...w.tip ) ] );
	group.userData.tufts = POSE.tufts.flatMap( ( t ) => [ 1, - 1 ].map( ( s ) => [
		new THREE.Vector3( t.base[ 0 ], t.base[ 1 ], s * t.base[ 2 ] ), new THREE.Vector3( t.tip[ 0 ], t.tip[ 1 ], s * t.tip[ 2 ] ) ] ) );
	group.userData.timings = timings;
	return group;

}

// The Stange: one stack of equal-radius cylinders (thick glass base, beer, foam, empty rim) so the
// G-buffer sees the glass contents directly, plus a transparent shell that only the preview renders.
export function buildStange() {

	const g = POSE.glass;
	const group = new THREE.Group();
	group.name = 'stange';
	group.position.set( g.x, 0, g.z );

	const top = g.y0 + g.height;
	const foamBottom = top - g.foamDepth;
	const seg = ( y0, y1, id, albedo, beauty, opts = {} ) => {

		const geo = new THREE.CylinderGeometry( g.radius, g.radius, y1 - y0, 64, 1, opts.open ?? false );
		const m = addMesh( group, geo, beauty, id, albedo, opts );
		m.position.y = ( y0 + y1 ) / 2;
		return m;

	};

	seg( g.y0, g.y0 + g.base, ID.GLASS_BASE, COLOR.glass, std( COLOR.glass, { roughness: 0.1, transparent: true, opacity: 0.6 } ) );
	seg( g.y0 + g.base, foamBottom, ID.BEER, COLOR.beer, std( COLOR.beer, { roughness: 0.25, emissive: new THREE.Color( 0.25, 0.14, 0.0 ) } ) );
	const foamMat = std( COLOR.foam, { roughness: 1 } );
	seg( foamBottom, top, ID.FOAM, COLOR.foam, foamMat );

	// Foam crown bulging over the rim.
	const crown = addMesh( group, new THREE.SphereGeometry( g.radius, 64, 16, 0, Math.PI * 2, 0, Math.PI / 2 ), foamMat, ID.FOAM, COLOR.foam );
	crown.position.y = top;
	crown.scale.y = g.crown / g.radius;

	const shell = new THREE.Mesh(
		new THREE.CylinderGeometry( g.radius * 1.04, g.radius * 1.04, g.height, 64, 1, true ),
		new THREE.MeshPhysicalMaterial( { color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.18, side: THREE.DoubleSide } ) );
	shell.position.y = g.y0 + g.height / 2;
	shell.userData.beautyOnly = true;
	group.add( shell );

	return group;

}

export function buildScene( opts = {} ) {

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0xf4f1ea );

	const squirrel = buildSquirrel( opts );
	scene.add( squirrel );
	scene.add( buildStange() );

	const hemi = new THREE.HemisphereLight( 0xfff6e8, 0x8a7a66, 1.6 );
	hemi.userData.beautyOnly = true;
	scene.add( hemi );
	const sun = new THREE.DirectionalLight( 0xffffff, 2.4 );
	sun.position.set( - 6, 14, 10 );
	sun.userData.beautyOnly = true;
	scene.add( sun );

	return { scene, squirrel, timings: squirrel.userData.timings };

}
