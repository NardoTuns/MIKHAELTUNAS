// Server statis lokal untuk mencoba aplikasi di komputer (service worker butuh http://localhost).
// Pakai: node tools/serve.mjs [port]   → buka http://localhost:8080
// Juga menyediakan Code.gs tiruan di /gas/exec (data hanya di memori) untuk uji tanpa Google.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeEnv } from './gas-mock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

/** overrides: Map<path, string> untuk menyimulasikan rilis baru tanpa mengubah file. */
export function createServer({ gas = makeEnv({}, { realTime: true, ai: true }), overrides = new Map(), log = false } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/gas/exec') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') { res.end(gas.getRaw(Object.fromEntries(url.searchParams))); return; }
      let body = '';
      for await (const c of req) body += c;
      res.end(gas.postRaw(body));
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const rel = normalize(p).replace(/^[\\/]+/, '');
    if (rel.startsWith('..')) { res.writeHead(403).end(); return; }
    try {
      const key = rel.split('\\').join('/');
      const data = overrides.has(key) ? Buffer.from(overrides.get(key)) : await readFile(join(ROOT, rel));
      res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
      if (log) console.log(200, req.url);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Tidak ditemukan');
    }
  });
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.closeNow = () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(r); });
  server.gas = gas;
  server.overrides = overrides;
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2]) || 8080;
  createServer({ log: false }).listen(port, '127.0.0.1', () => {
    console.log(`Catat Makan berjalan di http://localhost:${port}`);
    console.log(`Code.gs tiruan (untuk uji): http://localhost:${port}/gas/exec`);
  });
}
