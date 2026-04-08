// ── Config ────────────────────────────────────────────────────────────────
const PHASES = [
  { id: 'morgen',      label: 'Morgen',     start: '06:00', end: '11:30', css: 'phase-morgen' },
  { id: 'mittag',      label: 'Mittag',     start: '11:30', end: '13:00', css: 'phase-mittag' },
  { id: 'nachmittag',  label: 'Nachmittag', start: '13:00', end: '17:00', css: 'phase-nachmittag' },
  { id: 'abend',       label: 'Abend',      start: '17:00', end: '19:30', css: 'phase-abend' },
  { id: 'spaetabend',  label: 'Spätabend',  start: '19:30', end: '22:30', css: 'phase-spaetabend' },
  { id: 'nacht',       label: 'Nacht',      start: '22:30', end: '06:00', css: 'phase-nacht' },
];

const WISSEN_KATS   = ['Führung','Presentation','Verhandlungen','Rhetorik','KI','Naturwissenschaften'];
const SPORT_KATS    = ['Dehnübungen für Frauen über 50','kurze Yogaübungen','kurze Sporteinheiten mit den eigenen Körper ohne Hilfsmittel'];
const ALL_KATS      = [...WISSEN_KATS, ...SPORT_KATS];

// Fallback-Links wenn learn.txt leer
const FALLBACK_LINKS = [
  { kat: 'Führung',        url: 'https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action', label: 'Simon Sinek – How great leaders inspire action' },
  { kat: 'KI',             url: 'https://www.youtube.com/watch?v=aircAruvnKk',                            label: '3Blue1Brown – Neural Networks' },
  { kat: 'Rhetorik',       url: 'https://www.youtube.com/watch?v=HAnw168huqA',                            label: 'TED – The art of public speaking' },
  { kat: 'kurze Yogaübungen', url: 'https://www.youtube.com/watch?v=v7AYKMP6rOE',                        label: 'Yoga for Women 50+' },
  { kat: 'Dehnübungen für Frauen über 50', url: 'https://www.youtube.com/watch?v=qULTwquOuT4',           label: 'Stretching for Women Over 50' },
];

// ── State ──────────────────────────────────────────────────────────────────
let rawTermine  = '';
let rawActions  = '';
let rawLearn    = '';

// ── Helpers ────────────────────────────────────────────────────────────────
function todayStr() {
  const n = new Date();
  return n.getDate().toString().padStart(2,'0') + '.' + (n.getMonth()+1).toString().padStart(2,'0') + '.';
}

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function currentPhase() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const p of PHASES) {
    const s = timeToMin(p.start);
    const e = timeToMin(p.end);
    if (s < e) { if (cur >= s && cur < e) return p; }
    else        { if (cur >= s || cur < e) return p; } // midnight wrap
  }
  return PHASES[PHASES.length - 1];
}

function v(ms) { return ms + '?v=' + Date.now(); }

// ── Load data ──────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [tRes, aRes, lRes] = await Promise.all([
      fetch(v('termine.txt')),
      fetch(v('actions.txt')),
      fetch(v('learn.txt')),
    ]);
    if (tRes.ok) rawTermine = await tRes.text();
    if (aRes.ok) rawActions = await aRes.text();
    if (lRes.ok) rawLearn   = await lRes.text();
  } catch(e) { console.error('Load error', e); }
  renderAll();
}

// ── Save helpers (via fetch PUT — works with live-server proxy or local) ──
// Since live-server is read-only, we save changes as a download for demo;
// In production replace with a small backend endpoint.
// For now we keep changes in memory and update the DOM, and offer download.

let actionLines = [];
let learnLines  = [];

function parseActions() {
  actionLines = rawActions.split('\n').filter(l => l.includes('|'));
}

function parseLearn() {
  learnLines = rawLearn.split('\n').filter(l => l.trim() !== '');
}

function saveActionsFile() {
  rawActions = actionLines.join('\n') + '\n';
  // Download the updated file so user can replace it
  downloadFile('actions.txt', rawActions);
}

function saveLearnFile() {
  rawLearn = learnLines.join('\n') + '\n';
  downloadFile('learn.txt', rawLearn);
}

