// Opens final/gmail.html from disk (as the user would), screenshots mono + colour + Prost variants,
// and verifies the copied HTML keeps every column.
import { chromium } from 'playwright';
import path from 'node:path';

const browser = await chromium.launch();
const ctx = await browser.newContext( { deviceScaleFactor: 1.5, permissions: [ 'clipboard-read', 'clipboard-write' ] } );
const page = await ctx.newPage();
await page.goto( 'file://' + path.resolve( 'final/gmail.html' ) );
const shot = async ( name ) => page.locator( '.mail' ).screenshot( { path: `out/${ name }.png` } );
await shot( 'gmail-mono' );
await page.check( '#colour' );
await shot( 'gmail-colour' );
await page.check( '#prost' );
await shot( 'gmail-colour-prost' );
await page.uncheck( '#colour' );

// Round-trip: the HTML put on the clipboard must reproduce the text exactly (all four variants).
const roundTrip = await page.evaluate( () => {

	const results = {};
	for ( const prost of [ false, true ] ) for ( const colour of [ false, true ] ) {

		document.getElementById( 'prost' ).checked = prost;
		document.getElementById( 'colour' ).checked = colour;
		const div = document.createElement( 'div' );
		div.innerHTML = html();
		document.body.appendChild( div );
		const text = div.innerText.replace( / /g, ' ' );
		div.remove();
		results[ `prost=${ prost } colour=${ colour }` ] = text === current().lines.join( '\n' );

	}

	document.getElementById( 'prost' ).checked = false;
	return results;

} );
console.log( roundTrip );
await page.click( '#copy' );
await page.waitForFunction( () => document.getElementById( 'status' ).textContent !== '' );
console.log( 'status:', await page.textContent( '#status' ) );
const clip = await page.evaluate( async () => {

	const items = await navigator.clipboard.read();
	const out = {};
	for ( const item of items ) for ( const t of item.types ) out[ t ] = ( await ( await item.getType( t ) ).text() ).slice( 0, 160 );
	return out;

} );
console.log( 'clipboard:', clip );
await browser.close();
