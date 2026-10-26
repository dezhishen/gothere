import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.md':'text/plain; charset=utf-8' };

export function makeServer({ portableOnly = false } = {}) {
  return createServer(async (request, response) => {
    const send = (code, body) => { response.writeHead(code, { 'Content-Type':'text/plain; charset=utf-8' }); response.end(body); };
    if (!['GET','HEAD'].includes(request.method)) { send(405, 'Method not allowed'); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (portableOnly || pathname === '/play.html') {
        if (!['/', '/index.html', '/play.html'].includes(pathname)) { send(404, 'Not found'); return; }
        const html = await readFile(resolve(ROOT, 'dist/gothere-play.html'));
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
          ...(pathname === '/play.html' ? { 'Content-Disposition': 'attachment; filename="gothere-play.html"' } : {}),
        });
        response.end(request.method === 'HEAD' ? undefined : html);
        return;
      }
      const allowed = pathname === '/' || pathname === '/index.html' || pathname === '/favicon.svg' || pathname === '/project.md' || pathname.startsWith('/src/');
      if (!allowed || pathname.includes('\\') || pathname.includes('\0')) { send(404, 'Not found'); return; }
      const file = await realpath(resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname)));
      const rel = relative(ROOT, file);
      if (rel.startsWith('..' + sep) || rel === '..' || resolve(ROOT, rel) !== file || !(await stat(file)).isFile()) { send(404, 'Not found'); return; }
      response.writeHead(200, { 'Content-Type':MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'" });
      response.end(request.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) {
      if (['ENOENT','ENOTDIR','URIError'].includes(error.code ?? error.name)) send(404, 'Not found');
      else { console.error('Request failed:', error.message); if (!response.headersSent) send(500, 'Server error'); else response.end(); }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const server = makeServer();
  server.on('error', (error) => { console.error('Cannot start preview:', error.message); process.exitCode = 1; });
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
    console.log('Gothere is ready: http://localhost:' + port);
    for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? [])
      if (address.family === 'IPv4' && !address.internal) console.log('Same-network mobile preview: http://' + address.address + ':' + port);
  });
}
