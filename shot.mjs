// Screenshot text files as they would look in a monospace mail: node shot.mjs a.txt [b.txt ...]
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const server = await startServer( 0 );
const browser = await chromium.launch();
const page = await browser.newPage( { deviceScaleFactor: 1.5 } );
for ( const file of process.argv.slice( 2 ) ) {

	await page.goto( `http://127.0.0.1:${ server.address().port }/preview.html?file=${ encodeURIComponent( file ) }` );
	await page.waitForFunction( () => window.__ready === true );
	const out = file.replace( /\.txt$/, '' ) + '.png';
	await page.locator( '#art' ).screenshot( { path: out } );
	console.log( out );

}

await browser.close();
server.close();
