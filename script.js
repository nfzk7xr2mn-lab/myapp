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
let rawLinks    = '';
let icsEvents   = [];
let aktiverFokusTab = 'lernen';

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

// ── Load ICS automatically ─────────────────────────────────────────────────
async function loadICSAuto() {
  const now = new Date();
  const ymd = now.getFullYear().toString()
    + (now.getMonth()+1).toString().padStart(2,'0')
    + now.getDate().toString().padStart(2,'0');
  try {
    const res = await fetch(v(`termine_${ymd}.ics`));
    if (!res.ok) return;
    const text = await res.text();
    const events = parseICS(text);
    if (events.length > 0) {
      icsEvents = events;
      renderKalender();
    }
  } catch(e) { /* file not yet available, silently skip */ }
}

// ── Load data ──────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [tRes, aRes, lRes, lnRes] = await Promise.all([
      fetch(v('termine.txt')),
      fetch(v('actions.txt')),
      fetch(v('learn.txt')),
      fetch(v('links.txt')),
    ]);
    if (tRes.ok)  rawTermine = await tRes.text();
    if (aRes.ok)  rawActions = await aRes.text();
    if (lRes.ok)  rawLearn   = await lRes.text();
    if (lnRes.ok) rawLinks   = await lnRes.text();
  } catch(e) { console.error('Load error', e); }
  await loadICSAuto();
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

const WRITE_SERVER = 'http://127.0.0.1:9001';

