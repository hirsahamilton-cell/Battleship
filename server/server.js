/* Serves the static game and hosts the multiplayer WebSocket hub.
   Run with: node server/server.js  (PORT env var, default 8080) */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const { Hub } = require('./rooms.js');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const PUBLIC_FILES = new Set([
  'index.html',
  'styles.css',
  ...fs.readdirSync(path.join(ROOT, 'js')).filter((name) => name.endsWith('.js')).map((name) => `js/${name}`),
]);

function resolveStatic(urlPath) {
  let relative;
  try {
    relative = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  } catch (err) {
    return null;
  }
  if (relative === '') relative = 'index.html';
  return PUBLIC_FILES.has(relative) ? path.join(ROOT, relative) : null;
}

const server = http.createServer((req, res) => {
  const file = resolveStatic(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const hub = new Hub();
const wss = new WebSocketServer({ server, maxPayload: 4 * 1024 });

wss.on('connection', (socket) => {
  const client = hub.connect((message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  });
  socket.on('message', (data) => hub.handle(client, data.toString()));
  socket.on('close', () => hub.disconnect(client));
  socket.on('error', () => hub.disconnect(client));
});

server.listen(PORT, () => {
  console.log(`Battleship running on http://localhost:${PORT}`);
});
