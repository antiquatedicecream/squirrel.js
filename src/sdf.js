// Signed-distance primitives (after Inigo Quilez, https://iquilezles.org/articles/distfunctions/).
// Every primitive returns a closure (x, y, z) => distance, so the model can be written as plain
// function composition and evaluated millions of times by the MarchingCubes field fill.

export function smin( a, b, k ) {

	if ( k <= 0 ) return Math.min( a, b );
	const h = Math.max( k - Math.abs( a - b ), 0 ) / k;
	return Math.min( a, b ) - h * h * k * 0.25;

}

// Inverse rotation (world -> local) for R = Rz * Ry * Rx, stored row-major.
export function frame( cx, cy, cz, rx = 0, ry = 0, rz = 0 ) {

	const cX = Math.cos( rx ), sX = Math.sin( rx );
	const cY = Math.cos( ry ), sY = Math.sin( ry );
	const cZ = Math.cos( rz ), sZ = Math.sin( rz );

	// R = Rz * Ry * Rx
	const r00 = cZ * cY, r01 = cZ * sY * sX - sZ * cX, r02 = cZ * sY * cX + sZ * sX;
	const r10 = sZ * cY, r11 = sZ * sY * sX + cZ * cX, r12 = sZ * sY * cX - cZ * sX;
	const r20 = - sY, r21 = cY * sX, r22 = cY * cX;

	// local = R^T * (p - c)
	return { cx, cy, cz, m: [ r00, r10, r20, r01, r11, r21, r02, r12, r22 ] };

}

export function sphere( cx, cy, cz, r ) {

	return ( x, y, z ) => {

		const dx = x - cx, dy = y - cy, dz = z - cz;
		return Math.sqrt( dx * dx + dy * dy + dz * dz ) - r;

	};

}

export function ellipsoid( f, rx, ry, rz ) {

	const { cx, cy, cz, m } = f;
	return ( x, y, z ) => {

		const dx = x - cx, dy = y - cy, dz = z - cz;
		const lx = m[ 0 ] * dx + m[ 1 ] * dy + m[ 2 ] * dz;
		const ly = m[ 3 ] * dx + m[ 4 ] * dy + m[ 5 ] * dz;
		const lz = m[ 6 ] * dx + m[ 7 ] * dy + m[ 8 ] * dz;
		const ax = lx / rx, ay = ly / ry, az = lz / rz;
		const bx = ax / rx, by = ay / ry, bz = az / rz;
		const k0 = Math.sqrt( ax * ax + ay * ay + az * az );
		const k1 = Math.sqrt( bx * bx + by * by + bz * bz );
		return k1 === 0 ? - Math.min( rx, ry, rz ) : k0 * ( k0 - 1 ) / k1;

	};

}

// Capsule with different end radii (r1 at a, r2 at b).
export function roundCone( a, b, r1, r2 ) {

	const [ ax, ay, az ] = a;
	const bax = b[ 0 ] - ax, bay = b[ 1 ] - ay, baz = b[ 2 ] - az;
	const l2 = bax * bax + bay * bay + baz * baz;
	const rr = r1 - r2;
	const a2 = l2 - rr * rr;
	const il2 = 1 / l2;
	const srr = Math.sign( rr ) * rr * rr;

	return ( x, y, z ) => {

		const pax = x - ax, pay = y - ay, paz = z - az;
		const py = pax * bax + pay * bay + paz * baz;
		const pz = py - l2;
		const qx = pax * l2 - bax * py, qy = pay * l2 - bay * py, qz = paz * l2 - baz * py;
		const x2 = qx * qx + qy * qy + qz * qz;
		const y2 = py * py * l2;
		const z2 = pz * pz * l2;
		const k = srr * x2;
		if ( Math.sign( pz ) * a2 * z2 > k ) return Math.sqrt( x2 + z2 ) * il2 - r2;
		if ( Math.sign( py ) * a2 * y2 < k ) return Math.sqrt( x2 + y2 ) * il2 - r1;
		return ( Math.sqrt( x2 * a2 * il2 ) + py * rr ) * il2 - r1;

	};

}

// Union of round cones along a Catmull-Rom curve through [x, y, z, r] control points.
export function tube( points, samplesPerSpan = 8 ) {

	const pts = sampleCurve( points, samplesPerSpan );
	const parts = [];
	for ( let i = 0; i < pts.length - 1; i ++ ) {

		const p = pts[ i ], q = pts[ i + 1 ];
		parts.push( roundCone( p, q, p[ 3 ], q[ 3 ] ) );

	}

	const sdf = ( x, y, z ) => {

		let d = Infinity;
		for ( let i = 0; i < parts.length; i ++ ) {

			const di = parts[ i ]( x, y, z );
			if ( di < d ) d = di;

		}

		return d;

	};

	sdf.samples = pts;
	return sdf;

}

export function sampleCurve( points, samplesPerSpan ) {

	const out = [];
	const n = points.length;
	for ( let i = 0; i < n - 1; i ++ ) {

		const p0 = points[ Math.max( i - 1, 0 ) ], p1 = points[ i ];
		const p2 = points[ i + 1 ], p3 = points[ Math.min( i + 2, n - 1 ) ];
		for ( let s = 0; s < samplesPerSpan; s ++ ) {

			const t = s / samplesPerSpan, t2 = t * t, t3 = t2 * t;
			const v = [ 0, 0, 0, 0 ];
			for ( let c = 0; c < 4; c ++ ) {

				v[ c ] = 0.5 * ( 2 * p1[ c ] + ( - p0[ c ] + p2[ c ] ) * t +
					( 2 * p0[ c ] - 5 * p1[ c ] + 4 * p2[ c ] - p3[ c ] ) * t2 +
					( - p0[ c ] + 3 * p1[ c ] - 3 * p2[ c ] + p3[ c ] ) * t3 );

			}

			out.push( v );

		}

	}

	out.push( points[ n - 1 ].slice() );
	return out;

}

// Smooth 3D value noise in [-1, 1].
function hash( i, j, k ) {

	let n = ( Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( k, 1274126177 ) ) | 0;
	n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
	return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 2147483647.5 - 1;

}

export function noise3( x, y, z ) {

	const ix = Math.floor( x ), iy = Math.floor( y ), iz = Math.floor( z );
	const fx = x - ix, fy = y - iy, fz = z - iz;
	const ux = fx * fx * ( 3 - 2 * fx ), uy = fy * fy * ( 3 - 2 * fy ), uz = fz * fz * ( 3 - 2 * fz );
	const lerp = ( a, b, t ) => a + ( b - a ) * t;
	const x00 = lerp( hash( ix, iy, iz ), hash( ix + 1, iy, iz ), ux );
	const x10 = lerp( hash( ix, iy + 1, iz ), hash( ix + 1, iy + 1, iz ), ux );
	const x01 = lerp( hash( ix, iy, iz + 1 ), hash( ix + 1, iy, iz + 1 ), ux );
	const x11 = lerp( hash( ix, iy + 1, iz + 1 ), hash( ix + 1, iy + 1, iz + 1 ), ux );
	return lerp( lerp( x00, x10, uy ), lerp( x01, x11, uy ), uz );

}