async function writeFile(name, content) {
  try {
    const res = await fetch(`${WRITE_SERVER}/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: content,
    });
    if (!res.ok) throw new Error(res.statusText);
  } catch(e) {
    console.error(`writeFile(${name}) failed:`, e);
    // Fallback: download
    downloadFile(name, content);
  }
}

function saveActionsFile() {
  rawActions = actionLines.join('\n') + '\n';
  writeFile('actions.txt', rawActions);
}

function saveLearnFile() {
  rawLearn = learnLines.join('\n') + '\n';
  writeFile('learn.txt', rawLearn);
}

function saveLinksFile() {
  writeFile('links.txt', rawLinks);
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
  const now    = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const calBody = document.getElementById('cal-body');
  const calDate = document.getElementById('cal-date');

  calDate.textContent = now.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });

  // Use ICS events if available, otherwise fall back to rawTermine
  if (icsEvents.length > 0) {
    calBody.innerHTML = icsEvents.map(e => {
      const startMin = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      const endMin   = e.endDate.getHours()   * 60 + e.endDate.getMinutes();
      const past     = curMin > endMin;
      const current  = curMin >= startMin && curMin <= endMin;
      let cls = 'cal-item';
      if (current) cls += ' cal-current';
      else if (past) cls += ' cal-past';
      return `<div class="${cls}">
        <span class="cal-dot"></span>
        <span class="cal-time">${fmtTime(e.startDate)}–${fmtTime(e.endDate)}</span>
        <span>${e.title}</span>
      </div>`;
    }).join('');
    return;
  }

  // Fallback: rawTermine
  const today = todayStr();
  const lines = rawTermine.split('\n').filter(l => l.trim().startsWith(today));
  if (!lines.length) {
    calBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Termine heute</div>';
    return;
  }
  calBody.innerHTML = lines.map(line => {
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
function switchFokusTab(tab) {
  aktiverFokusTab = tab;
  document.querySelectorAll('.fokus-tab').forEach(b =>
    b.classList.toggle('active', b.textContent.toLowerCase() === tab ||
      (tab === 'lernen' && b.textContent === 'Lernen') ||
      (tab === 'sport'  && b.textContent === 'Sport')  ||
      (tab === 'links'  && b.textContent === 'Links'))
  );
  const addBtn = document.getElementById('btn-add-learn');
  addBtn.textContent = tab === 'links' ? '+ Link' : '+ hinzufügen';
  renderFokus();
}

function renderFokus() {
  parseLearn();
  const fokusBody = document.getElementById('fokus-body');
  const fokusKat  = document.getElementById('fokus-kategorie');

  if (aktiverFokusTab === 'links') {
    fokusKat.textContent = '';
    renderLinks(fokusBody);
    return;
  }

  const isLernen = aktiverFokusTab === 'lernen';
  const filterKats = isLernen ? WISSEN_KATS : SPORT_KATS;
  fokusKat.textContent = isLernen ? 'Lernlinks' : 'Bewegung';

  const active = learnLines.filter(l => {
    const p = l.split('|').map(s => s.trim());
    return p.length >= 3 && p[3] !== 'x' && filterKats.includes(p[0]);
  });

  if (!active.length) {
    const fallbacks = FALLBACK_LINKS.filter(f => filterKats.includes(f.kat));
    fokusBody.innerHTML = fallbacks.map((f, i) =>
      `<div class="learn-item">
        <span class="learn-kat" title="${f.kat}">${f.kat.split(' ')[0]}</span>
        <a class="learn-link" href="${f.url}" target="_blank" title="${f.label}">${f.label}</a>
        <button class="btn-x" title="Als erledigt markieren" onclick="markLearnDoneFallback(${i})">✕</button>
      </div>`
    ).join('');
    return;
  }

  fokusBody.innerHTML = active.slice(0, 5).map(line => {
    const p   = line.split('|').map(s => s.trim());
    const kat = p[0]; const url = p[2];
    const label = url.replace(/https?:\/\/(www\.)?/, '').slice(0, 40);
    const idx = learnLines.indexOf(line);
    return `<div class="learn-item">
      <span class="learn-kat" title="${kat}">${kat.split(' ')[0]}</span>
      <a class="learn-link" href="${url}" target="_blank" title="${url}">${label}…</a>
      <button class="btn-x" title="Als erledigt markieren" onclick="markLearnDone(${idx})">✕</button>
    </div>`;
  }).join('');
}

function renderLinks(container) {
  const lines = rawLinks.split('\n').filter(l => l.trim());
  if (!lines.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Links gespeichert</div>';
    return;
  }
  container.innerHTML = lines.map((l, idx) => {
    const m = l.match(/^\[(.+?)\|(.+?)\]$/);
    const label = m ? m[1] : l;
    const url   = m ? m[2] : l;
    return `<div class="learn-item">
      <a class="learn-link" href="${escapeHtml(url)}" target="_blank" title="${escapeHtml(url)}">${escapeHtml(label)}</a>
      <button class="btn-x" title="Löschen" onclick="deleteLink(${idx})">✕</button>
    </div>`;
  }).join('');
}

function deleteLink(idx) {
  const lines = rawLinks.split('\n').filter(l => l.trim());
  lines.splice(idx, 1);
  rawLinks = lines.join('\n') + '\n';
  saveLinksFile();
  renderFokus();
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
  const dayOfWeek = todayDate.getDay();
  const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(todayDate);
  weekStart.setDate(weekStart.getDate() - daysToMon);

  function parseDateStr(s) {
    const m = s.match(/^(\d{2})\.(\d{2})\.$/);
    if (!m) return null;
    return new Date(now.getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]));
  }

  const actionsBody  = document.getElementById('actions-body');
  const actionsCount = document.getElementById('actions-count');

  // Show open actions, sorted: overdue first, then today, then future
  const open = actionLines.filter(l => {
    const p = l.split('|').map(s => s.trim());
    return p[3] !== 'x';
  });

  actionsCount.textContent = `${open.length} offen`;

  function dueClass(dueStr) {
    const d = parseDateStr(dueStr);
    if (!d) return '';
    if (d < todayDate) return 'overdue';
    if (d.getTime() === todayDate.getTime()) return 'today';
    return '';
  }

  actionsBody.innerHTML = actionLines.map((line, idx) => {
    const p    = line.split('|').map(s => s.trim());
    if (p.length < 3) return '';
    const created = p[0]; const due = p[1]; const text = p[2]; const done = p[3] === 'x';
    // Hide completed items created before this week
    if (done) {
      const createdDate = parseDateStr(created);
      if (createdDate && createdDate < weekStart) return '';
    }
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
  if (aktiverFokusTab === 'links') {
    document.getElementById('modal-link').style.display = 'flex';
    document.getElementById('new-link-label').focus();
  } else {
    const kats = aktiverFokusTab === 'sport' ? SPORT_KATS : WISSEN_KATS;
    const sel = document.getElementById('new-learn-kat');
    sel.innerHTML = kats.map(k => `<option>${k}</option>`).join('');
    document.getElementById('modal-learn').style.display = 'flex';
    document.getElementById('new-learn-url').focus();
  }
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

document.getElementById('btn-save-link').addEventListener('click', () => {
  const label = document.getElementById('new-link-label').value.trim();
  const url   = document.getElementById('new-link-url').value.trim();
  if (!url) return;
  const entry = label ? `[${label}|${url}]` : `[${url}|${url}]`;
  rawLinks = rawLinks.trimEnd() + '\n' + entry + '\n';
  saveLinksFile();
  renderFokus();
  closeModal('modal-link');
  document.getElementById('new-link-label').value = '';
  document.getElementById('new-link-url').value = '';
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

// ── ICS Import ─────────────────────────────────────────────────────────────
// ── ICS Import ─────────────────────────────────────────────────────────────
function icsDateToLocal(val) {
  // UTC: 20260418T120000Z → Date object in local time
  if (val.endsWith('Z')) {
    const y = val.slice(0,4), mo = val.slice(4,6), d = val.slice(6,8);
    const h = val.slice(9,11), mi = val.slice(11,13), s = val.slice(13,15)||'00';
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  }
  // Local/TZID: 20260418T140000 → treat as local
  const y = val.slice(0,4), mo = val.slice(4,6), d = val.slice(6,8);
  const h = val.slice(9,11), mi = val.slice(11,13);
  return new Date(+y, +mo-1, +d, +h, +mi);
}

function fmtTime(date) {
  return date.getHours().toString().padStart(2,'0') + ':' + date.getMinutes().toString().padStart(2,'0');
}

function parseICS(text) {
  const now = new Date();
  const todayYMD = now.getFullYear().toString()
    + (now.getMonth()+1).toString().padStart(2,'0')
    + now.getDate().toString().padStart(2,'0');

  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '').split('\n');
  const events = [];
  let ev = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT')   { if (ev) events.push(ev); ev = null; continue; }
    if (!ev) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    // key may contain params: SUMMARY;LANGUAGE=en-de → base key is SUMMARY
    const fullKey = line.slice(0, sep);
    const baseKey = fullKey.split(';')[0].toUpperCase();
    const val     = line.slice(sep + 1);

    if (baseKey === 'SUMMARY') ev.title = val.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
    if (baseKey === 'DTSTART') ev.start = val;
    if (baseKey === 'DTEND')   ev.end   = val;
  }

  const todayEvents = [];
  for (const e of events) {
    if (!e.start || !e.title) continue;

    const startDate = icsDateToLocal(e.start);
    const endDate   = e.end ? icsDateToLocal(e.end) : startDate;

    // Check if event falls on today (in local time)
    const evYMD = startDate.getFullYear().toString()
      + (startDate.getMonth()+1).toString().padStart(2,'0')
      + startDate.getDate().toString().padStart(2,'0');
    if (evYMD !== todayYMD) continue;

    todayEvents.push({ startDate, endDate, title: e.title });
  }

  // Sort by start time
  todayEvents.sort((a, b) => a.startDate - b.startDate);
  return todayEvents;
}

document.getElementById('ics-upload').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;

  // Validate filename contains today's date: *_YYYYMMDD.ics
  const now = new Date();
  const todayYMD = now.getFullYear().toString()
    + (now.getMonth() + 1).toString().padStart(2, '0')
    + now.getDate().toString().padStart(2, '0');
  if (!file.name.includes(todayYMD)) {
    alert(`Bitte die Datei für heute laden (*_${todayYMD}.ics)`);
    this.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    icsEvents = parseICS(e.target.result);
    renderKalender();
  };
  reader.readAsText(file, 'UTF-8');
  this.value = '';
});

// ── Mails ──────────────────────────────────────────────────────────────────
let mailData = [];
let activeMailTab = null;  // currently selected date key

const MY_ADDRESSES = ['susanne.schott@sap.com', 'susanne.schott.postfach@web.de'];
const WEEKDAY_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

const PRIO_META = {
  chef:   { label: '★',  title: 'Von meinem Chef',          cls: 'prio-chef'   },
  direct: { label: '●',  title: 'Direkt an mich',           cls: 'prio-direct' },
  action: { label: '◆',  title: 'An mich + andere',         cls: 'prio-action' },
  cc:     { label: '○',  title: 'Nur CC',                   cls: 'prio-cc'     },
  fyi:    { label: '·',  title: 'Nicht direkt adressiert',  cls: 'prio-fyi'    },
};

function shortName(full) {
  if (!full) return '';
  const trimmed = full.trim();
  // DL/group: starts with "DL ", contains _ or digits → show as-is
  if (/^DL\s/i.test(trimmed) || /[_\d]/.test(trimmed)) return trimmed;

  // "Nachname, Vorname" format
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map(s => s.trim());
    if (first) return `${first} ${last[0].toUpperCase()}.`;
    return last;
  }

  // "Vorname Nachname" format
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${first} ${lastInitial}.`;
}

function mailPrio(m) {
  // fall back to client-side detection if prio not yet in JSON
  if (m.prio) return m.prio;
  if (!m.to) return 'fyi';
  const lower = m.to.toLowerCase();
  const hasMe = MY_ADDRESSES.some(a => lower.includes(a));
  if (!hasMe) return 'fyi';
  return m.to.split(';').filter(Boolean).length === 1 ? 'direct' : 'action';
}

async function loadMails() {
  try {
    const res = await fetch(v('mails_heute.json'));
    if (!res.ok) return;
    mailData = await res.json();
    renderMails();
  } catch(e) { console.error('loadMails error:', e); }
  checkSummaryExists();
}

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMails() {
  const body  = document.getElementById('mails-body');
  const count = document.getElementById('mails-count');
  const tabs  = document.getElementById('mail-tabs');

  if (!mailData.length) {
    count.textContent = '0 Mails';
    tabs.innerHTML = '';
    body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Mails diese Woche</div>';
    return;
  }
  count.textContent = `${mailData.length} diese Woche`;

  // Build ordered date groups (mails sorted newest-first, so reverse for tab order Mon→Fri)
  const groupMap = {};
  for (const m of mailData) {
    if (!groupMap[m.date]) groupMap[m.date] = [];
    groupMap[m.date].push(m);
  }
  // Sort dates ascending (oldest tab first)
  const dates = Object.keys(groupMap).sort((a, b) => {
    const [da, ma] = a.split('.').map(Number);
    const [db, mb] = b.split('.').map(Number);
    return ma !== mb ? ma - mb : da - db;
  });

  // Default active tab: today if present, else last (most recent) date
  const now = new Date();
  const todayKey = now.getDate().toString().padStart(2,'0') + '.' + (now.getMonth()+1).toString().padStart(2,'0') + '.';
  if (!activeMailTab || !groupMap[activeMailTab]) {
    activeMailTab = groupMap[todayKey] ? todayKey : dates[dates.length - 1];
  }

  // Render tab buttons
  tabs.innerHTML = dates.map(date => {
    const [d, mo] = date.split('.').map(Number);
    const year = now.getFullYear();
    const wd = WEEKDAY_SHORT[new Date(year, mo - 1, d).getDay()];
    const isActive = date === activeMailTab;
    return `<button class="mail-tab${isActive ? ' active' : ''}" onclick="switchMailTab('${date}')">${wd}</button>`;
  }).join('');

  // Render mails for active tab
  renderMailTabContent(groupMap[activeMailTab] || []);
}

function switchMailTab(date) {
  activeMailTab = date;
  renderMails();
}

function renderMailTabContent(mails) {
  const body = document.getElementById('mails-body');
  if (!mails.length) {
    body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Mails</div>';
    return;
  }
  body.innerHTML = mails.map((m, idx) => {
    const id   = `mail-${activeMailTab}-${idx}`;
    const prio = mailPrio(m);
    const pm   = PRIO_META[prio] || PRIO_META.fyi;
    return `<div class="mail-item ${pm.cls}" onclick="toggleMail('${id}')">
      <span class="mail-prio" title="${pm.title}">${pm.label}</span>
      <span class="mail-time">${m.time}</span>
      <div class="mail-content">
        <div class="mail-from"><em>${escapeHtml(shortName(m.from))}</em></div>
        <div class="mail-subject">${escapeHtml(m.subject)}</div>
        <div class="mail-body" id="${id}" style="display:none">${escapeHtml(m.body)}</div>
      </div>
    </div>`;
  }).join('');
}

async function checkSummaryExists() {
  const kw = currentKW();
  const btn = document.getElementById('btn-show-summary');
  try {
    const res = await fetch(`summary_KW${kw}.json?v=` + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data.summary) {
        btn.textContent = `KW${kw} lesen`;
        btn.style.display = '';
        return;
      }
    }
  } catch(e) {}
  btn.style.display = 'none';
}

function renderSummaryHtml(text) {
  return text
    .split('\n')
    .map(line => {
      if (/^###\s+/.test(line)) return `<h4>${escapeHtml(line.replace(/^###\s+/,''))}</h4>`;
      if (/^##\s+/.test(line))  return `<h3>${escapeHtml(line.replace(/^##\s+/,''))}</h3>`;
      if (/^#\s+/.test(line))   return `<h3>${escapeHtml(line.replace(/^#\s+/,''))}</h3>`;
      if (/^\*\s+/.test(line) || /^-\s+/.test(line)) {
        const content = line.replace(/^[\*\-]\s+/, '');
        return `<li>${renderInline(content)}</li>`;
      }
      if (line.trim() === '') return '<br>';
      return `<p>${renderInline(line)}</p>`;
    })
    .join('')
    .replace(/(<li>.*<\/li>)+/g, m => `<ul>${m}</ul>`);
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

async function showSavedSummary() {
  const kw = currentKW();
  const body = document.getElementById('mails-body');
  try {
    const res = await fetch(`summary_KW${kw}.json?v=` + Date.now());
    const data = await res.json();
    body.innerHTML = `<div class="mail-summary">${renderSummaryHtml(data.summary)}</div>
      <button class="btn-ghost" style="margin-top:8px;font-size:0.65rem" onclick="renderMails()">← Liste anzeigen</button>`;
  } catch(e) {
    body.innerHTML = '<div style="color:#e74c3c;font-size:0.75rem;padding:8px 0">Zusammenfassung nicht gefunden.</div>';
  }
}

document.getElementById('btn-show-summary').addEventListener('click', showSavedSummary);

function toggleMail(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function currentKW() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000);
  const startDow = startOfYear.getDay() || 7; // Mon=1..Sun=7
  return Math.ceil((dayOfYear + startDow) / 7);
}

async function summarizeMails() {
  if (!mailData.length) return;
  const body = document.getElementById('mails-body');
  body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Zusammenfassung wird erstellt… (bis zu 1 Min.)</div>';

  const requestedAt = Date.now();
  const deadline = requestedAt + 90000;
  const kw = currentKW();
  const summaryFile = `summary_KW${kw}.json`;

  const poll = async () => {
    try {
      const res = await fetch(summaryFile + '?v=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data.summary && data.ts && data.ts >= requestedAt) {
          body.innerHTML = `<div class="mail-summary">${renderSummaryHtml(data.summary)}</div>
            <button class="btn-ghost" style="margin-top:8px;font-size:0.65rem" onclick="renderMails()">← Liste anzeigen</button>`;
          return;
        }
      }
    } catch(e) { /* not yet available */ }
    if (Date.now() < deadline) {
      setTimeout(poll, 3000);
    } else {
      body.innerHTML = '<div style="color:#e74c3c;font-size:0.75rem;padding:8px 0">Zeitüberschreitung – bitte Task Scheduler prüfen.</div>';
    }
  };

  setTimeout(poll, 4000);
}

document.getElementById('btn-summarize-mails').addEventListener('click', summarizeMails);

// ── Init ───────────────────────────────────────────────────────────────────
loadAll();
loadMails();
setInterval(renderAll, 30000);
setInterval(loadICSAuto, 15 * 60000);
setInterval(() => {
  // Don't reload mails if any mail body is currently open
  const anyOpen = document.querySelector('.mail-body[style*="display: block"], .mail-body[style*="display:block"]');
  if (!anyOpen) loadMails();
}, 5 * 60000);
