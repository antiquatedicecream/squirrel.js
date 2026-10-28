// Minimal static server: ES modules and the import map need http://, not file://.
// Usage: node serve.mjs [port]  ->  http://127.0.0.1:8137/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname( fileURLToPath( import.meta.url ) );
const types = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css'
};

export function startServer( port = 8137 ) {

	const server = http.createServer( ( req, res ) => {

		let file = path.join( root, decodeURIComponent( new URL( req.url, 'http://x' ).pathname ) );
		if ( ! file.startsWith( root ) ) return res.writeHead( 403 ).end();
		if ( fs.existsSync( file ) && fs.statSync( file ).isDirectory() ) file = path.join( file, 'index.html' );
		fs.readFile( file, ( err, data ) => {

			if ( err ) return res.writeHead( 404 ).end( 'not found' );
			res.writeHead( 200, { 'Content-Type': types[ path.extname( file ) ] ?? 'application/octet-stream', 'Cache-Control': 'no-store' } );
			res.end( data );

		} );

	} );
	return new Promise( ( resolve ) => server.listen( port, '127.0.0.1', () => resolve( server ) ) );

}

if ( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) {

	const port = Number( process.argv[ 2 ] ?? 8137 );
	await startServer( port );
	console.log( `Squirrel preview: http://127.0.0.1:${ port }/` );

}
