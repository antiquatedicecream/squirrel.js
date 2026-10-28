import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene } from './squirrel.js';
import { sceneToAscii, toGmailHTML } from './ascii.js';
import { makeStyle } from './style.js';

const params = new URLSearchParams( location.search );
const state = {
	cols: Number( params.get( 'cols' ) ?? 64 ),
	azimuth: Number( params.get( 'az' ) ?? 0 ),
	elevation: Number( params.get( 'el' ) ?? 0.1 ),
	resolution: Number( params.get( 'res' ) ?? 128 )
};

const view = document.getElementById( 'view' );
const out = document.getElementById( 'ascii' );
const status = document.getElementById( 'status' );

const renderer = new THREE.WebGLRenderer( { antialias: true, preserveDrawingBuffer: true } );
renderer.setPixelRatio( 1 );
renderer.setSize( view.clientWidth, view.clientHeight );
view.appendChild( renderer.domElement );

const { scene, timings } = buildScene( { resolution: state.resolution } );

const target = new THREE.Vector3( - 2, 12.5, 0 );
const camera = new THREE.PerspectiveCamera( 30, view.clientWidth / view.clientHeight, 1, 500 );
const dirFromAngles = ( az, el ) => new THREE.Vector3( - Math.sin( az ) * Math.cos( el ), - Math.sin( el ), - Math.cos( az ) * Math.cos( el ) );
camera.position.copy( target ).addScaledVector( dirFromAngles( state.azimuth, state.elevation ), - 70 );
camera.lookAt( target );

const controls = new OrbitControls( camera, renderer.domElement );
controls.target.copy( target );
controls.update();
controls.addEventListener( 'change', () => renderer.render( scene, camera ) );
renderer.render( scene, camera );

let last = null;

function renderAscii( { style, ...opts } = {} ) {

	const dir = target.clone().sub( camera.position ).normalize();
	last = sceneToAscii( renderer, scene, dir, { cols: state.cols, ...opts, style: makeStyle( style ) } );
	out.textContent = last.text;
	status.textContent = `${ last.lines.length } lines × ${ Math.max( ...last.lines.map( ( l ) => l.length ) ) } columns · ` +
		`mesh ${ timings.body.toFixed( 0 ) }+${ timings.tail.toFixed( 0 ) } ms · ascii ${ ( last.timings.gbuffer + last.timings.convert ).toFixed( 0 ) } ms`;
	renderer.render( scene, camera );
	return last;

}

async function copyForGmail() {

	const html = toGmailHTML( last.lines );
	await navigator.clipboard.write( [ new ClipboardItem( {
		'text/html': new Blob( [ html ], { type: 'text/html' } ),
		'text/plain': new Blob( [ last.text ], { type: 'text/plain' } )
	} ) ] );
	status.textContent = 'Copied as monospace HTML. Paste into Gmail with Cmd+V.';

}

document.getElementById( 'render' ).onclick = () => renderAscii();
document.getElementById( 'copy-gmail' ).onclick = copyForGmail;
document.getElementById( 'copy-text' ).onclick = async () => {

	await navigator.clipboard.writeText( last.text );
	status.textContent = 'Copied as plain text. In Gmail, select it and choose the "Fixed width" font.';

};

const colsInput = document.getElementById( 'cols' );
colsInput.value = state.cols;
colsInput.onchange = () => { state.cols = Number( colsInput.value ); renderAscii(); };

renderAscii();

// Hooks for the headless runner (run.mjs).
window.app = {
	state, scene, renderer, camera, controls, timings,
	renderAscii,
	setView( az, el ) {

		camera.position.copy( target ).addScaledVector( dirFromAngles( az, el ), - 70 );
		camera.lookAt( target );
		controls.update();
		renderer.render( scene, camera );

	},
	beautyPNG() {

		renderer.render( scene, camera );
		return renderer.domElement.toDataURL( 'image/png' );

	},
	contourPNG() {

		const { G, E } = last, c = document.createElement( 'canvas' );
		c.width = G.W; c.height = G.H;
		const ctx = c.getContext( '2d' ), img = ctx.createImageData( G.W, G.H );
		const palette = [ [ 255, 255, 255 ], [ 196, 98, 45 ], [ 240, 226, 200 ], [ 214, 120, 60 ], [ 170, 80, 40 ], [ 140, 70, 30 ],
			[ 230, 150, 90 ], [ 120, 60, 25 ], [ 200, 110, 70 ], [ 60, 30, 10 ], [ 0, 0, 0 ], [ 40, 20, 20 ], [ 150, 75, 30 ],
			[ 200, 220, 230 ], [ 240, 180, 60 ], [ 250, 250, 240 ], [ 220, 235, 240 ], [ 180, 180, 180 ] ];
		for ( let i = 0; i < G.W * G.H; i ++ ) {

			const col = E[ i ] ? [ 0, 0, 255 ] : palette[ G.id[ i ] ] ?? [ 255, 0, 255 ];
			img.data.set( [ ...col, 255 ], i * 4 );

		}

		ctx.putImageData( img, 0, 0 );
		return c.toDataURL( 'image/png' );

	}
};
window.__ready = true;