function downloadFile(name, content) {
  const a = document.createElement('a');
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
  a.download = name;
  a.click();
}

// ── Render clock & header ──────────────────────────────────────────────────
function renderHeader() {
  const now  = new Date();
  const hh   = now.getHours().toString().padStart(2,'0');
  const mm   = now.getMinutes().toString().padStart(2,'0');
  document.getElementById('clock').textContent = `${hh}:${mm}`;
  document.getElementById('date-label').textContent =
    now.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const phase = currentPhase();
  document.getElementById('phase-badge').textContent = phase.label;
  document.body.className = phase.css;
}

// ── Render Kalender ────────────────────────────────────────────────────────
function renderKalender() {
  const today = todayStr();
  const now   = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();

  const lines = rawTermine.split('\n').filter(l => l.trim().startsWith(today));
  const calBody = document.getElementById('cal-body');
  const calDate = document.getElementById('cal-date');

  calDate.textContent = now.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });

  if (!lines.length) {
    calBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Termine heute</div>';
    return;
  }

  calBody.innerHTML = lines.map(line => {
    // Format: DD.MM.  HH:MM-HH:MM Bezeichnung
    const rest  = line.slice(today.length).trim();
    const match = rest.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.*)/);
    if (!match) return '';
    const [, startT, endT, title] = match;
    const startMin = timeToMin(startT);
    const endMin   = timeToMin(endT);
    const past     = curMin > endMin;
    const current  = curMin >= startMin && curMin <= endMin;
    let cls = 'cal-item';
    if (current) cls += ' cal-current';
    else if (past) cls += ' cal-past';
    return `<div class="${cls}">
      <span class="cal-dot"></span>
      <span class="cal-time">${startT}–${endT}</span>
      <span>${title}</span>
    </div>`;
  }).join('');
}

// ── Render Fokus ───────────────────────────────────────────────────────────
function renderFokus() {
  parseLearn();
  const today = todayStr();
  const fokusBody = document.getElementById('fokus-body');
  const fokusKat  = document.getElementById('fokus-kategorie');

  // Filter: not done, from today or earlier
  const active = learnLines.filter(l => {
    const p = l.split('|').map(s => s.trim());
    return p.length >= 3 && p[3] !== 'x';
  });

  let items = active.slice(0, 5);

  // If none available, use fallback
  const useFallback = items.length === 0;
  if (useFallback) {
    fokusKat.textContent = 'Empfehlungen';
    fokusBody.innerHTML = FALLBACK_LINKS.map((f, i) =>
      `<div class="learn-item">
        <span class="learn-kat" title="${f.kat}">${f.kat.split(' ')[0]}</span>
        <a class="learn-link" href="${f.url}" target="_blank" title="${f.label}">${f.label}</a>
        <button class="btn-x" title="Als erledigt markieren" onclick="markLearnDoneFallback(${i})">✕</button>
      </div>`
    ).join('');
    return;
  }

  const kats = [...new Set(items.map(l => l.split('|')[0].trim()))];
  fokusKat.textContent = kats.slice(0,2).join(', ');

  fokusBody.innerHTML = items.map((line, idx) => {
    const p   = line.split('|').map(s => s.trim());
    const kat = p[0]; const url = p[2]; const label = url.replace(/https?:\/\/(www\.)?/, '').slice(0, 40);
    return `<div class="learn-item" id="li-${idx}">
      <span class="learn-kat" title="${kat}">${kat.split(' ')[0]}</span>
      <a class="learn-link" href="${url}" target="_blank" title="${url}">${label}…</a>
      <button class="btn-x" title="Als erledigt markieren" onclick="markLearnDone(${learnLines.indexOf(line)})">✕</button>
    </div>`;
  }).join('');
}

function markLearnDone(idx) {
  if (learnLines[idx] === undefined) return;
  const parts = learnLines[idx].split('|');
  while (parts.length < 4) parts.push('');
  parts[3] = 'x';
  learnLines[idx] = parts.join('|');
  saveLearnFile();
  rawLearn = learnLines.join('\n') + '\n';
  renderFokus();
}

