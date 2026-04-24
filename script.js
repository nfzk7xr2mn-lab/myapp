// ── Mode: simple / expert / focus ─────────────────────────────────────────
let currentMode = localStorage.getItem('dashMode');
if (!currentMode) {
  currentMode = localStorage.getItem('expertMode') === '1' ? 'expert' : 'simple';
  localStorage.setItem('dashMode', currentMode);
  localStorage.removeItem('expertMode');
}

const MODE_CYCLE = ['simple', 'expert', 'focus'];
const MODE_ICONS = { simple: '⊞', expert: '⊟', focus: '⊕' };
const MODE_LABELS = { simple: 'Expertenmodus (E)', expert: 'Fokusmodus (E)', focus: 'Grundmodus (E)' };

function applyMode(mode) {
  currentMode = mode;
  localStorage.setItem('dashMode', mode);
  const phase = currentPhase();
  document.body.className = phase.css + ' mode-' + mode;
  const btn = document.getElementById('btn-mode-toggle');
  const nextMode = MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length];
  if (btn) { btn.textContent = MODE_ICONS[mode]; btn.title = MODE_LABELS[mode]; }
  const btnExp = document.getElementById('btn-mode-toggle-expert');
  if (btnExp) { btnExp.textContent = MODE_ICONS[mode]; btnExp.title = MODE_LABELS[mode]; }
  if (mode === 'simple') {
    renderSimpleBar();
  } else {
    renderAll();
  }
  try {
    const sw = screen.availWidth;
    const sh = screen.availHeight;
    const barH = 64;
    if (mode === 'simple') {
      window.resizeTo(sw, barH);
      window.moveTo(0, screen.height - barH);
    } else {
      window.moveTo(0, 0);
      window.resizeTo(sw, sh);
    }
  } catch(e) {}
}

function renderSimpleBar() {
  const now    = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();

  // Clock + date
  const hh = now.getHours().toString().padStart(2,'0');
  const mm = now.getMinutes().toString().padStart(2,'0');
  const clockEl = document.getElementById('sb-clock');
  const dateEl  = document.getElementById('sb-date');
  const phaseEl = document.getElementById('sb-phase');
  if (clockEl) clockEl.textContent = `${hh}:${mm}`;
  if (dateEl)  dateEl.textContent  = now.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long' });
  if (phaseEl) phaseEl.textContent = currentPhase().label;

  // Calendar: current or next event + free status
  const calEl = document.getElementById('sb-cal');
  if (calEl) {
    const timed = icsEvents.filter(e => !e.allDay);
    const current = timed.find(e => {
      const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      const en = e.endDate.getHours()   * 60 + e.endDate.getMinutes();
      return curMin >= s && curMin <= en;
    });
    const next = timed.find(e => {
      const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      return s > curMin;
    });

    // Free status
    let freeHtml = '';
    const busy = timed.find(e => {
      const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      const en = e.endDate.getHours() * 60 + e.endDate.getMinutes();
      return curMin >= s && curMin < en;
    });
    if (!busy) {
      freeHtml = `<span class="sb-free-tag">jetzt frei</span>`;
    } else {
      let freeAt = busy.endDate;
      const future = timed.filter(e => {
        const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
        return s >= freeAt.getHours() * 60 + freeAt.getMinutes();
      }).sort((a, b) => a.startDate - b.startDate);
      for (const fe of future) {
        const gap = fe.startDate.getHours() * 60 + fe.startDate.getMinutes()
                  - (freeAt.getHours() * 60 + freeAt.getMinutes());
        if (gap > 5) break;
        freeAt = fe.endDate;
      }
      freeHtml = `<span class="sb-free-tag">frei ab ${fmtTime(freeAt)}</span>`;
    }

    if (current && next) {
      const endStr = fmtTime(current.endDate);
      const startStr = fmtTime(next.startDate);
      calEl.innerHTML = `<span class="sb-line1">bis ${endStr} <span class="sb-current">${escapeHtml(current.title)}</span></span><span class="sb-line2">ab ${startStr} <span class="sb-next">${escapeHtml(next.title)}</span>, ${freeHtml}</span>`;
    } else if (current) {
      const endStr = fmtTime(current.endDate);
      calEl.innerHTML = `<span class="sb-line1">bis ${endStr} <span class="sb-current">${escapeHtml(current.title)}</span></span><span class="sb-line2">${freeHtml}</span>`;
    } else if (next) {
      const startStr = fmtTime(next.startDate);
      calEl.innerHTML = `<span class="sb-line1">ab ${startStr} <span class="sb-next">${escapeHtml(next.title)}</span></span><span class="sb-line2">${freeHtml}</span>`;
    } else if (now.getHours() >= 17 && icsTomorrowEvents.length > 0) {
      const firstTomorrow = icsTomorrowEvents.filter(e => !e.allDay).sort((a, b) => a.startDate - b.startDate)[0];
      if (firstTomorrow) {
        const startStr = fmtTime(firstTomorrow.startDate);
        const dayName = firstTomorrow.startDate.toLocaleDateString('de-DE', { weekday: 'long' });
        calEl.innerHTML = `<span class="sb-line1">${dayName} ab ${startStr} <span class="sb-next">${escapeHtml(firstTomorrow.title)}</span></span><span class="sb-line2">${freeHtml}</span>`;
      } else {
        calEl.innerHTML = '';
      }
    } else {
      calEl.innerHTML = '';
    }
  }

  // Badges: einheitliche Kennzahlen
  const badgesEl = document.getElementById('sb-badges');
  if (badgesEl) {
    const today = todayStr();
    const remaining = icsEvents.filter(e => !e.allDay).filter(e =>
      e.endDate.getHours() * 60 + e.endDate.getMinutes() > curMin
    ).length;
    const mailCount = mailData.filter(m => m.date === today && m.typ !== 'gesendet').length;
    const openActions = actionsData.filter(a => !a.done).length;
    const openJira = jiraData.filter(j => j.status !== 'Done' && j.status !== 'Closed' && j.status !== 'Cancelled' && j.status !== 'Finished').length;

    let html = '';
    if (remaining > 0)   html += `<span class="sb-badge sb-badge-cal" title="${remaining} verbleibende Termine">${remaining}<span class="sb-badge-label">Termine</span></span>`;
    if (mailCount > 0)   html += `<span class="sb-badge sb-badge-mail" title="${mailCount} Mails heute">${mailCount}<span class="sb-badge-label">Mails</span></span>`;
    if (openActions > 0) html += `<span class="sb-badge sb-badge-action" title="${openActions} offene Aktionen">${openActions}<span class="sb-badge-label">Aktionen</span></span>`;
    if (openJira > 0)    html += `<span class="sb-badge sb-badge-jira" title="${openJira} offene Jira-Tickets">${openJira}<span class="sb-badge-label">Jira</span></span>`;
    badgesEl.innerHTML = html;
  }
}

function cycleMode() {
  const next = MODE_CYCLE[(MODE_CYCLE.indexOf(currentMode) + 1) % MODE_CYCLE.length];
  applyMode(next);
}

document.getElementById('btn-mode-toggle').addEventListener('click', cycleMode);

document.getElementById('btn-refresh-cal').addEventListener('click', () => {
  const btn = document.getElementById('btn-refresh-cal');
  btn.classList.add('spinning');
  fetch(`${WRITE_SERVER}/run-export-calendar`, { method: 'POST' })
    .catch(() => {})
    .then(() => new Promise(r => setTimeout(r, 3000)))
    .then(() => loadICSAuto())
    .finally(() => btn.classList.remove('spinning'));
});

function refreshCalendar(btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '⟳ Wird geladen…';
  fetch(`${WRITE_SERVER}/run-export-calendar`, { method: 'POST' })
    .catch(() => {})
    .then(() => new Promise(r => setTimeout(r, 3000)))
    .then(() => loadICSAuto())
    .finally(() => { btn.disabled = false; btn.textContent = orig; });
}

document.getElementById('btn-refresh-cal-expert').addEventListener('click', function() {
  refreshCalendar(this);
});

document.addEventListener('keydown', e => {
  if (e.key === 'e' || e.key === 'E') {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    cycleMode();
  }
});

// ── Config ────────────────────────────────────────────────────────────────
const PHASES = [
  { id: 'morgen',      label: 'Morgen',     start: '06:00', end: '11:30', css: 'phase-morgen' },
  { id: 'mittag',      label: 'Mittag',     start: '11:30', end: '13:00', css: 'phase-mittag' },
  { id: 'nachmittag',  label: 'Nachmittag', start: '13:00', end: '17:00', css: 'phase-nachmittag' },
  { id: 'abend',       label: 'Abend',      start: '17:00', end: '19:30', css: 'phase-abend' },
  { id: 'spaetabend',  label: 'Spätabend',  start: '19:30', end: '22:30', css: 'phase-spaetabend' },
  { id: 'nacht',       label: 'Nacht',      start: '22:30', end: '06:00', css: 'phase-nacht' },
];

const FUEHRUNG_TOPICS = new Set(['leadership','role clarity','mindset','managing managers',
  'execution','okr','delivery','scaling','organization','vision','1:1s','feedback','culture','management']);

// ── State ──────────────────────────────────────────────────────────────────
let rawTermine  = '';
let rawLearn    = '';
let linksData    = [];
let sportData    = [];
let notizenData  = [];
let contactsData = [];
let quotesAll    = [];
let quoteIndex   = -1;
let newsData     = null;
let icsEvents       = [];
let icsTomorrowEvents = [];
let icsLoadedAt     = null;
let syncFiles     = [];  // from data/sync_files.json
let aktiverFokusTab   = 'notizen';
let activeActionsTab  = 'open';
let learningplanData     = null;
let learningplanProgress = {};
let jiraData             = [];
let jiraToolsetData      = [];
let goalsData            = null;
let zieleLastRefresh     = null;
let videosData           = [];

// ── Helpers ────────────────────────────────────────────────────────────────
function todayStr() {
  const n = new Date();
  return n.getDate().toString().padStart(2,'0') + '.' + (n.getMonth()+1).toString().padStart(2,'0') + '.';
}

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getISOWeek(d) {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const w1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
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
function ymdOf(date) {
  return date.getFullYear().toString()
    + (date.getMonth()+1).toString().padStart(2,'0')
    + date.getDate().toString().padStart(2,'0');
}

async function loadICSAuto() {
  const now      = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayRes, tomRes] = await Promise.allSettled([
    fetch(v(`data/calendar_${ymdOf(now)}.ics`)),
    fetch(v(`data/calendar_${ymdOf(tomorrow)}.ics`)),
  ]);

  try {
    if (todayRes.status === 'fulfilled' && todayRes.value.ok) {
      const text   = await todayRes.value.text();
      const events = parseICS(text, now);
      if (events.length > 0) icsEvents = events;
    }
  } catch(e) {}

  try {
    if (tomRes.status === 'fulfilled' && tomRes.value.ok) {
      const text   = await tomRes.value.text();
      const events = parseICS(text, tomorrow);
      if (events.length > 0) icsTomorrowEvents = events;
    }
  } catch(e) {}

  if (!isAnyModalOpen()) {
    icsLoadedAt = new Date();
    renderKalender();
    if (currentMode === 'simple') renderSimpleBar();
  }
}

