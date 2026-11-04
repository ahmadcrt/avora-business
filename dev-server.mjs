#!/usr/bin/env node
// Tiny static server for local previews of dist/. Usage: npm run build && npm run dev
// Build with AVORA_BASE_PATH=/ for local use. Binds to localhost only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = normalize(join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(await readFile(join(root, '404.html')).catch(() => 'Not found'));
  }
}).listen(port, '127.0.0.1', () => console.log(`Serving dist/ at http://127.0.0.1:${port}/`));