function markLearnDoneFallback(idx) {
  // just hide it
  const item = FALLBACK_LINKS[idx];
  const today = todayStr();
  learnLines.push(`${item.kat} | ${today} | ${item.url} | x`);
  saveLearnFile();
  renderFokus();
}

// ── Render Actions ─────────────────────────────────────────────────────────
function renderActions() {
  parseActions();
  const today    = todayStr();
  const now      = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const actionsBody  = document.getElementById('actions-body');
  const actionsCount = document.getElementById('actions-count');

  // Show open actions, sorted: overdue first, then today, then future
  const open = actionLines.filter(l => {
    const p = l.split('|').map(s => s.trim());
    return p[3] !== 'x';
  });

  actionsCount.textContent = `${open.length} offen`;

  function parseDue(s) {
    const m = s.match(/^(\d{2})\.(\d{2})\.$/);
    if (!m) return null;
    return new Date(now.getFullYear(), parseInt(m[2])-1, parseInt(m[1]));
  }

  function dueClass(dueStr) {
    const d = parseDue(dueStr);
    if (!d) return '';
    if (d < todayDate) return 'overdue';
    if (d.getTime() === todayDate.getTime()) return 'today';
    return '';
  }

  actionsBody.innerHTML = actionLines.map((line, idx) => {
    const p    = line.split('|').map(s => s.trim());
    if (p.length < 3) return '';
    const created = p[0]; const due = p[1]; const text = p[2]; const done = p[3] === 'x';
    const dc = dueClass(due);
    return `<div class="action-item ${done ? 'done' : ''}" id="ai-${idx}">
      <span class="action-due ${dc}">${due}</span>
      <span class="action-text">${text}</span>
      <span class="action-created">${created}</span>
      ${!done ? `<button class="btn-x" title="Erledigt" onclick="markActionDone(${idx})">✕</button>` : ''}
    </div>`;
  }).join('');
}

function markActionDone(idx) {
  const p = actionLines[idx].split('|').map(s => s.trim());
  while (p.length < 4) p.push('');
  p[3] = 'x';
  actionLines[idx] = p.join(' | ');
  saveActionsFile();
  rawActions = actionLines.join('\n') + '\n';
  renderActions();
}

// ── Modal: neue Action ─────────────────────────────────────────────────────
document.getElementById('btn-add-action').addEventListener('click', () => {
  document.getElementById('modal-action').style.display = 'flex';
  document.getElementById('new-action-text').focus();
});

document.getElementById('btn-save-action').addEventListener('click', () => {
  const text = document.getElementById('new-action-text').value.trim();
  const due  = document.getElementById('new-action-due').value.trim() || todayStr();
  if (!text) return;
  const today = todayStr();
  const newLine = `${today} | ${due} | ${text} | `;
  actionLines.push(newLine);
  rawActions = actionLines.join('\n') + '\n';
  saveActionsFile();
  renderActions();
  closeModal('modal-action');
  document.getElementById('new-action-text').value = '';
  document.getElementById('new-action-due').value = '';
});

// ── Modal: neuer Learn-Link ────────────────────────────────────────────────
document.getElementById('btn-add-learn').addEventListener('click', () => {
  document.getElementById('modal-learn').style.display = 'flex';
  document.getElementById('new-learn-url').focus();
});

document.getElementById('btn-save-learn').addEventListener('click', () => {
  const kat = document.getElementById('new-learn-kat').value;
  const url = document.getElementById('new-learn-url').value.trim();
  if (!url) return;
  const today = todayStr();
  const newLine = `${kat} | ${today} | ${url} | `;
  learnLines.push(newLine);
  rawLearn = learnLines.join('\n') + '\n';
  saveLearnFile();
  renderFokus();
  closeModal('modal-learn');
  document.getElementById('new-learn-url').value = '';
});

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none'; });
});

// ── Main render ────────────────────────────────────────────────────────────
function renderAll() {
  renderHeader();
  renderKalender();
  renderFokus();
  renderActions();
}

// ── Init ───────────────────────────────────────────────────────────────────
loadAll();
setInterval(renderAll, 30000);  // refresh every 30s
