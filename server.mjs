import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// Static preview + optional multi-screen relay (SSE).
// Usage: npm run dev  →  http://127.0.0.1:5178/
const root = process.cwd();
const port = Number(process.env.PORT || 5178);
const host = process.env.HOST || '0.0.0.0';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const syncClients = new Set();

function sseWrite(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    syncClients.delete(res);
  }
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/sync/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, clients: syncClients.size }));
    return;
  }

  if (p === '/api/sync/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    syncClients.add(res);
    res.on('close', () => syncClients.delete(res));
    return;
  }

  if (p === '/api/sync/publish' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (msg && typeof msg === 'object') {
          for (const client of syncClients) sseWrite(client, msg);
        }
      } catch { /* ignore malformed */ }
      res.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    });
    return;
  }

  let target = p === '/' ? '/dist/index.html' : p === '/console' ? '/dist/console.html' : p;
  const file = path.resolve(root, '.' + target);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  serveFile(res, file);
});

setInterval(() => {
  for (const client of syncClients) {
    try { client.write(': ping\n\n'); } catch { syncClients.delete(client); }
  }
}, 15000).unref();

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

server.listen(port, host, () => {
  console.log(`ATLAS preview:    http://127.0.0.1:${port}/`);
  console.log(`ATLAS console:    http://127.0.0.1:${port}/console`);
  console.log(`Sync relay:       http://127.0.0.1:${port}/api/sync/events`);
  const lan = lanAddress();
  if (lan && host === '0.0.0.0') {
    console.log(`LAN (multi-screen): http://${lan}:${port}/  ·  http://${lan}:${port}/console`);
  }
});