// ── Load data ──────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [tRes, aRes, lRes, lnRes, lpRes, lpProg, spRes, nRes, sfRes, ctRes, qRes, jRes, jtRes, nwRes, jsRes, glRes, vdRes] = await Promise.all([
      fetch(v('data/termine.txt')),
      fetch(v('data/actions.json')),
      fetch(v('data/learn.txt')),
      fetch(v('knowledge/links.json')),
      fetch(v('knowledge/learningplan.json')),
      fetch(v('knowledge/learningplan_progress.json')),
      fetch(v('knowledge/sport.json')),
      fetch(v('data/notes.json')),
      fetch(v('data/sync_files.json')),
      fetch(v('data/contacts.json')),
      fetch(v('knowledge/quotes_366.json')),
      fetch(v('data/jira.json')),
      fetch(v('data/jira_toolset.json')),
      fetch(v('knowledge/news.json')),
      fetch(v('data/jira_status.json')),
      fetch(v('knowledge/goals.json')),
      fetch(v('knowledge/videos.json')),
    ]);
    if (tRes.ok)   rawTermine       = await tRes.text();
    if (aRes.ok)   actionsData      = await aRes.json();
    if (lRes.ok)   rawLearn         = await lRes.text();
    if (lnRes.ok)  linksData        = await lnRes.json();
    if (lpRes.ok)  learningplanData     = await lpRes.json();
    if (lpProg.ok) learningplanProgress = await lpProg.json();
    if (spRes.ok)  sportData        = await spRes.json();
    if (nRes.ok)   notizenData      = await nRes.json();
    if (sfRes.ok)  syncFiles        = await sfRes.json();
    if (ctRes.ok)  contactsData     = await ctRes.json();
    if (qRes.ok)   quotesAll        = await qRes.json();
    if (jRes.ok)   jiraData         = await jRes.json();
    if (jtRes.ok)  jiraToolsetData  = await jtRes.json();
    if (nwRes.ok)  newsData         = await nwRes.json();
    if (jsRes.ok) {
      const js = await jsRes.json();
      if (js.ts) jiraLastSyncTs = js.ts;
      if (js.status === 'error' && js.message && js.message.includes('oken')) {
        jiraSetupMode = true;
        jiraSetupHint = '';
        _jiraStatusMsg = 'Token fehlt. Bitte in PowerShell ausfuehren: setup_jira.ps1';
        _jiraStatusType = 'error';
      }
    }
    if (glRes.ok)  goalsData        = await glRes.json();
    if (vdRes.ok)  videosData       = await vdRes.json();
  } catch(e) { console.error('Load error', e); }
  await loadICSAuto();
  aktiverFokusTab = defaultFokusTab();
  syncFokusTabUI();
  renderAll();
  if (jiraSetupMode) updateJiraButton('Synchronisieren', true);
}

function defaultFokusTab() {
  const saved = localStorage.getItem('fokusTab');
  const validTabs = ['notizen', 'wissen', 'links', 'netzwerk', 'jira', 'ziele', 'videos', 'news'];
  if (saved && validTabs.includes(saved)) return saved;
  const h = new Date().getHours();
  if (h < 8)  return 'wissen';
  if (h >= 17) return 'wissen';
  return 'notizen';
}

function syncFokusTabUI() {
  document.querySelectorAll('.fokus-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === aktiverFokusTab)
  );
  document.getElementById('btn-add-learn').style.display     = (aktiverFokusTab === 'links')    ? '' : 'none';
  document.getElementById('btn-add-notiz').style.display     = (aktiverFokusTab === 'notizen')  ? '' : 'none';
  document.getElementById('btn-plan-next-day').style.display = (aktiverFokusTab === 'notizen')  ? '' : 'none';
  document.getElementById('btn-add-contact').style.display   = (aktiverFokusTab === 'netzwerk') ? '' : 'none';
  document.getElementById('btn-sync-jira').style.display     = (aktiverFokusTab === 'jira')     ? '' : 'none';
  document.getElementById('btn-refresh-ziele').style.display = (aktiverFokusTab === 'ziele')    ? '' : 'none';
  document.getElementById('btn-refresh-news').style.display  = (aktiverFokusTab === 'news')     ? '' : 'none';
  document.getElementById('btn-add-video').style.display     = (aktiverFokusTab === 'videos')   ? '' : 'none';
  const hasBtn = aktiverFokusTab === 'links' || aktiverFokusTab === 'notizen' || aktiverFokusTab === 'netzwerk' || aktiverFokusTab === 'jira' || aktiverFokusTab === 'news' || aktiverFokusTab === 'ziele' || aktiverFokusTab === 'videos';
  document.querySelector('#tile-fokus .tile-footer').classList.toggle('has-button', hasBtn);
  document.getElementById('btn-fokus-placeholder').style.display = hasBtn ? 'none' : '';
}

// ── Save helpers (via fetch PUT — works with live-server proxy or local) ──
// Since live-server is read-only, we save changes as a download for demo;
// In production replace with a small backend endpoint.
// For now we keep changes in memory and update the DOM, and offer download.

let actionsData = [];
let learnLines  = [];

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
  fetch(`${WRITE_SERVER}/actions.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(actionsData, null, 2),
  }).catch(() => {});
}

function saveLearnFile() {
  rawLearn = learnLines.join('\n') + '\n';
  writeFile('learn.txt', rawLearn);
}

function saveLinksFile() {
  fetch(`${WRITE_SERVER}/links.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(linksData, null, 2),
  }).catch(() => {
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(linksData, null, 2));
    a.download = 'links.json';
    a.click();
  });
}

function saveLernplanProgress() {
  fetch(`${WRITE_SERVER}/learningplan_progress.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(learningplanProgress, null, 2),
  }).catch(() => {});
}

function saveNotizenFile() {
  fetch(`${WRITE_SERVER}/notes.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(notizenData, null, 2),
  }).catch(() => {});
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
  document.body.className = phase.css + ' mode-' + currentMode;
  const quoteEl = document.getElementById('header-quote');
  if (quoteEl && quotesAll.length) {
    const now2 = new Date();
    const startOfYear = new Date(now2.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now2 - startOfYear) / 86400000) - 1;
    if (quoteIndex < 0) quoteIndex = ((dayOfYear % quotesAll.length) + quotesAll.length) % quotesAll.length;
    const q = quotesAll[quoteIndex];
    if (q) {
      const surname = (q.author || '').split(/\s+/).pop();
      quoteEl.textContent = '„' + q.text + '“ — ' + surname;
      quoteEl.title = q.author + (q.work ? ', ' + q.work : '');
    }
  }
  if (currentMode === 'simple') renderSimpleBar();
}

