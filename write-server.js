// Local write server – allows the dashboard to save actions.txt, learn.txt, termine.txt
// Runs on http://localhost:9001
// Start: node write-server.js  (or via start-servers.ps1)

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = 9001;
const APP_DIR = __dirname;

// Only these files may be written
const ALLOWED = new Set(['actions.txt', 'learn.txt', 'termine.txt', 'links.txt']);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method !== 'PUT') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }

  const filename = path.basename(req.url.replace(/^\//, ''));
  if (!ALLOWED.has(filename)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const filePath = path.join(APP_DIR, filename);
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    fs.writeFile(filePath, body, 'utf8', err => {
      if (err) { res.writeHead(500); res.end('Write error'); return; }
      res.writeHead(200); res.end('OK');
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Write server running on http://127.0.0.1:${PORT}`);
});
