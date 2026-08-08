// Production static server for the built game (Railway et al.).
// Zero dependencies: serves apps/game/dist on 0.0.0.0:$PORT with an SPA
// fallback. HTML is never cached; hashed/static assets get a short TTL.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    let filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext && ext !== '.html') {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      filePath = path.join(root, 'index.html'); // SPA fallback
    }
    const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'cache-control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=300',
    });
    createReadStream(filePath)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch {
    res.writeHead(500).end();
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`ReadQuest serving ${root} on :${port}`);
});