// ── Render Kalender ────────────────────────────────────────────────────────
function renderKalender() {
  const now    = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const calBody = document.getElementById('cal-body');
  const calDate = document.getElementById('cal-date');

  // Focus mode: compact calendar (current + next event only)
  if (currentMode === 'focus') {
    calDate.textContent = '';
    const timed = icsEvents.filter(e => !e.allDay);
    const current = timed.find(e => {
      const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      const en = e.endDate.getHours() * 60 + e.endDate.getMinutes();
      return curMin >= s && curMin <= en;
    });
    const next = timed.find(e => {
      const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      return s > curMin;
    });
    let html = '';
    if (current) {
      html += `<div class="cal-item cal-current"><span class="cal-dot"></span><span class="cal-time">bis ${fmtTime(current.endDate)}</span><span>${escapeHtml(current.title)}</span></div>`;
    }
    if (next) {
      html += `<div class="cal-item${current ? '' : ' cal-current'}"><span class="cal-dot"></span><span class="cal-time">ab ${fmtTime(next.startDate)}</span><span>${escapeHtml(next.title)}</span></div>`;
    }
    if (!current && !next) {
      if (now.getHours() >= 17 && icsTomorrowEvents.length > 0) {
        const firstTom = icsTomorrowEvents.filter(e => !e.allDay).sort((a, b) => a.startDate - b.startDate)[0];
        if (firstTom) {
          const dayName = firstTom.startDate.toLocaleDateString('de-DE', { weekday: 'long' });
          html = `<div class="cal-item"><span class="cal-dot"></span><span class="cal-time">${dayName} ab ${fmtTime(firstTom.startDate)}</span><span>${escapeHtml(firstTom.title)}</span></div>`;
        }
      }
      if (!html) html = '<div style="color:var(--text-muted);font-size:0.72rem;padding:4px 0">Keine Termine</div>';
    }
    calBody.innerHTML = html;
    return;
  }

  const calDateStr = now.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  const calTimeStr = icsLoadedAt ? icsLoadedAt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : '';
  const t0600 = new Date(now); t0600.setHours(6, 0, 0, 0);
  const t1200 = new Date(now); t1200.setHours(12, 0, 0, 0);
  let nextCal;
  if (now < t0600)      nextCal = t0600;
  else if (now < t1200) nextCal = t1200;
  else { nextCal = new Date(t0600); nextCal.setDate(nextCal.getDate() + 1); }
  const todayDateStr = now.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  const isNextCalToday = nextCal.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) === todayDateStr;
  const nextCalDay = nextCal.toLocaleDateString('de-DE', { weekday: 'short' });
  const nextCalTime = nextCal.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
  const nextCalStr = isNextCalToday ? nextCalTime : nextCalDay + ' ' + nextCalTime;
  calDate.textContent = (calTimeStr ? calDateStr + ' ' + calTimeStr : calDateStr) + ' · ⟳ ' + nextCalStr;

  // Use ICS events if available, otherwise fall back to rawTermine
  if (icsEvents.length > 0) {
    const renderEvent = (e, extraCls = '') => {
      const syncMatch = syncFiles.find(sf => {
        const nameParts = sf.name.split(/[, ]+/).filter(p => p.length > 2);
        return nameParts.some(p => new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(e.title));
      });
      const syncLink = syncMatch
        ? ` <span class="cal-sync-link" data-syncfile="${escapeHtml(syncMatch.file)}" data-syncname="${escapeHtml(syncMatch.name)}">&#x1F4CB;</span>`
        : '';
      const badges = (e.tentative ? ' <span class="cal-badge cal-badge-tent" title="Tentativ">?</span>' : '')
                   + (e.optional  ? ' <span class="cal-badge cal-badge-opt"  title="Optional">opt</span>' : '');
      if (e.allDay) {
        return `<div class="cal-item cal-allday-item${extraCls ? ' ' + extraCls : ''}">
          <span class="cal-dot"></span>
          <span class="cal-time" style="font-style:italic">Ganztag</span>
          <span>${escapeHtml(e.title)}${badges}${syncLink}</span>
        </div>`;
      }
      const startMin = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      const endMin   = e.endDate.getHours()   * 60 + e.endDate.getMinutes();
      const past     = curMin > endMin;
      const current  = curMin >= startMin && curMin <= endMin;
      let cls = 'cal-item';
      if (extraCls) cls += ' ' + extraCls;
      else if (current) cls += ' cal-current';
      else if (past)    cls += ' cal-past';
      return `<div class="${cls}">
        <span class="cal-dot"></span>
        <span class="cal-time">${fmtTime(e.startDate)}–${fmtTime(e.endDate)}</span>
        <span>${escapeHtml(e.title)}${badges}${syncLink}</span>
      </div>`;
    };

    // Ganztagstermine zuerst, dann normale Termine nach Zeit
    const allDay  = icsEvents.filter(e => e.allDay);
    const timed   = icsEvents.filter(e => !e.allDay);
    calBody.innerHTML = [...allDay, ...timed].map(e => renderEvent(e)).join('');
    calBody.querySelectorAll('.cal-sync-link').forEach(el => {
      el.addEventListener('click', ev => { ev.stopPropagation(); openSyncModal(el.dataset.syncfile, el.dataset.syncname); });
    });

    if (now.getHours() >= 17 && icsTomorrowEvents.length > 0) {
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowLabel = tomorrow.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit' });
      const allDayTom = icsTomorrowEvents.filter(e => e.allDay);
      const timedTom  = icsTomorrowEvents.filter(e => !e.allDay);
      calBody.innerHTML += `<div class="cal-tomorrow-header">${tomorrowLabel}</div>`
        + [...allDayTom, ...timedTom].map(e => renderEvent(e, 'cal-tomorrow')).join('');
      calBody.querySelectorAll('.cal-sync-link').forEach(el => {
        if (!el._bound) { el._bound = true; el.addEventListener('click', ev => { ev.stopPropagation(); openSyncModal(el.dataset.syncfile, el.dataset.syncname); }); }
      });
    }
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
  localStorage.setItem('fokusTab', tab);
  document.querySelectorAll('.fokus-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.getElementById('btn-add-learn').style.display   = (tab === 'links')   ? '' : 'none';
  document.getElementById('btn-add-notiz').style.display   = (tab === 'notizen') ? '' : 'none';
  document.getElementById('btn-plan-next-day').style.display = (tab === 'notizen') ? '' : 'none';
  document.getElementById('btn-add-contact').style.display = (tab === 'netzwerk') ? '' : 'none';
  document.getElementById('btn-sync-jira').style.display     = (tab === 'jira')     ? '' : 'none';
  document.getElementById('btn-refresh-ziele').style.display = (tab === 'ziele')    ? '' : 'none';
  document.getElementById('btn-refresh-news').style.display  = (tab === 'news')     ? '' : 'none';
  document.getElementById('btn-add-video').style.display     = (tab === 'videos')   ? '' : 'none';
  const hasBtn = tab === 'links' || tab === 'notizen' || tab === 'netzwerk' || tab === 'jira' || tab === 'news' || tab === 'ziele' || tab === 'videos';
  document.querySelector('#tile-fokus .tile-footer').classList.toggle('has-button', hasBtn);
  renderFokus();
  renderFokus();
}

function renderFokus() {
  parseLearn();
  const fokusBody = document.getElementById('fokus-body');
  const fokusKat  = document.getElementById('fokus-kategorie');

  if (aktiverFokusTab === 'notizen') {
    fokusKat.textContent = '';
    renderNotizen(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'links') {
    fokusKat.textContent = '';
    renderLinks(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'netzwerk') {
    fokusKat.textContent = contactsData.length ? `${contactsData.length} Kontakte` : '';
    renderNetzwerk(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'wissen') {
    fokusKat.textContent = '';
    renderWissen(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'jira') {
    const openCount = jiraData.filter(j => j.status !== 'Done' && j.status !== 'Closed').length;
    fokusKat.textContent = openCount ? openCount + ' offen' : '';
    renderJira(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'news') {
    fokusKat.textContent = newsData && newsData.items ? newsData.items.length + ' Neues' : '';
    renderNews(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'ziele') {
    fokusKat.textContent = goalsData ? goalsData.goals.length + ' Ziele' : '';
    renderZiele(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'videos') {
    fokusKat.textContent = videosData.length ? videosData.length + ' Videos' : '';
    renderVideos(fokusBody);
    return;
  }

  fokusBody.innerHTML = '';
}


// ── Render Jira ─────────────────────────────────────────────────────────
function renderJiraItem(j) {
  const st = (j.status || '').toLowerCase();
  const isCompleted = st === 'completed' || st === 'finished' || st === 'done' || st === 'closed';
  const isClosed = st === 'cancelled' || st === 'stopped' || st === 'inactive';
  const isRejected = st === 'rejected';
  const isHousekeeping = (j.summary || '').toUpperCase().startsWith('HOUSEKEEPING');
  const isBlocked = (j.summary || '').toUpperCase().startsWith('BLOCKED');
  const isDone = isCompleted || isClosed || isRejected;
  const statusClass = isRejected ? 'jira-status-done jira-rejected'
                    : isCompleted ? 'jira-status-done jira-completed'
                    : isClosed ? 'jira-status-done jira-closed'
                    : isHousekeeping ? 'jira-status-hold'
                    : isBlocked ? 'jira-status-blocked'
                    : st.includes('progress') || st.includes('review') || st === 'running' ? 'jira-status-progress'
                    : st === 'blocked' ? 'jira-status-blocked'
                    : st === 'on hold' ? 'jira-status-hold'
                    : 'jira-status-todo';
  const shortKey = j.category
    ? j.category + '-' + (j.key || '').replace(/^[A-Z]+-/, '')
    : j.key.replace('CLMSLORCHESTRATOR', 'SLOCON').replace(/CLMSLCCI4ABAP/, 'CLOUDLM');
  let dot = '';
  if (isDone) {
    const summaryUp = (j.summary || '').toUpperCase();
    const failed = summaryUp.includes('CANCELLED') || st === 'rejected' || st === 'stopped' || st === 'cancelled';
    dot = '<span class="jira-dot ' + (failed ? 'jira-dot-fail' : 'jira-dot-pass') + '"></span>';
  }
  return '<a class="jira-pill ' + statusClass + '" href="' + safeHref(j.url) + '" title="' + escapeHtml(j.summary) + ' [' + escapeHtml(j.status) + ']" onclick="openExternal(this.href);return false;">' + escapeHtml(shortKey) + dot + '</a>';
}

function renderJiraToolsetItem(j) {
  const cat = j.category || '';
  const num = (j.key || '').replace(/^[A-Z]+-/, '');
  const label = num;
  const fullLabel = cat ? cat + '-' + num : j.key;
  const st = (j.status || '').toLowerCase();
  const isCompleted = st === 'completed' || st === 'finished' || st === 'done' || st === 'closed';
  const isClosed = st === 'cancelled' || st === 'stopped' || st === 'inactive';
  const isRejected = st === 'rejected';
  const isHousekeeping = (j.summary || '').toUpperCase().startsWith('HOUSEKEEPING');
  const isBlocked = (j.summary || '').toUpperCase().startsWith('BLOCKED');
  const isDone = isCompleted || isClosed || isRejected;
  const statusClass = isRejected ? 'jira-status-done jira-rejected'
                    : isCompleted ? 'jira-status-done jira-completed'
                    : isClosed ? 'jira-status-done jira-closed'
                    : isHousekeeping ? 'jira-status-hold'
                    : isBlocked ? 'jira-status-blocked'
                    : st.includes('progress') || st.includes('review') || st === 'running' ? 'jira-status-progress'
                    : st === 'blocked' ? 'jira-status-blocked'
                    : st === 'on hold' ? 'jira-status-hold'
                    : 'jira-status-todo';
  let dot = '';
  if (isDone) {
    const summaryUp = (j.summary || '').toUpperCase();
    const failed = summaryUp.includes('CANCELLED') || st === 'rejected' || st === 'stopped' || st === 'cancelled';
    dot = '<span class="jira-dot ' + (failed ? 'jira-dot-fail' : 'jira-dot-pass') + '"></span>';
  }
  return '<a class="jira-pill ' + statusClass + '" href="' + safeHref(j.url) + '" title="' + escapeHtml(fullLabel) + ': ' + escapeHtml(j.summary) + ' [' + escapeHtml(j.status) + ']" onclick="openExternal(this.href);return false;">' + escapeHtml(label) + dot + '</a>';
}

function renderJira(container) {
  if (!jiraData.length && !_jiraStatusMsg) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Jira-Items geladen.</div>';
    return;
  }
  let bannerHtml = '';
  if (_jiraStatusMsg) {
    const cls = _jiraStatusType === 'ok' ? ' jira-status-ok' : _jiraStatusType === 'error' ? ' jira-status-error' : '';
    bannerHtml = '<div class="jira-status-banner' + cls + '">' + escapeHtml(_jiraStatusMsg) + '</div>';
  }
  if (!jiraData.length) {
    container.innerHTML = bannerHtml + '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Jira-Items geladen.</div>';
    return;
  }
  const statusOrder = { 'In Progress': 0, 'Running': 0, 'In Review': 1, 'On Hold': 2, 'Blocked': 2, 'To Do': 3, 'Open': 3, 'Planned': 4, 'Reopened': 3, 'Rejected': 7, 'Inactive': 8, 'Done': 8, 'Closed': 8, 'Cancelled': 8, 'Finished': 8 };
  const sortItems = (items) => [...items].sort((a, b) => {
    const sa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 5;
    const sb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 5;
    if (sa !== sb) return sa - sb;
    return (b.updated || '').localeCompare(a.updated || '');
  });
  const closedStatuses = ['Done', 'Closed', 'Cancelled', 'Finished', 'Rejected', 'Completed', 'Stopped', 'Inactive'];
  const toolsetProjects = ['CLMOQHEC', 'HECSPCVAL', 'CLMCONSUMABILITY'];
  const isToolset = j => !j.personal && (j.releases && j.releases.length || toolsetProjects.includes(j.project));
  const open = jiraData.filter(j => !closedStatuses.includes(j.status));
  const closedToolset = jiraData.filter(j => closedStatuses.includes(j.status) && isToolset(j));
  const closedPersonal = jiraData.filter(j => closedStatuses.includes(j.status) && j.personal && (j.releases && j.releases.length));
  const hasItems = open.length || closedToolset.length || closedPersonal.length;
  if (!hasItems) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Alle Items erledigt.</div>';
    return;
  }
  const myOpen = sortItems(open.filter(j => !isToolset(j)));
  const myItems = sortItems(myOpen.concat(closedPersonal));
  const toolsetOpen = open.filter(j => isToolset(j));
  const toolsetItems = toolsetOpen.concat(closedToolset);

  let html = bannerHtml;
  if (jiraSetupHint) html += '<div class="jira-setup-hint">' + escapeHtml(jiraSetupHint) + '</div>';

  if (myItems.length) {
    const myGroups = {};
    myItems.forEach(j => {
      const p = j.project || 'Sonstige';
      if (!myGroups[p]) myGroups[p] = [];
      myGroups[p].push(j);
    });
    const myKeys = Object.keys(myGroups).sort();
    html += '<details class="jira-tree-root" open>'
      + '<summary class="jira-tree-summary-root">Meine <span class="jira-tree-count">(' + myItems.length + ')</span></summary>'
      + myKeys.map(p =>
          '<div class="jira-cat-group">'
          + '<span class="jira-cat-label" data-cat="' + escapeHtml(p.replace('CLMSLORCHESTRATOR', 'SLOCON').replace(/CLMSLCCI4ABAP/, 'CLOUDLM')) + '">' + escapeHtml(p.replace('CLMSLORCHESTRATOR', 'SLOCON').replace(/CLMSLCCI4ABAP/, 'CLOUDLM')) + '</span>'
          + '<span class="jira-pill-wrap">' + myGroups[p].map(renderJiraItem).join('') + '</span>'
          + '</div>'
        ).join('')
      + '</details>';
  }

  if (toolsetItems.length) {
    const releaseMap = {};
    toolsetItems.forEach(j => {
      if (j.releases && j.releases.length) {
        j.releases.forEach(rel => {
          if (!releaseMap[rel]) releaseMap[rel] = [];
          releaseMap[rel].push(j);
        });
      } else {
        if (!releaseMap['—']) releaseMap['—'] = [];
        releaseMap['—'].push(j);
      }
    });
    const releaseKeys = Object.keys(releaseMap).sort((a, b) => {
      if (a === '—') return 1; if (b === '—') return -1;
      return b.localeCompare(a);
    });
    const uniqueCount = toolsetItems.length;
    const catOrder = { 'REGR': 0, 'RAMP': 1, 'SLV': 2 };
    html += '<details class="jira-tree-root">'
      + '<summary class="jira-tree-summary-root">SL Toolset for Cloud <span class="jira-tree-count">(' + uniqueCount + ')</span></summary>'
      + releaseKeys.map(rel => {
          const items = sortItems(releaseMap[rel]);
          const catGroups = {};
          items.forEach(j => {
            const cat = j.category || 'Sonstige';
            if (!catGroups[cat]) catGroups[cat] = [];
            catGroups[cat].push(j);
          });
          const catKeys = Object.keys(catGroups).sort((a, b) => ((catOrder[a] ?? 9) - (catOrder[b] ?? 9)));
          const criticalItems = items.filter(j => j.category === 'REGR' || j.category === 'SLV');
          const rampItems = items.filter(j => j.category === 'RAMP');
          const doneStatuses = ['completed', 'finished', 'done', 'closed', 'cancelled', 'stopped', 'rejected'];
          const allDone = items.every(j => doneStatuses.includes((j.status || '').toLowerCase()));
          let passCount = 0, failCount = 0;
          if (allDone) {
            const countItem = (j) => {
              const s = (j.status || '').toLowerCase();
              const su = (j.summary || '').toUpperCase();
              return su.includes('CANCELLED') || s === 'rejected' || s === 'stopped' || s === 'cancelled';
            };
            criticalItems.forEach(j => { if (countItem(j)) failCount++; else passCount++; });
          }
          const relLabel = rel === '—' ? 'Kein Release' : 'Release ' + escapeHtml(rel);
          let relStats = '';
          if (allDone && (passCount + failCount > 0)) {
            relStats = '<span class="jira-rel-stats">'
              + '<span class="jira-rel-pass">' + passCount + '</span>'
              + '<span class="jira-rel-sep">/</span>'
              + '<span class="jira-rel-fail">' + failCount + '</span>'
              + '</span>';
          }
          const relDot = (allDone && failCount === 0) ? '<span class="jira-dot jira-dot-pass"></span>' : '';
          const relClass = 'jira-tree-summary-project' + (allDone ? ' jira-release-done' : '');
          return '<details class="jira-tree-project"' + (allDone ? '' : ' open') + '>'
            + '<summary class="' + relClass + '">'
            + '<span class="jira-rel-label">' + relLabel + '</span>'
            + relStats + relDot
            + '</summary>'
            + catKeys.map(cat =>
                '<div class="jira-cat-group">'
                + '<span class="jira-cat-label" data-cat="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</span>'
                + '<span class="jira-pill-wrap">' + catGroups[cat].map(renderJiraToolsetItem).join('') + '</span>'
                + '</div>'
              ).join('')
            + '</details>';
        }).join('')
      + '</details>';
  }

  if (jiraLastSyncTs) {
    const d = new Date(jiraLastSyncTs);
    const syncTime = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const syncDate = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
    html += '<div class="news-meta">Sync ' + syncDate + ' ' + syncTime + '</div>';
  }
  container.innerHTML = html;
}

function openExternal(url) {
  fetch(WRITE_SERVER + '/open-url', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({url:url}) }).catch(() => {
    window.open(url, '_blank');
  });
}
let jiraSetupMode = false;
let jiraSetupHint = '';
let jiraLastSyncTs = 0;

async function pollJiraStatus(maxMs, intervalMs) {
  const deadline = Date.now() + maxMs;
  const oldTs = jiraLastSyncTs || 0;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch(v('data/jira_status.json'));
      if (res.ok) {
        const data = await res.json();
        if (data.ts && data.ts > oldTs) return data;
      }
    } catch(e) {}
  }
  return null;
}

function updateJiraButton(text, enabled) {
  const btn = document.getElementById('btn-sync-jira');
  if (!btn) return;
  btn.innerHTML = text;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '' : '0.5';
}

let _jiraStatusMsg = '';
let _jiraStatusType = '';
function setJiraStatus(msg, type) {
  _jiraStatusMsg = msg;
  _jiraStatusType = type || '';
  if (aktiverFokusTab === 'jira') {
    const el = document.getElementById('fokus-body');
    let banner = el.querySelector('.jira-status-banner');
    if (msg) {
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'jira-status-banner';
        el.prepend(banner);
      }
      banner.textContent = msg;
      banner.className = 'jira-status-banner' + (type === 'ok' ? ' jira-status-ok' : type === 'error' ? ' jira-status-error' : '');
    } else if (banner) {
      banner.remove();
    }
  }
}

async function syncJira() {
  if (jiraSyncing) return;
  jiraSyncing = true;
  updateJiraButton('Sync...', false);
  setJiraStatus('Jira wird synchronisiert...');
  try {
    const resp = await fetch(WRITE_SERVER + '/run-sync-jira', { method: 'POST' });
    if (!resp.ok) { setJiraStatus('Sync konnte nicht gestartet werden (Server-Fehler)', 'error'); updateJiraButton('Synchronisieren', true); jiraSyncing = false; return; }
    const status = await pollJiraStatus(30000, 3000);
    if (status && status.status === 'ok') {
      const [res, jtRes] = await Promise.all([fetch(v('data/jira.json')), fetch(v('data/jira_toolset.json'))]);
      if (res.ok) jiraData = await res.json();
      if (jtRes.ok) jiraToolsetData = await jtRes.json();
      jiraSetupMode = false;
      jiraSetupHint = '';
      jiraLastSyncTs = status.ts || Date.now();
      updateJiraButton('Synchronisieren', true);
      setJiraStatus('Synchronisiert: ' + (status.count || '?') + ' Items', 'ok');
      setTimeout(() => { setJiraStatus(''); if (aktiverFokusTab === 'jira') renderFokus(); }, 3000);
    } else {
      jiraSetupMode = true;
      jiraSetupHint = '';
      updateJiraButton('Synchronisieren', true);
      setJiraStatus('Token abgelaufen. Bitte in PowerShell ausfuehren: setup_jira.ps1', 'error');
    }
  } catch(e) {
    jiraSetupMode = true;
    jiraSetupHint = 'Jira-Sync fehlgeschlagen.';
    updateJiraButton('Synchronisieren', true);
    setJiraStatus('Sync fehlgeschlagen', 'error');
  }
  jiraSyncing = false;
  if (aktiverFokusTab === 'jira') renderFokus();
}

async function setupJira() {
  if (jiraSyncing) return;
  jiraSyncing = true;
  updateJiraButton('Login...', false);
  jiraSetupHint = '';
  setJiraStatus('Jira Setup wird gestartet...');
  const oldTs = jiraLastSyncTs || 0;
  try {
    const resp = await fetch(WRITE_SERVER + '/run-setup-jira', { method: 'POST' });
    if (!resp.ok) { setJiraStatus('Setup konnte nicht gestartet werden', 'error'); updateJiraButton('Synchronisieren', true); jiraSyncing = false; return; }
    const deadline = Date.now() + 200000;
    let status = null;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(v('data/jira_status.json'));
        if (res.ok) status = await res.json();
      } catch(e) { continue; }
      if (!status || !status.ts || status.ts <= oldTs) continue;
      if (status.status === 'login_required') {
        jiraSetupHint = 'Bitte im Browser einloggen (SAP SSO)...';
        setJiraStatus('Warte auf Browser-Login (SAP SSO)...');
        if (aktiverFokusTab === 'jira') renderFokus();
        continue;
      }
      if (status.status === 'ok') break;
      if (status.status === 'error' || status.status === 'timeout') break;
    }
    if (status && status.ts > oldTs && status.status === 'ok') {
      const [res, jtRes] = await Promise.all([fetch(v('data/jira.json')), fetch(v('data/jira_toolset.json'))]);
      if (res.ok) jiraData = await res.json();
      if (jtRes.ok) jiraToolsetData = await jtRes.json();
      jiraSetupMode = false;
      jiraSetupHint = '';
      jiraLastSyncTs = status.ts || Date.now();
      updateJiraButton('Synchronisieren', true);
      setJiraStatus('Setup erfolgreich, ' + (status.count || '?') + ' Items geladen', 'ok');
      setTimeout(() => { setJiraStatus(''); if (aktiverFokusTab === 'jira') renderFokus(); }, 3000);
    } else {
      jiraSetupHint = status && status.message ? status.message : 'Setup fehlgeschlagen oder Timeout.';
      updateJiraButton('Synchronisieren', true);
      setJiraStatus(jiraSetupHint, 'error');
    }
  } catch(e) {
    jiraSetupHint = 'Setup-Fehler.';
    updateJiraButton('Synchronisieren', true);
    setJiraStatus('Setup-Fehler', 'error');
  }
  jiraSyncing = false;
  if (aktiverFokusTab === 'jira') renderFokus();
}

