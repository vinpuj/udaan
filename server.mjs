import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler, securityHeaders } from './api-handler.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root, '.env')); } catch {}
const port = Number(process.env.PORT) || 4317;
const host = process.env.HOST || '127.0.0.1';
const publicRoot = path.join(root, 'public');
const api = createApiHandler();
const mime = {
  '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf'
};
http.createServer(async (req, res) => {
  for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(publicRoot, '.' + rel);
    if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, host, () => console.log('Udaan is ready at http://' + host + ':' + port));
