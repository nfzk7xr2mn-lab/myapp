const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { spawn } = require('child_process');

const PORT    = 9001;
const APP_DIR = __dirname;

const ALLOWED = new Set(['actions.json', 'actions.txt', 'learn.txt', 'termine.txt', 'links.json', 'lernplan_progress.json', 'sport.json', 'notizen.json']);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Modal lock: state=1 → lock schreiben, state=0 → lock löschen
  if (req.method === 'POST' && req.url.startsWith('/modal-lock')) {
    const state = new URL(req.url, 'http://localhost').searchParams.get('state');
    const lockPath = path.join('C:\\Temp', 'myapp-modal.lock');
    if (state === '1') {
      fs.writeFile(lockPath, '', () => { res.writeHead(200); res.end('locked'); });
    } else {
      fs.unlink(lockPath, () => { res.writeHead(200); res.end('unlocked'); });
    }
    return;
  }

  // Trigger summarize_mails.ps1
  if (req.method === 'POST' && req.url === '/run-summarize') {
    const ps = spawn('powershell.exe', [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'summarize_mails.ps1')
    ]);
    ps.on('close', code => {
      if (code === 0) { res.writeHead(200); res.end('OK'); }
      else            { res.writeHead(500); res.end(`Exit code ${code}`); }
    });
    ps.on('error', err => { res.writeHead(500); res.end(err.message); });
    return;
  }

  // Trigger export_outlook_mails.ps1
  if (req.method === 'POST' && req.url === '/run-export-mails') {
    const ps = spawn('powershell.exe', [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'export_outlook_mails.ps1')
    ]);
    ps.on('close', code => {
      if (code === 0) { res.writeHead(200); res.end('OK'); }
      else            { res.writeHead(500); res.end(`Exit code ${code}`); }
    });
    ps.on('error', err => { res.writeHead(500); res.end(err.message); });
    return;
  }

  if (req.method !== 'PUT') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }

  const filename = path.basename(req.url.replace(/^\//, ''));
  if (!ALLOWED.has(filename)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const subdir   = ['links.json', 'lernplan_progress.json', 'sport.json'].includes(filename) ? 'Wissen'
                 : ['actions.json','actions.txt','learn.txt','termine.txt','notizen.json'].includes(filename) ? 'Daten'
                 : '';
  const filePath = subdir ? path.join(APP_DIR, subdir, filename) : path.join(APP_DIR, filename);
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