function handleJiraButton() {
  syncJira();
}

function renderNews(container) {
  if (!newsData || !newsData.items || !newsData.items.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Kein Neues geladen. Klicke Aktualisieren im Footer.</div>';
    return;
  }
  let metaLabel = '';
  if (newsData.ts) {
    const d = new Date(newsData.ts);
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
    metaLabel = date + ' ' + time;
  }
  container.innerHTML =
    '<div class="news-source">squirrel-news.net</div>' +
    newsData.items.map(item =>
      `<div class="news-item">${escapeHtml(item)}</div>`
    ).join('') +
    (metaLabel ? `<div class="news-meta">${metaLabel}</div>` : '');
}

// ── Render Videos ──────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      return u.searchParams.get('v') || '';
    }
  } catch(e) {}
  return '';
}

function renderVideos(container) {
  if (!videosData.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Videos. Klicke + Video im Footer.</div>';
    return;
  }
  const groups = {};
  videosData.forEach(v => {
    const cat = v.category || 'Andere';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(v);
  });
  const catOrder = Object.keys(groups).sort((a, b) => {
    if (a === 'Andere') return 1;
    if (b === 'Andere') return -1;
    return a.localeCompare(b, 'de');
  });
  let html = '';
  catOrder.forEach(cat => {
    const items = groups[cat];
    html += `<details class="video-group" open>`;
    html += `<summary class="wissen-section-header">${escapeHtml(cat)} (${items.length})</summary>`;
    items.forEach(vid => {
      const ytId = !vid.url ? vid.id : '';
      const clickUrl = vid.url || ('https://www.youtube.com/watch?v=' + encodeURIComponent(vid.id));
      html += `<div class="video-item">`;
      if (ytId) {
        const thumbUrl = 'https://img.youtube.com/vi/' + encodeURIComponent(ytId) + '/mqdefault.jpg';
        html += `<div class="video-player-wrap" data-url="${escapeHtml(clickUrl)}">`;
        html += `<img class="video-thumb" src="${thumbUrl}" alt="" loading="lazy" />`;
        html += `<div class="video-play-icon">&#9654;</div>`;
        html += `</div>`;
      } else {
        html += `<div class="video-link-icon" data-url="${escapeHtml(clickUrl)}" title="Im Browser oeffnen">&#127760;</div>`;
      }
      html += `<div class="video-info">`;
      html += `<div class="video-title video-edit" data-id="${escapeHtml(vid.id)}" title="Bearbeiten">${escapeHtml(vid.title)}</div>`;
      if (vid.added) html += `<div class="video-meta">${escapeHtml(vid.added)}</div>`;
      html += `<button class="btn-ghost video-delete" data-id="${escapeHtml(vid.id)}" title="Entfernen">&#10005;</button>`;
      html += `</div></div>`;
    });
    html += `</details>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.video-player-wrap, .video-link-icon').forEach(el => {
    el.addEventListener('click', function() { openExternal(this.dataset.url); });
  });
  container.querySelectorAll('.video-delete').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.dataset.id;
      videosData = videosData.filter(v => v.id !== id);
      saveVideos();
      renderFokus();
    });
  });
  container.querySelectorAll('.video-edit').forEach(el => {
    el.addEventListener('click', function() {
      const id = this.dataset.id;
      const vid = videosData.find(v => v.id === id);
      if (!vid) return;
      const modal = document.getElementById('modal-video');
      modal.dataset.editId = id;
      document.getElementById('new-video-url').value = vid.url || ('https://www.youtube.com/watch?v=' + vid.id);
      document.getElementById('new-video-title').value = vid.title;
      document.getElementById('new-video-category').value = vid.category || 'Andere';
      modal.style.display = 'flex';
      setModalLock();
      document.getElementById('new-video-title').focus();
    });
  });
}

// ── Render Ziele ────────────────────────────────────────────────────────────
function renderZiele(container) {
  if (!goalsData || !goalsData.goals || !goalsData.goals.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Ziele geladen.</div>';
    return;
  }
  const mails = Array.isArray(mailData) ? mailData : [];
  let totalMatched = 0;

  const goalsHtml = goalsData.goals.map(goal => {
    const kws = (goal.keywords || []).map(k => k.toLowerCase());
    const matched = [];
    mails.forEach(m => {
      const subj = (m.subject || m.betreff || '').toLowerCase();
      const hits = kws.filter(k => subj.includes(k));
      if (hits.length) matched.push({ mail: m, keywords: hits });
    });
    totalMatched += matched.length;
    const countBadge = matched.length
      ? `<span class="ziele-mail-count">${matched.length} Mail${matched.length !== 1 ? 's' : ''}</span>`
      : '<span class="ziele-mail-count ziele-no-mails">0 Mails</span>';
    const mailList = matched.length
      ? matched.slice(0, 15).map(({ mail: m, keywords: hits }) => {
          const d = m.date || m.datum || '';
          const prio = mailPrio(m);
          const pm = PRIO_META[prio] || PRIO_META.fyi;
          const subj = m.subject || m.betreff || '';
          const body = m.body || '';
          const from = m.typ === 'gesendet' ? '→ gesendet' : shortName(m.from || '');
          const kwBadges = hits.map(k => `<span class="ziele-kw">${escapeHtml(k)}</span>`).join('');
          return `<div class="ziele-mail"><div class="ziele-mail-row"><span class="mail-prio ${pm.cls}" title="${pm.title}">${pm.label}</span><span class="ziele-mail-date">${escapeHtml(d)}</span><span class="ziele-mail-from">${escapeHtml(from)}</span><span class="ziele-mail-subj">${escapeHtml(subj)}</span>${kwBadges}</div><div class="ziele-mail-body" style="display:none">${escapeHtml(body)}</div></div>`;
        }).join('') + (matched.length > 15 ? `<div class="ziele-mail ziele-more">+ ${matched.length - 15} weitere</div>` : '')
      : '<div class="ziele-no-match">Keine Mails diese Woche</div>';
    return `<details class="ziele-goal" open>
      <summary class="ziele-goal-header">
        <span class="ziele-weight">${goal.weight}%</span>
        <span class="ziele-title">${escapeHtml(goal.title)}</span>
        ${countBadge}
      </summary>
      <div class="ziele-mail-list">${mailList}</div>
    </details>`;
  }).join('');

  const weekLabel = 'KW ' + getISOWeek(new Date());
  if (!zieleLastRefresh) zieleLastRefresh = new Date();
  const lastStr = zieleLastRefresh.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  container.innerHTML =
    `<div class="ziele-header">${escapeHtml(goalsData.year + '')} &middot; ${weekLabel} &middot; ${totalMatched} Mail-Bezuege</div>`
    + `<div class="ziele-meta">Stand: ${lastStr}</div>`
    + goalsHtml;
  container.querySelectorAll('.ziele-mail').forEach(el => {
    const body = el.querySelector('.ziele-mail-body');
    if (body) el.style.cursor = 'pointer';
    if (body) el.addEventListener('click', () => {
      body.style.display = body.style.display === 'none' ? '' : 'none';
    });
  });
}

function renderNetzwerk(container) {
  if (!contactsData.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Kontakte vorhanden.</div>';
    return;
  }
  const searchEl = document.getElementById('nw-search');
  const searchVal = searchEl ? searchEl.value : '';
  const cursorPos = searchEl ? searchEl.selectionStart : 0;
  const sortMode = localStorage.getItem('nwSort') || 'freq';
  const topN = [...contactsData].sort((a, b) => (b.freq || 0) - (a.freq || 0)).slice(0, 20);
  const innerSet = new Set(topN.map(c => c.name));
  let sorted;
  if (sortMode === 'freq') {
    sorted = topN;
  } else {
    sorted = [...contactsData].sort((a, b) => {
      if (sortMode === 'alpha') return (a.name || '').localeCompare(b.name || '', 'de');
      if (sortMode === 'dept') {
        const ra = (a.rolle || ''), rb = (b.rolle || '');
        const da = ra.includes(',') ? ra.split(',')[0].trim() : ra;
        const db = rb.includes(',') ? rb.split(',')[0].trim() : rb;
        if (!da && db) return 1;
        if (da && !db) return -1;
        return da.localeCompare(db, 'de') || (a.name || '').localeCompare(b.name || '', 'de');
      }
      return (b.freq || 0) - (a.freq || 0);
    });
  }
  const q = searchVal.toLowerCase();
  const filtered = q ? sorted.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.rolle || '').toLowerCase().includes(q)
  ) : sorted;
  const searchBar = `<input class="nw-search" id="nw-search" placeholder="Suche..." value="${escapeHtml(searchVal)}" oninput="renderFokus()" />`;
  const toggleBar = `<div class="nw-sort-bar">
    <button class="nw-sort-btn${sortMode === 'freq' ? ' nw-sort-active' : ''}" onclick="setNwSort('freq')">Oft</button>
    <button class="nw-sort-btn${sortMode === 'alpha' ? ' nw-sort-active' : ''}" onclick="setNwSort('alpha')">A-Z</button>
    <button class="nw-sort-btn${sortMode === 'dept' ? ' nw-sort-active' : ''}" onclick="setNwSort('dept')">Abteilung</button>
  </div>`;
  const renderItem = (c) => {
    const origIdx = contactsData.indexOf(c);
    const rolle = c.rolle
      ? `<div class="nw-rolle">${escapeHtml(c.rolle)}</div>`
      : `<div class="nw-rolle nw-rolle-empty">Rolle / Notiz...</div>`;
    const dates = c.first && c.last && c.first !== c.last
      ? `${c.first} – ${c.last}` : (c.last || c.first || '');
    const isInner = innerSet.has(c.name);
    const marker = isInner ? '<span class="nw-inner" title="Inner Circle">&#x2726;</span>' : '';
    return `<div class="nw-item${isInner ? ' nw-inner-row' : ''}" onclick="editNetzwerk(${origIdx})">
      <div class="nw-left">
        <div class="nw-name">${marker}${escapeHtml(c.name)}</div>
        ${sortMode === 'alpha' ? rolle : ''}
      </div>
      <div class="nw-right">
        <div class="nw-dates">${dates}</div>
      </div>
    </div>`;
  };
  if (sortMode === 'dept' || sortMode === 'freq') {
    const groups = {};
    filtered.forEach(c => {
      const raw = c.rolle || '';
      const dept = raw.includes(',') ? raw.split(',')[0].trim() : raw;
      (groups[dept] = groups[dept] || []).push(c);
    });
    const deptKeys = Object.keys(groups).filter(d => d).sort((a, b) => a.localeCompare(b, 'de'));
    if (groups['']) deptKeys.push('');
    container.innerHTML = searchBar + toggleBar + deptKeys.map(dept => {
      const members = groups[dept].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
      const label = dept || 'Ohne Abteilung';
      return `<details class="nw-dept-group">
        <summary>${escapeHtml(label)} <span class="nw-dept-count">(${members.length})</span></summary>
        ${members.map(renderItem).join('')}
      </details>`;
    }).join('');
  } else {
    container.innerHTML = searchBar + toggleBar + filtered.map(renderItem).join('');
  }
  const newSearch = document.getElementById('nw-search');
  if (newSearch && searchVal) {
    newSearch.focus();
    newSearch.setSelectionRange(cursorPos, cursorPos);
  }
}

function setNwSort(mode) {
  localStorage.setItem('nwSort', mode);
  renderFokus();
}

function editNetzwerk(idx) {
  const c = contactsData[idx];
  if (!c) return;
  document.getElementById('modal-netzwerk-name').textContent = c.name;
  document.getElementById('edit-netzwerk-rolle').value = c.rolle || '';
  const modal = document.getElementById('modal-netzwerk');
  modal.dataset.editIdx = idx;
  modal.style.display = 'flex';
  setModalLock();
  document.getElementById('edit-netzwerk-rolle').focus();
}

async function saveContactRole(name, rolle) {
  try {
    const res = await fetch(v('data/contacts.json'));
    if (!res.ok) return;
    const fresh = await res.json();
    const entry = fresh.find(c => c.name === name);
    if (entry) {
      entry.rolle = rolle;
      await fetch(`${WRITE_SERVER}/contacts.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(fresh, null, 2),
      });
    }
    contactsData = fresh;
  } catch(e) { console.error('saveContactRole error:', e); }
}

