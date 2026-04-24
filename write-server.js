const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { spawn, execFile, exec } = require('child_process');

const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

const PORT    = 9001;
const APP_DIR = __dirname;

const lastRun = {};
function rateLimit(key, cooldownMs, res) {
  const now = Date.now();
  if (lastRun[key] && now - lastRun[key] < cooldownMs) {
    res.writeHead(429); res.end('Too Many Requests');
    return true;
  }
  lastRun[key] = now;
  return false;
}

const ALLOWED = new Set(['actions.json', 'learn.txt', 'termine.txt', 'links.json', 'learningplan_progress.json', 'sport.json', 'notes.json', 'contacts.json', 'quotes.json', 'news.json', 'jira.json', 'jira_status.json', 'jira_toolset.json', 'videos.json']);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5500');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200); res.end('ok'); return;
  }

  // Open URL in system default browser (bypasses Chrome App mode)
  if (req.method === 'POST' && req.url === '/open-url') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { url } = JSON.parse(body);
        let parsed;
        try { parsed = new URL(url); } catch(_) { parsed = null; }
        if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
          exec('start "" "' + parsed.href.replace(/"/g, '') + '"', { stdio: 'ignore' });
          res.writeHead(200); res.end('ok');
        } else {
          res.writeHead(400); res.end('Bad URL');
        }
      } catch(e) { res.writeHead(400); res.end('Bad request'); }
    });
    return;
  }

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
    if (rateLimit('summarize', 60000, res)) return;
    const ps = spawn(POWERSHELL, [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'summarize_mails.ps1')
    ], { cwd: APP_DIR, stdio: 'ignore' });
    res.writeHead(202); res.end('Accepted');
    return;
  }

  // Trigger export_outlook_today.ps1
  if (req.method === 'POST' && req.url === '/run-export-calendar') {
    if (rateLimit('calendar', 30000, res)) return;
    const ps = spawn(POWERSHELL, [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'export_outlook_today.ps1')
    ], { cwd: APP_DIR, stdio: 'ignore' });
    res.writeHead(202); res.end('Accepted');
    return;
  }

  // Trigger export_outlook_mails.ps1
  if (req.method === 'POST' && req.url === '/run-export-mails') {
    if (rateLimit('mails', 30000, res)) return;
    const ps = spawn(POWERSHELL, [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'export_outlook_mails.ps1')
    ], { cwd: APP_DIR, stdio: 'ignore' });
    res.writeHead(202); res.end('Accepted');
    return;
  }

  // Trigger plan_week.ps1
  if (req.method === 'POST' && req.url === '/run-plan-week') {
    if (rateLimit('plan', 60000, res)) return;
    const { execFile } = require('child_process');
    const psFile = path.join(APP_DIR, 'plan_week.ps1');
    execFile(POWERSHELL, [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile
    ], { cwd: APP_DIR, maxBuffer: 10 * 1024 * 1024, timeout: 480000 }, () => {});
    res.writeHead(202); res.end('Accepted');
    return;
  }

  // Trigger generate_news.ps1
  if (req.method === 'POST' && req.url.startsWith('/run-generate-news')) {
    if (rateLimit('news', 30000, res)) return;
    const forceParam = new URL(req.url, 'http://localhost').searchParams.get('force');
    const args = ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'generate_news.ps1')];
    if (forceParam === '1') args.push('-force');
    spawn(POWERSHELL, args, { cwd: APP_DIR, stdio: 'ignore' });
    res.writeHead(202); res.end('Accepted');
    return;
  }

  // Trigger sync_jira.ps1
  if (req.method === 'POST' && req.url === '/run-sync-jira') {
    if (rateLimit('jira-sync', 30000, res)) return;
    execFile(POWERSHELL, [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'sync_jira.ps1')
    ], { cwd: APP_DIR, maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, () => {});
    res.writeHead(202); res.end('Accepted');
    return;
  }

  // Trigger setup_jira.ps1 (PKCE flow, may open browser)
  if (req.method === 'POST' && req.url === '/run-setup-jira') {
    if (rateLimit('jira-setup', 60000, res)) return;
    execFile(POWERSHELL, [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(APP_DIR, 'setup_jira.ps1')
    ], { cwd: APP_DIR, maxBuffer: 10 * 1024 * 1024, timeout: 210000 }, () => {});
    res.writeHead(202); res.end('Accepted');
    return;
  }

  if (req.method !== 'PUT') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }

  const filename = path.basename(req.url.replace(/^\//, ''));
  if (!ALLOWED.has(filename)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const subdir   = ['links.json', 'learningplan_progress.json', 'sport.json', 'quotes.json', 'news.json', 'videos.json'].includes(filename) ? 'knowledge'
                 : ['actions.json','learn.txt','termine.txt','notes.json','contacts.json','jira.json','jira_status.json','jira_toolset.json'].includes(filename) ? 'data'
                 : '';
  const filePath = subdir ? path.join(APP_DIR, subdir, filename) : path.join(APP_DIR, filename);
  const MAX_BODY = 10 * 1024 * 1024;
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BODY) { res.writeHead(413); res.end('Payload Too Large'); req.destroy(); }
  });
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
