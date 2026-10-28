// Headless render: prints the ASCII art and writes out/ascii.txt, out/beauty.png, out/contours.png.
// Usage: node run.mjs [--cols 64] [--az 0] [--el 0.1] [--res 128] [--opts '{"style":{"tailDensity":0.5}}']
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const args = Object.fromEntries( process.argv.slice( 2 ).reduce( ( acc, a, i, all ) => {

	if ( a.startsWith( '--' ) ) acc.push( [ a.slice( 2 ), all[ i + 1 ] ] );
	return acc;

}, [] ) );

const server = await startServer( 0 );
const port = server.address().port;
const browser = await chromium.launch( { args: [ '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 1500, height: 900 } } );
page.on( 'console', ( m ) => { if ( m.type() === 'error' || m.type() === 'warning' ) console.error( '[page]', m.text() ); } );
page.on( 'pageerror', ( e ) => console.error( '[pageerror]', e.message ) );

const qs = new URLSearchParams( { cols: args.cols ?? 64, az: args.az ?? 0, el: args.el ?? 0.1, res: args.res ?? 128 } );
await page.goto( `http://127.0.0.1:${ port }/index.html?${ qs }` );
await page.waitForFunction( () => window.__ready === true, null, { timeout: 180000 } );

if ( args.eval ) {

	console.log( JSON.stringify( await page.evaluate( args.eval ), null, 1 ) );
	await browser.close();
	server.close();
	process.exit( 0 );

}

if ( args.variants ) {

	fs.mkdirSync( 'out', { recursive: true } );
	for ( const [ i, v ] of JSON.parse( args.variants ).entries() ) {

		const text = await page.evaluate( ( o ) => window.app.renderAscii( o ).text, v );
		await page.locator( '#ascii' ).screenshot( { path: `out/variant-${ i }.png` } );
		console.log( '=== ' + i + ' ' + JSON.stringify( v ) + '\n' + text + '\n' );

	}

}

const opts = args.opts ? JSON.parse( args.opts ) : {};
const result = await page.evaluate( ( o ) => {

	const r = window.app.renderAscii( o );
	// Zone letter per character cell, trimmed exactly like the ASCII (polish/colour step uses it).
	const letters = ' tbhqfapeu@nTByw';
	const rows = r.chars.map( ( l ) => l.join( '' ).replace( /\s+$/, '' ) );
	let top = 0; while ( ! rows[ top ] ) top ++;
	let bottom = rows.length - 1; while ( ! rows[ bottom ] ) bottom --;
	const indent = Math.min( ...rows.slice( top, bottom + 1 ).filter( ( l ) => l ).map( ( l ) => l.match( /^ */ )[ 0 ].length ) );
	const zones = r.cellIds.slice( top, bottom + 1 ).map( ( l ) => l.slice( indent ).map( ( k ) => letters[ k ] ?? '?' ).join( '' ).replace( /\s+$/, '' ) );
	return { text: r.text, zones, timings: { ...window.app.timings, ...r.timings } };

}, opts );

fs.mkdirSync( 'out', { recursive: true } );
fs.writeFileSync( 'out/ascii.txt', result.text + '\n' );
fs.writeFileSync( 'out/zones.txt', result.zones.join( '\n' ) + '\n' );
const save = ( name, dataUrl ) => fs.writeFileSync( `out/${ name }`, Buffer.from( dataUrl.split( ',' )[ 1 ], 'base64' ) );
save( 'beauty.png', await page.evaluate( () => window.app.beautyPNG() ) );
save( 'contours.png', await page.evaluate( () => window.app.contourPNG() ) );
await page.locator( '#ascii' ).screenshot( { path: 'out/ascii.png' } );
if ( args.shot ) await page.screenshot( { path: 'out/page.png', fullPage: true } );

console.log( result.text );
console.error( JSON.stringify( result.timings ) );
await browser.close();
server.close();