function toShortName(full) {
  if (!full) return '';
  const trimmed = full.trim();
  if (/^DL\s/i.test(trimmed) || /^SAP\s/i.test(trimmed) || /^Cloud\s/i.test(trimmed) || /\(external/i.test(trimmed) || /[_\d]/.test(trimmed)) return '';
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map(s => s.trim());
    if (first && last) return `${first} ${last[0].toUpperCase()}.`;
    return '';
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

async function addContact(name, rolle) {
  try {
    const res = await fetch(v('data/contacts.json'));
    if (!res.ok) return;
    const fresh = await res.json();
    if (fresh.find(c => c.name === name)) {
      alert('Kontakt "' + name + '" existiert bereits.');
      return;
    }
    const today = todayStr();
    fresh.push({ name, rolle, first: today, last: today, mailFreq: 0, meetFreq: 0, freq: 0, _weekId: '' });
    await fetch(`${WRITE_SERVER}/contacts.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(fresh, null, 2),
    });
    contactsData = fresh;
  } catch(e) { console.error('addContact error:', e); }
}

async function deleteContact(name) {
  try {
    const res = await fetch(v('data/contacts.json'));
    if (!res.ok) return;
    const fresh = await res.json();
    const filtered = fresh.filter(c => c.name !== name);
    await fetch(`${WRITE_SERVER}/contacts.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(filtered, null, 2),
    });
    contactsData = filtered;
  } catch(e) { console.error('deleteContact error:', e); }
}


function renderLinks(container) {
  if (!linksData.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Links gespeichert</div>';
    return;
  }
  container.innerHTML = linksData.map((l, idx) =>
    `<div class="learn-item">
      <a class="learn-link" href="${safeHref(l.url)}" target="_blank" title="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>
      <button class="btn-x" title="Löschen" onclick="deleteLink(${idx})">✕</button>
    </div>`
  ).join('');
}


function renderWissen(container) {
  Promise.allSettled([
    fetch('knowledge/audiobooks.json').then(r => r.json()),
    fetch('knowledge/survivors.json').then(r => r.json()),
    fetch('knowledge/performance.json').then(r => r.json()),
  ]).then(([audiobooksRes, survivorsRes, performanceRes]) => {
    const renderBuecher = (data, icon) => data.map(b => {
      const gedanken = (b.kerngedanken || []).map(g =>
        `<div class="wissen-gedanke-item">
          <strong>${g.nr}. ${escapeHtml(g.titel)}</strong>
          <p class="wissen-beschreibung">${escapeHtml(g.beschreibung).replace(/\n/g, '<br>')}</p>
        </div>`
      ).join('');
      const gedankenBlock = gedanken ? `<details class="wissen-gedanke">
        <summary>Resümee</summary>
        <div class="wissen-gedanken">${gedanken}</div>
      </details>` : '';
      return `<details class="wissen-buch">
        <summary class="wissen-buch-header">
          <span>${icon} ${escapeHtml(b.titel)}</span>
          <span class="wissen-autor">${escapeHtml(b.autor)}</span>
        </summary>
        ${b.zusammenfassung ? `<p class="wissen-zusammenfassung">${escapeHtml(b.zusammenfassung)}</p>` : ''}
        ${gedankenBlock}
      </details>`;
    }).join('');

    const sectionHeader = label =>
      `<div class="wissen-section-header">${label}</div>`;

    let html = '';

    // Sport section
    if (sportData.length) {
      html += sectionHeader('🏃 Sport');
      html += sportData.map(item =>
        `<div class="learn-item">
          <span class="learn-kat" title="${escapeHtml(item.category)}">${escapeHtml(item.category.split(' ')[0])}</span>
          <a class="learn-link" href="${safeHref(item.url)}" target="_blank">${escapeHtml(item.title)}${item.creator ? ' <em style="color:var(--text-muted)">– ' + escapeHtml(item.creator) + '</em>' : ''}</a>
        </div>`
      ).join('');
    }

    // Lernplan sections (Führung + Tech)
    if (learningplanData && learningplanData.weeks) {
      const allDays = learningplanData.weeks.flatMap(w => w.days);
      const fuehrungDays = allDays.filter(d => (d.topics || []).some(t => FUEHRUNG_TOPICS.has(t.toLowerCase())));
      const techDays = allDays.filter(d => !(d.topics || []).some(t => FUEHRUNG_TOPICS.has(t.toLowerCase())));
      if (fuehrungDays.length) {
        html += sectionHeader('👥 Führung & People');
        html += renderLernplanSection(fuehrungDays);
      }
      if (techDays.length) {
        html += sectionHeader('⚙️ Tech & Engineering');
        html += renderLernplanSection(techDays);
      }
    }

    // Hörbücher
    if (audiobooksRes.status === 'fulfilled') {
      html += sectionHeader('📖 Hörbücher');
      html += renderBuecher(audiobooksRes.value, '📖');
    }
    const miscItems = [
      survivorsRes.status === 'fulfilled' ? renderBuecher(survivorsRes.value, '📋') : '',
      performanceRes.status === 'fulfilled' ? renderBuecher(performanceRes.value, '📉') : '',
    ].filter(Boolean).join('');
    if (miscItems) {
      html += sectionHeader('🗂 Misc');
      html += miscItems;
    }
    container.innerHTML = html || '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Inhalte geladen</div>';
  });
}

function renderLernplanSection(days) {
  const total = days.length;
  const done  = days.filter(d => learningplanProgress[d.day]).length;
  let html = `<div class="learningplan-header">
    <span class="learningplan-total">${done}/${total}</span>
  </div>`;
  html += days.map(day => {
    const isDone = !!learningplanProgress[day.day];
    return `<div class="learningplan-day${isDone ? ' learningplan-done' : ''}">
      <input type="checkbox" class="learningplan-cb" id="lp-${day.day}"
        ${isDone ? 'checked' : ''} onchange="toggleLernplanDay(${day.day}, this.checked)">
      <label for="lp-${day.day}">
        <a href="${safeHref(day.url)}" target="_blank">
          ${escapeHtml(day.title)} <span class="learningplan-creator">(${escapeHtml(day.creator)})</span>
        </a>
      </label>
    </div>`;
  }).join('');
  return html;
}

function formatNotizText(text) {
  const emojiRe = /^\p{Emoji}/u;
  return text.split('\n').map((line, i, arr) => {
    const escaped = escapeHtml(line);
    if (emojiRe.test(line)) {
      const prefix = i > 0 ? '<br>' : '';
      return `${prefix}<span style="color:var(--gold)">${escaped}</span>`;
    }
    return `<span style="color:var(--text-muted)">${escaped}</span>`;
  }).join('<br>');
}

function isPlanningPast(titel) {
  const m = titel.match(/^Planung KW\d+-(MO|DI|MI|DO|FR)$/);
  if (!m) return false;
  const dayMap = { MO: 1, DI: 2, MI: 3, DO: 4, FR: 5 };
  const planDow = dayMap[m[1]];
  const todayDow = new Date().getDay();
  return planDow < todayDow;
}

function renderNotizen(container) {
  if (!notizenData.length) {
    container.innerHTML = '<div class="notiz-empty">Noch keine Notizen. Oben erfassen.</div>';
    return;
  }
  const openSet = new Set(
    [...container.querySelectorAll('details.notiz-item, details.notiz-group')].filter(el => el.open).map(el => el.dataset.titel)
  );
  const planRe = /^Planung (KW\d+)-(MO|DI|MI|DO|FR)$/;
  const planGroups = {};
  const items = [];
  notizenData.forEach((n, idx) => {
    const m = n.titel.match(planRe);
    if (m) {
      const kw = m[1];
      if (!planGroups[kw]) planGroups[kw] = { entries: [], firstIdx: idx };
      planGroups[kw].entries.push({ n, idx, day: m[2] });
    } else {
      items.push({ type: 'note', n, idx });
    }
  });
  const dayOrder = { MO: 0, DI: 1, MI: 2, DO: 3, FR: 4 };
  Object.keys(planGroups).forEach(kw => {
    const g = planGroups[kw];
    g.entries.sort((a, b) => dayOrder[a.day] - dayOrder[b.day]);
    items.push({ type: 'plan', kw, entries: g.entries, firstIdx: g.firstIdx });
  });
  items.sort((a, b) => {
    const ai = a.type === 'note' ? a.idx : a.firstIdx;
    const bi = b.type === 'note' ? b.idx : b.firstIdx;
    return ai - bi;
  });
  const renderSingle = (n, idx, displayLabel) => {
    const pastClass = isPlanningPast(n.titel) ? ' notiz-past' : '';
    const label = displayLabel || n.titel;
    return `<details class="notiz-item${pastClass}" data-titel="${escapeHtml(n.titel)}"${openSet.has(n.titel) ? ' open' : ''}>
      <summary class="notiz-summary">
        <span class="notiz-titel">${escapeHtml(label)}</span>
        <span class="notiz-datum">${n.datum}</span>
        <button class="btn-x notiz-del" title="Bearbeiten" onclick="editNotiz(event,${idx})">&#x270E;</button>
        <button class="btn-x notiz-del" title="Löschen" onclick="deleteNotiz(event,${idx})">&#x2715;</button>
      </summary>
      <div class="notiz-body">${formatNotizText(n.text)}</div>
    </details>`;
  };
  container.innerHTML = items.map(item => {
    if (item.type === 'note') return renderSingle(item.n, item.idx);
    const groupKey = 'Planung ' + item.kw;
    const allPast = item.entries.every(e => isPlanningPast(e.n.titel));
    const pastClass = allPast ? ' notiz-past' : '';
    return `<details class="notiz-group${pastClass}" data-titel="${escapeHtml(groupKey)}"${openSet.has(groupKey) ? ' open' : ''}>
      <summary class="notiz-summary">
        <span class="notiz-titel">${escapeHtml(groupKey)}</span>
        <span class="notiz-datum">${item.entries[0].n.datum}${item.entries[0].n.ts ? ' ' + new Date(item.entries[0].n.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
      </summary>
      <div class="notiz-group-body">
        ${item.entries.map(e => renderSingle(e.n, e.idx, e.day)).join('')}
      </div>
    </details>`;
  }).join('');
}

function editNotiz(e, idx) {
  e.preventDefault();
  e.stopPropagation();
  const n = notizenData[idx];
  document.getElementById('new-notiz-titel').value = n.titel;
  document.getElementById('new-notiz-text').value  = n.text;
  document.getElementById('modal-notiz').style.display = '';
  document.getElementById('modal-notiz').dataset.editIdx = idx;
  setModalLock();
  document.getElementById('new-notiz-titel').focus();
}

function deleteNotiz(e, idx) {
  e.preventDefault();
  e.stopPropagation();
  notizenData.splice(idx, 1);
  saveNotizenFile();
  renderFokus();
}

function toggleLernplanDay(day, checked) {
  learningplanProgress[day] = checked;
  saveLernplanProgress();
  if (aktiverFokusTab === 'wissen') renderFokus();
}

function deleteLink(idx) {
  linksData.splice(idx, 1);
  saveLinksFile();
  renderFokus();
}

// ── Render Actions ─────────────────────────────────────────────────────────
function switchActionsTab(tab) {
  activeActionsTab = tab;
  document.querySelectorAll('.actions-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderActions();
}

function renderActions() {
  const now      = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = todayDate.getDay();
  const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  function parseDateStr(s) {
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/);
    if (!m) return null;
    const year = m[3] ? parseInt(m[3]) : now.getFullYear();
    return new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
  }

  const actionsBody  = document.getElementById('actions-body');
  const actionsCount = document.getElementById('actions-count');
  const open = actionsData.filter(a => !a.done);
  actionsCount.textContent = `${open.length} offen`;

  function dueClass(dueStr) {
    const d = parseDateStr(dueStr);
    if (!d) return '';
    if (d < todayDate) return 'overdue';
    if (d.getTime() === todayDate.getTime()) return 'today';
    return '';
  }

  if (activeActionsTab === 'open') {
    const sorted = actionsData
      .map((a, idx) => ({ a, idx }))
      .filter(({ a }) => !a.done)
      .sort((x, y) => {
        const dx = parseDateStr(x.a.due), dy = parseDateStr(y.a.due);
        if (!dx && !dy) return 0; if (!dx) return 1; if (!dy) return -1;
        return dx - dy;
      });
    actionsBody.innerHTML = sorted.length
      ? sorted.map(({ a, idx }) => `<div class="action-item" id="ai-${idx}">
          <span class="action-due ${dueClass(a.due)}">${a.due || ''}</span>
          <span class="action-text">${linkify(a.text)}</span>
          <span class="action-created">${a.created || ''}</span>
          <button class="btn-x btn-edit-action" title="Bearbeiten" onclick="editAction(${idx})">✎</button>
          <button class="btn-x" title="Erledigt" onclick="markActionDone(${idx})">✕</button>
        </div>`).join('')
      : '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine offenen Actions.</div>';
  } else {
    const done = actionsData.map((a, idx) => ({ a, idx })).filter(({ a }) => a.done);
    actionsBody.innerHTML = done.length
      ? done.map(({ a }) => `<div class="action-item done">
          <span class="action-due">${a.due || ''}</span>
          <span class="action-text">${linkify(a.text)}</span>
          <span class="action-created">${a.created || ''}</span>
        </div>`).join('')
      : '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine erledigten Actions.</div>';
  }
}

function markActionDone(idx) {
  actionsData[idx].done = true;
  saveActionsFile();
  renderActions();
}

function editAction(idx) {
  const a = actionsData[idx];
  document.getElementById('new-action-text').value = a.text;
  document.getElementById('new-action-due').value  = a.due || '';
  const modal = document.getElementById('modal-action');
  modal.style.display = 'flex';
  modal.dataset.editIdx = idx;
  setModalLock();
  document.getElementById('new-action-text').focus();
}

// ── Modal: neue Action ─────────────────────────────────────────────────────
document.getElementById('btn-add-action').addEventListener('click', () => {
  document.getElementById('modal-action').style.display = 'flex';
  document.getElementById('new-action-text').focus();
  setModalLock();
});

document.getElementById('btn-save-action').addEventListener('click', () => {
  const text  = document.getElementById('new-action-text').value.trim();
  const due   = document.getElementById('new-action-due').value.trim() || todayStr();
  if (!text) return;
  const modal   = document.getElementById('modal-action');
  const editIdx = modal.dataset.editIdx !== undefined ? parseInt(modal.dataset.editIdx) : -1;
  if (editIdx >= 0) {
    actionsData[editIdx] = { ...actionsData[editIdx], text, due };
    delete modal.dataset.editIdx;
  } else {
    actionsData.push({ created: todayStr(), due, text, done: false });
  }
  saveActionsFile();
  renderActions();
  closeModal('modal-action');
  document.getElementById('new-action-text').value = '';
  document.getElementById('new-action-due').value  = '';
});

// ── Modal: neuer Link ────────────────────────────────────────────────────
document.getElementById('btn-add-learn').addEventListener('click', () => {
  document.getElementById('modal-link').style.display = 'flex';
  setModalLock();
  document.getElementById('new-link-label').focus();
});

document.getElementById('btn-save-link').addEventListener('click', () => {
  const label = document.getElementById('new-link-label').value.trim();
  const url   = document.getElementById('new-link-url').value.trim();
  if (!url) return;
  linksData.push({ label: label || url, url });
  saveLinksFile();
  renderFokus();
  closeModal('modal-link');
  document.getElementById('new-link-label').value = '';
  document.getElementById('new-link-url').value = '';
});

function saveVideos() {
  fetch(`${WRITE_SERVER}/videos.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(videosData)
  }).catch(() => {});
}

document.getElementById('btn-add-video').addEventListener('click', () => {
  const modal = document.getElementById('modal-video');
  delete modal.dataset.editId;
  document.getElementById('new-video-url').value = '';
  document.getElementById('new-video-title').value = '';
  document.getElementById('new-video-category').value = 'Tech';
  modal.style.display = 'flex';
  setModalLock();
  document.getElementById('new-video-url').focus();
});

document.getElementById('btn-save-video').addEventListener('click', () => {
  const modal  = document.getElementById('modal-video');
  const urlRaw = document.getElementById('new-video-url').value.trim();
  const title  = document.getElementById('new-video-title').value.trim();
  const cat    = document.getElementById('new-video-category').value;
  if (!urlRaw) return;
  try { new URL(urlRaw); } catch(e) { alert('Keine gueltige URL.'); return; }
  const ytId = extractYouTubeId(urlRaw);
  const entryId = ytId || urlRaw;
  const editId = modal.dataset.editId || '';
  if (editId) {
    const existing = videosData.find(v => v.id === editId);
    if (existing) {
      existing.id = entryId;
      if (ytId) { delete existing.url; } else { existing.url = urlRaw; }
      existing.title = title || 'Ohne Titel';
      existing.category = cat;
    }
    delete modal.dataset.editId;
  } else {
    if (videosData.some(v => v.id === entryId)) { alert('Bereits vorhanden.'); return; }
    const entry = { id: entryId, title: title || 'Ohne Titel', category: cat, added: todayStr() };
    if (!ytId) entry.url = urlRaw;
    videosData.unshift(entry);
  }
  saveVideos();
  renderFokus();
  closeModal('modal-video');
  document.getElementById('new-video-url').value = '';
  document.getElementById('new-video-title').value = '';
});

document.getElementById('btn-add-notiz').addEventListener('click', () => {
  document.getElementById('modal-notiz').style.display = 'flex';
  setModalLock();
  document.getElementById('new-notiz-titel').focus();
});

document.getElementById('btn-save-notiz').addEventListener('click', () => {
  const titel    = document.getElementById('new-notiz-titel').value.trim();
  const text     = document.getElementById('new-notiz-text').value.trim();
  if (!titel && !text) return;
  const modal    = document.getElementById('modal-notiz');
  const editIdx  = modal.dataset.editIdx !== undefined ? parseInt(modal.dataset.editIdx) : -1;
  if (editIdx >= 0) {
    notizenData[editIdx] = { ...notizenData[editIdx], titel: titel || '—', text };
    delete modal.dataset.editIdx;
  } else {
    notizenData.unshift({ titel: titel || '—', datum: todayStr(), text });
  }
  saveNotizenFile();
  renderFokus();
  closeModal('modal-notiz');
  document.getElementById('new-notiz-titel').value = '';
  document.getElementById('new-notiz-text').value  = '';
});

document.getElementById('btn-save-netzwerk').addEventListener('click', async () => {
  const modal   = document.getElementById('modal-netzwerk');
  const editIdx = modal.dataset.editIdx !== undefined ? parseInt(modal.dataset.editIdx) : -1;
  if (editIdx < 0) return;
  const c = contactsData[editIdx];
  if (!c) return;
  const newRolle = document.getElementById('edit-netzwerk-rolle').value.trim();
  c.rolle = newRolle;
  await saveContactRole(c.name, newRolle);
  renderFokus();
  closeModal('modal-netzwerk');
  delete modal.dataset.editIdx;
});

document.getElementById('btn-delete-netzwerk').addEventListener('click', async () => {
  const modal   = document.getElementById('modal-netzwerk');
  const editIdx = modal.dataset.editIdx !== undefined ? parseInt(modal.dataset.editIdx) : -1;
  if (editIdx < 0) return;
  const c = contactsData[editIdx];
  if (!c) return;
  if (!confirm('Kontakt "' + c.name + '" entfernen?')) return;
  await deleteContact(c.name);
  renderFokus();
  closeModal('modal-netzwerk');
  delete modal.dataset.editIdx;
});

document.getElementById('btn-add-contact').addEventListener('click', () => {
  document.getElementById('new-contact-name').value = '';
  document.getElementById('new-contact-rolle').value = '';
  document.getElementById('modal-add-contact').style.display = 'flex';
  setModalLock();
  document.getElementById('new-contact-name').focus();
});

document.getElementById('btn-sync-jira').addEventListener('click', handleJiraButton);

let newsRefreshing = false;
document.getElementById('btn-refresh-news').addEventListener('click', async function() {
  if (newsRefreshing) return;
  newsRefreshing = true;
  const btn = this;
  btn.disabled = true;
  btn.style.opacity = '0.4';
  const oldTs = newsData ? newsData.ts : 0;
  fetch(`${WRITE_SERVER}/run-generate-news?force=1`, { method: 'POST' }).catch(() => {});
  const started = Date.now();
  const poll = async () => {
    try {
      const r = await fetch(v('knowledge/news.json'));
      if (r.ok) {
        const d = await r.json();
        if (d.ts > oldTs) { newsData = d; if (aktiverFokusTab === 'news') renderFokus(); btn.disabled = false; btn.style.opacity = ''; newsRefreshing = false; return; }
      }
    } catch(e) {}
    if (Date.now() - started < 3 * 60000) setTimeout(poll, 5000);
    else { btn.disabled = false; btn.style.opacity = ''; newsRefreshing = false; }
  };
  setTimeout(poll, 5000);
});

document.getElementById('btn-refresh-ziele').addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  btn.style.opacity = '0.4';
  btn.textContent = 'Lade...';
  try {
    const [mRes, gRes] = await Promise.all([
      fetch('data/mails_today.json?v=' + Date.now()),
      fetch('knowledge/goals.json?v=' + Date.now()),
    ]);
    if (mRes.ok) mailData = await mRes.json();
    if (gRes.ok) goalsData = await gRes.json();
    zieleLastRefresh = new Date();
    if (aktiverFokusTab === 'ziele') renderFokus();
    btn.textContent = 'Aktualisiert';
    setTimeout(() => { btn.textContent = '⟳ Aktualisieren'; }, 2000);
  } catch(e) {
    console.error('Ziele refresh error:', e);
    btn.textContent = 'Fehler';
    setTimeout(() => { btn.textContent = '⟳ Aktualisieren'; }, 2000);
  }
  btn.disabled = false;
  btn.style.opacity = '';
});

document.getElementById('btn-save-new-contact').addEventListener('click', async () => {
  const rawName = document.getElementById('new-contact-name').value.trim();
  const rolle   = document.getElementById('new-contact-rolle').value.trim();
  if (!rawName) return;
  const name = toShortName(rawName) || rawName;
  await addContact(name, rolle);
  renderFokus();
  closeModal('modal-add-contact');
});

let planPolling = false;
document.getElementById('btn-plan-next-day').addEventListener('click', async () => {
  if (planPolling) return;
  planPolling = true;
  const btn = document.getElementById('btn-plan-next-day');
  btn.textContent = '⟳ …';
  let snapshotTs = 0;
  try {
    const snap = await fetch('data/notes.json?v=' + Date.now());
    if (snap.ok) { const sd = await snap.json(); const p = sd.find(n => n.titel && n.titel.startsWith('Planung KW')); if (p) snapshotTs = p.ts || 0; }
  } catch(e) {}
  try {
    await fetch(`${WRITE_SERVER}/run-plan-week`, { method: 'POST' });
  } catch(e) {}
  const deadline = Date.now() + 8 * 60000;
  const poll = async () => {
    try {
      const r = await fetch('data/notes.json?v=' + Date.now());
      if (r.ok) {
        const data = await r.json();
        const found = data.find(n => n.titel && n.titel.startsWith('Planung KW') && n.ts > snapshotTs);
        if (found) {
          notizenData = data;
          renderFokus();
          btn.textContent = '⟳ Planung';
          planPolling = false;
          return;
        }
      }
    } catch(e) {}
    if (Date.now() < deadline) {
      setTimeout(poll, 8000);
    } else {
      btn.textContent = '⟳ Planung';
      planPolling = false;
    }
  };
  setTimeout(poll, 8000);
});

function openSyncModal(file, name) {
  document.getElementById('modal-sync-title').textContent = 'Sync-Vorbereitung: ' + shortName(name);
  const body = document.getElementById('modal-sync-body');
  body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Lade…</div>';
  document.getElementById('modal-sync').style.display = '';
  setModalLock();
  fetch('data/' + file)
    .then(r => r.json())
    .then(mails => {
      if (!mails.length) {
        body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Mails gefunden.</div>';
        return;
      }
      body.innerHTML = mails.map(m => {
        const prio = mailPrio(m);
        const pm = PRIO_META[prio] || PRIO_META.fyi;
        const label = m.typ === 'gesendet' ? '→ gesendet' : shortName(m.from);
        return `<div class="mail-item ${pm.cls}" style="padding:6px 4px;margin-bottom:2px">
          <span class="mail-prio" title="${pm.title}">${pm.label}</span>
          <div class="mail-time">${m.date} ${m.time}</div>
          <div class="mail-content">
            <div class="mail-from">${escapeHtml(label)}</div>
            <div class="mail-subject">${escapeHtml(m.subject)}</div>
            <div class="mail-body" style="display:none">${escapeHtml(m.body)}</div>
          </div>
        </div>`;
      }).join('');
      body.querySelectorAll('.mail-item').forEach(el => {
        el.addEventListener('click', () => {
          const b = el.querySelector('.mail-body');
          b.style.display = b.style.display === 'none' ? '' : 'none';
        });
      });
    })
    .catch(() => { body.innerHTML = '<div style="color:#e74c3c;font-size:0.75rem">Datei nicht gefunden.</div>'; });
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.style.display = 'none';
  delete el.dataset.editIdx;
  // Prüfen ob noch andere Modals offen sind
  const anyOpen = document.querySelectorAll('.modal-overlay');
  const stillOpen = [...anyOpen].some(m => m.style.display !== 'none');
  if (!stillOpen) fetch('http://127.0.0.1:9001/modal-lock?state=0', { method: 'POST' }).catch(() => {});
}

function setModalLock() {
  fetch('http://127.0.0.1:9001/modal-lock?state=1', { method: 'POST' }).catch(() => {});
}
function isAnyModalOpen() {
  return [...document.querySelectorAll('.modal-overlay')].some(m => m.style.display !== 'none');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) closeModal(el.id); });
});

// ── Main render ────────────────────────────────────────────────────────────
function renderAll() {
  renderHeader();
  renderKalender();
  renderFokus();
  renderActions();
  renderMails();
}

// ── ICS Import ─────────────────────────────────────────────────────────────
// ── ICS Import ─────────────────────────────────────────────────────────────
function icsDateToLocal(val) {
  // All-day: VALUE=DATE format → 20260419 (8 chars, no T)
  if (!val.includes('T')) {
    const y = val.slice(0,4), mo = val.slice(4,6), d = val.slice(6,8);
    return { allDay: true, date: new Date(+y, +mo-1, +d) };
  }
  // UTC: 20260418T120000Z → Date object in local time
  if (val.endsWith('Z')) {
    const y = val.slice(0,4), mo = val.slice(4,6), d = val.slice(6,8);
    const h = val.slice(9,11), mi = val.slice(11,13), s = val.slice(13,15)||'00';
    return { allDay: false, date: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`) };
  }
  // Local/TZID: 20260418T140000 → treat as local
  const y = val.slice(0,4), mo = val.slice(4,6), d = val.slice(6,8);
  const h = val.slice(9,11), mi = val.slice(11,13);
  return { allDay: false, date: new Date(+y, +mo-1, +d, +h, +mi) };
}

function linkify(text) {
  return escapeHtml(text).replace(/(https?:\/\/[^\s&lt;&quot;]+)/g, url =>
    `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer" class="action-link">${url}</a>`
  );
}

function fmtTime(date) {
  return date.getHours().toString().padStart(2,'0') + ':' + date.getMinutes().toString().padStart(2,'0');
}

function parseICS(text, forDate) {
  const target = forDate || new Date();
  const targetYMD = ymdOf(target);

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
    if (baseKey === 'TRANSP')  ev.transp = val.trim().toUpperCase();
    if (baseKey === 'X-MICROSOFT-CDO-BUSYSTATUS') ev.busyStatus = val.trim().toUpperCase();
    if (baseKey === 'X-MYAPP-ROLE') ev.role = val.trim().toUpperCase();
  }

  const todayEvents = [];
  for (const e of events) {
    if (!e.start || !e.title) continue;
    if (e.transp === 'TRANSPARENT') continue;  // Free/privat → ausblenden

    const startObj = icsDateToLocal(e.start);
    const endObj   = e.end ? icsDateToLocal(e.end) : startObj;
    const startDate = startObj.date;
    const endDate   = endObj.date;
    const allDay    = startObj.allDay;

    const evYMD = startDate.getFullYear().toString()
      + (startDate.getMonth()+1).toString().padStart(2,'0')
      + startDate.getDate().toString().padStart(2,'0');
    if (evYMD !== targetYMD) continue;

    todayEvents.push({ startDate, endDate, allDay, title: e.title,
      tentative: e.busyStatus === 'TENTATIVE',
      optional:  e.role === 'OPT-PARTICIPANT' });
  }

  // Sort by start time
  todayEvents.sort((a, b) => a.startDate - b.startDate);
  return todayEvents;
}

// ── Mails ──────────────────────────────────────────────────────────────────
let mailData = [];
let activeMailTab = null;  // currently selected date key
let activeHistoryKW = null;

let MY_ADDRESSES = [];  // loaded from config.json (not committed)
const WEEKDAY_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

const PRIO_META = {
  chef:   { label: '★',  title: 'Von meinem Chef',          cls: 'prio-chef'   },
  direct: { label: '●',  title: 'Direkt an mich',           cls: 'prio-direct' },
  action: { label: '◆',  title: 'An mich + andere',         cls: 'prio-action' },
  cc:     { label: '○',  title: 'Nur CC',                   cls: 'prio-cc'     },
  fyi:    { label: '·',  title: 'Nicht direkt adressiert',  cls: 'prio-fyi'    },
  sent:   { label: '📤', title: 'Gesendet',                 cls: 'prio-sent'   },
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

async function loadMails(skipRender = false) {
  try {
    const res = await fetch(v('data/mails_today.json'));
    if (!res.ok) return;
    mailData = await res.json();
    if (!skipRender) renderMails();
  } catch(e) { console.error('loadMails error:', e); }
  checkSummaryExists();
  if (currentMode === 'simple') renderSimpleBar();
}

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastEl = null, _toastTimer = null;
function showToast(msg, type, durationMs) {
  if (!_toastEl) { _toastEl = document.createElement('div'); _toastEl.className = 'toast'; document.body.appendChild(_toastEl); }
  clearTimeout(_toastTimer);
  _toastEl.textContent = msg;
  _toastEl.className = 'toast' + (type === 'ok' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
  void _toastEl.offsetWidth;
  _toastEl.classList.add('toast-visible');
  if (durationMs) _toastTimer = setTimeout(() => _toastEl.classList.remove('toast-visible'), durationMs);
}
function hideToast() { if (_toastEl) _toastEl.classList.remove('toast-visible'); }

function safeHref(url) {
  try { const u = new URL(url); return (u.protocol === 'http:' || u.protocol === 'https:') ? escapeHtml(url) : '#'; }
  catch { return '#'; }
}

function renderMails() {
  const body  = document.getElementById('mails-body');
  const count = document.getElementById('mails-count');
  const tabs  = document.getElementById('mail-tabs');

  // Focus mode: compact mail display (today's count + top mails)
  if (currentMode === 'focus') {
    const now = new Date();
    const todayKey = now.getDate().toString().padStart(2,'0') + '.' + (now.getMonth()+1).toString().padStart(2,'0') + '.';
    const todayMails = mailData.filter(m => m.date === todayKey && m.typ !== 'gesendet');
    const totalWeek = mailData.length;
    count.textContent = todayMails.length + ' heute, ' + totalWeek + ' Woche';
    tabs.innerHTML = '';
    if (!todayMails.length) {
      body.innerHTML = '<div style="color:var(--text-muted);font-size:0.72rem;padding:4px 0">Keine Mails heute</div>';
      return;
    }
    body.innerHTML = todayMails.slice(0, 5).map(m => {
      const prio = mailPrio(m);
      const pm = PRIO_META[prio] || PRIO_META.fyi;
      const name = shortName(m.from);
      return `<div class="mail-item ${pm.cls}" style="padding:2px 0"><span class="mail-prio" title="${pm.title}">${pm.label}</span><span class="mail-time">${m.time}</span><em style="font-size:0.68rem">${escapeHtml(name)}</em> <span style="font-size:0.66rem;color:var(--text-muted)">${escapeHtml(m.subject)}</span></div>`;
    }).join('');
    if (todayMails.length > 5) {
      body.innerHTML += `<div style="color:var(--text-muted);font-size:0.64rem;padding:2px 0">+${todayMails.length - 5} weitere</div>`;
    }
    return;
  }

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

  // Render tab buttons with weekday + date label
  tabs.innerHTML = dates.map(date => {
    const [d, mo] = date.split('.').map(Number);
    const year = now.getFullYear();
    const wd = WEEKDAY_SHORT[new Date(year, mo - 1, d).getDay()];
    const isActive = date === activeMailTab;
    return `<button class="mail-tab${isActive ? ' active' : ''}" onclick="switchMailTab('${date}')" title="${date}">${wd} ${String(d).padStart(2,'0')}.${String(mo).padStart(2,'0')}.</button>`;
  }).join('') + `<button class="mail-tab mail-tab-history" onclick="renderHistory()" title="Wochenzusammenfassungen">📋</button>`;

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
    const id      = `mail-${activeMailTab}-${idx}`;
    const prio    = mailPrio(m);
    const pm      = PRIO_META[prio] || PRIO_META.fyi;
    const isSent  = m.typ === 'gesendet';
    const name    = isSent ? (m.to ? shortName(m.to.split(';')[0]) : '?') : shortName(m.from);
    const auftragCls = m.auftrag ? ' mail-auftrag' : '';
    return `<div class="mail-item ${pm.cls}${auftragCls}" onclick="toggleMail('${id}')">
      <span class="mail-prio" title="${pm.title}">${pm.label}</span>
      <span class="mail-time">${m.time}</span>
      <div class="mail-content">
        <div class="mail-from"><em>${escapeHtml(name)}</em>${m.auftrag ? ' <span class="auftrag-badge" title="Enthält Auftrag">⚑</span>' : ''}</div>
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
    const res = await fetch(`data/summary_KW${kw}.json?v=` + Date.now());
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
    const res = await fetch(`data/summary_KW${kw}.json?v=` + Date.now());
    const data = await res.json();
    body.innerHTML = `<div class="mail-summary">${renderSummaryHtml(data.summary)}</div>
      <button class="btn-ghost" style="margin-top:8px;font-size:0.65rem" onclick="renderMails()">← Liste anzeigen</button>`;
  } catch(e) {
    body.innerHTML = '<div style="color:#e74c3c;font-size:0.75rem;padding:8px 0">Zusammenfassung nicht gefunden.</div>';
  }
}

document.getElementById('btn-show-summary').addEventListener('click', showSavedSummary);

// ── History Tab ────────────────────────────────────────────────────────────
async function renderHistory() {
  const body  = document.getElementById('mails-body');
  const tabs  = document.getElementById('mail-tabs');
  const count = document.getElementById('mails-count');

  // Mark history tab active
  tabs.querySelectorAll('.mail-tab').forEach(b => b.classList.remove('active'));
  tabs.querySelector('.mail-tab-history').classList.add('active');
  count.textContent = 'History';

  // Try last 20 KWs
  const kwNow = currentKW();
  const yearNow = new Date().getFullYear();
  const candidates = [];
  for (let i = 0; i < 20; i++) {
    let kw = kwNow - i;
    let yr = yearNow;
    if (kw <= 0) { kw += 52; yr -= 1; }
    candidates.push({ kw, yr });
  }

  const results = await Promise.all(candidates.map(async ({ kw, yr }) => {
    try {
      const res = await fetch(`data/summary_KW${kw}.json?v=` + Date.now());
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.summary) return null;
      return { kw, yr, summary: data.summary };
    } catch { return null; }
  }));

  const found = results.filter(Boolean);
  if (!found.length) {
    body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Zusammenfassungen gefunden.</div>';
    return;
  }

  if (!activeHistoryKW) activeHistoryKW = found[0].kw;

  const kwTabs = found.map(({ kw }) =>
    `<button class="mail-tab${kw === activeHistoryKW ? ' active' : ''}" onclick="switchHistoryKW(${kw})">KW ${kw}</button>`
  ).join('');

  const current = found.find(f => f.kw === activeHistoryKW) || found[0];
  activeHistoryKW = current.kw;

  body.innerHTML = `
    <div class="history-kw-tabs">${kwTabs}</div>
    <div class="mail-summary">${renderSummaryHtml(current.summary)}</div>
    <button class="btn-ghost" style="margin-top:8px;font-size:0.65rem" onclick="activeMailTab=null;renderMails()">← Mails anzeigen</button>
  `;
}

function switchHistoryKW(kw) {
  activeHistoryKW = kw;
  renderHistory();
}

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
  const body = document.getElementById('mails-body');
  activeMailTab = null;  // reset so all tabs reload correctly after summary
  body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Mails werden abgerufen…</div>';

  // 1. Export fresh mails from Outlook
  const exportedAt = Date.now();
  try {
    await fetch(`${WRITE_SERVER}/run-export-mails`, { method: 'POST' });
  } catch(e) { /* server not available */ }

  // Poll sync status until mail_sync_status.json reflects the new export
  const pollSync = async () => {
    try {
      const r = await fetch('data/mail_sync_status.json?v=' + Date.now());
      if (r.ok) {
        const d = await r.json();
        if (d.ts >= exportedAt) { updateSyncStatus(); return; }
      }
    } catch(e) {}
    if (Date.now() - exportedAt < 5 * 60000) setTimeout(pollSync, 5000);
  };
  setTimeout(pollSync, 5000);

  // 2. Reload mails_today.json into mailData (no re-render)
  await loadMails(true);
  if (!mailData.length) {
    body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Mails gefunden.</div>';
    return;
  }

  body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Zusammenfassung wird erstellt… (bis zu 5 Min.)</div>';

  // 3. Trigger summarize_mails.ps1
  const requestedAt = Date.now();
  try {
    await fetch(`${WRITE_SERVER}/run-summarize`, { method: 'POST' });
  } catch(e) { /* server not available */ }

  const deadline = requestedAt + 10 * 60000;
  const kw = currentKW();
  const summaryFile = `data/summary_KW${kw}.json`;

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
      setTimeout(poll, 5 * 60000);
    } else {
      body.innerHTML = '<div style="color:#e74c3c;font-size:0.75rem;padding:8px 0">Zeitüberschreitung – bitte write-server prüfen.</div>';
    }
  };

  setTimeout(poll, 5 * 60000);
}

document.getElementById('btn-summarize-mails').addEventListener('click', summarizeMails);

// ── Server health check ────────────────────────────────────────────────────
async function checkServerStatus() {
  const dot = document.getElementById('server-status');
  try {
    const r = await fetch('http://127.0.0.1:9001/ping', { cache: 'no-store' });
    dot.className = r.ok ? 'ok' : 'err';
    dot.title = r.ok ? 'write-server OK' : 'write-server Fehler';
  } catch(e) {
    dot.className = 'err';
    dot.title = 'write-server nicht erreichbar';
  }
}
checkServerStatus();
setInterval(checkServerStatus, 5 * 60000);

// ── Mail sync status ───────────────────────────────────────────────────────
async function updateSyncStatus() {
  const el = document.getElementById('mail-sync-status');
  if (!el) return;
  try {
    const r = await fetch('data/mail_sync_status.json?v=' + Date.now());
    if (!r.ok) { el.textContent = ''; return; }
    const d = await r.json();
    const last    = new Date(d.ts);
    const lastTime = last.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const lastDate = last.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
    const now   = new Date();
    const todayDate = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
    const lastStr = lastDate === todayDate ? lastTime : lastDate + ' ' + lastTime;
    const t0730 = new Date(now); t0730.setHours(7, 30, 0, 0);
    const t1230 = new Date(now); t1230.setHours(12, 30, 0, 0);
    let next;
    if (now < t0730)      next = t0730;
    else if (now < t1230) next = t1230;
    else { next = new Date(t0730); next.setDate(next.getDate() + 1); }
    const nextDay = next.toLocaleDateString('de-DE', { weekday: 'short' });
    const nextTime = next.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const isNextToday = next.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) === todayDate;
    const nextStr = isNextToday ? nextTime : nextDay + ' ' + nextTime;
    el.textContent = `${lastStr} · ⟳ ${nextStr}`;
  } catch(e) { el.textContent = ''; }
}

// ── Quote refresh button ──────────────────────────────────────────────────
document.getElementById('btn-refresh-quote').addEventListener('click', function() {
  if (!quotesAll.length) return;
  let newIdx;
  do { newIdx = Math.floor(Math.random() * quotesAll.length); } while (newIdx === quoteIndex && quotesAll.length > 1);
  quoteIndex = newIdx;
  renderHeader();
});

// ── Init ───────────────────────────────────────────────────────────────────
fetch('data/config.json').then(r => r.json()).then(cfg => {
  if (cfg.myAddresses) MY_ADDRESSES = cfg.myAddresses;
}).catch(() => {}).finally(() => {
  applyMode(currentMode);
  loadAll();
  loadMails();
  const startedAt = Date.now();
  const hh = new Date().getHours();
  if (hh >= 7 && hh < 13) {
    fetch(`${WRITE_SERVER}/run-export-mails`, { method: 'POST' }).catch(() => {});
  }
  updateSyncStatus();
  const todayStr = new Date().toISOString().slice(0, 10);
  // News: auto-trigger if missing or outdated
  if (!newsData || newsData.date !== todayStr) {
    fetch(`${WRITE_SERVER}/run-generate-news`, { method: 'POST' }).catch(() => {});
    const pollNews = async () => {
      try {
        const r = await fetch(v('knowledge/news.json'));
        if (r.ok) {
          const d = await r.json();
          if (d.date === todayStr) { newsData = d; if (aktiverFokusTab === 'news') renderFokus(); return; }
        }
      } catch(e) {}
      if (Date.now() - startedAt < 3 * 60000) setTimeout(pollNews, 5000);
    };
    setTimeout(pollNews, 5000);
  }
  const pollSyncInit = async () => {
    try {
      const r = await fetch('data/mail_sync_status.json?v=' + Date.now());
      if (r.ok) {
        const d = await r.json();
        if (d.ts >= startedAt) { updateSyncStatus(); return; }
      }
    } catch(e) {}
    if (Date.now() - startedAt < 5 * 60000) setTimeout(pollSyncInit, 5000);
  };
  setTimeout(pollSyncInit, 5000);
});
setInterval(() => { if (!isAnyModalOpen()) renderHeader(); }, 60000);
setInterval(() => { if (!isAnyModalOpen()) loadICSAuto(); }, 30 * 60000);
setInterval(() => {
  if (isAnyModalOpen()) return;
  const anyOpen = document.querySelector('.mail-body[style*="display: block"], .mail-body[style*="display:block"]');
  if (!anyOpen) loadMails();
}, 30 * 60000);
