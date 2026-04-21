// ── Simple / Expert Mode ──────────────────────────────────────────────────
let expertMode = localStorage.getItem('expertMode') !== '0';

function applyMode(expert) {
  expertMode = expert;
  localStorage.setItem('expertMode', expert ? '1' : '0');
  const phase = currentPhase();
  document.body.className = phase.css + (expert ? ' mode-expert' : ' mode-simple');
  const btn = document.getElementById('btn-mode-toggle');
  if (btn) { btn.textContent = expert ? '⊟' : '⊞'; btn.title = expert ? 'Grundmodus (E)' : 'Expertenmodus (E)'; }
  if (!expert) renderSimpleBar();
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

  // Calendar: current or next event
  const calEl = document.getElementById('sb-cal');
  if (calEl) {
    const timed = icsEvents.filter(e => !e.allDay);
    const current = timed.find(e => {
      const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      const en = e.endDate.getHours()   * 60 + e.endDate.getMinutes();
      return curMin >= s && curMin <= en;
    });
    const next = !current && timed.find(e => {
      const s = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      return s > curMin;
    });
    if (current) {
      const endStr = fmtTime(current.endDate);
      calEl.innerHTML = `<span class="sb-label">📅</span><span class="sb-current">${escapeHtml(current.title)}</span><span class="sb-time">bis ${endStr}</span>`;
    } else if (next) {
      const startStr = fmtTime(next.startDate);
      calEl.innerHTML = `<span class="sb-label">📅</span><span>${escapeHtml(next.title)}</span><span class="sb-time">${startStr}</span>`;
    } else {
      calEl.innerHTML = `<span class="sb-label">📅</span><span style="color:var(--text-muted)">Keine Termine</span>`;
    }
  }

  // Mail: count today + latest
  const mailEl = document.getElementById('sb-mail');
  if (mailEl) {
    const today = todayStr();
    const todayMails = mailData.filter(m => m.date === today && m.typ !== 'gesendet');
    const count = todayMails.length;
    if (count === 0) {
      mailEl.innerHTML = `<span class="sb-label">✉️</span><span style="color:var(--text-muted)">Keine Mails heute</span>`;
    } else {
      const last   = todayMails[todayMails.length - 1];
      const sender = shortName(last.from);
      mailEl.innerHTML = `<span class="sb-label">✉️</span><span class="sb-count">${count}</span><span class="sb-sender">${escapeHtml(sender)}</span><span class="sb-subj">${escapeHtml(last.subject)}</span>`;
    }
  }
}

document.getElementById('btn-mode-toggle').addEventListener('click', () => applyMode(!expertMode));

document.addEventListener('keydown', e => {
  if (e.key === 'e' || e.key === 'E') {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    applyMode(!expertMode);
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
let linksData   = [];
let sportData   = [];
let notizenData = [];
let icsEvents       = [];
let icsTomorrowEvents = [];
let syncFiles     = [];  // from Daten/sync_files.json
let aktiverFokusTab   = 'notizen';
let activeActionsTab  = 'open';
let lernplanData     = null;
let lernplanProgress = {};

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
function ymdOf(date) {
  return date.getFullYear().toString()
    + (date.getMonth()+1).toString().padStart(2,'0')
    + date.getDate().toString().padStart(2,'0');
}

async function loadICSAuto() {
  const now      = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayRes, tomRes] = await Promise.allSettled([
    fetch(v(`Daten/termine_${ymdOf(now)}.ics`)),
    fetch(v(`Daten/termine_${ymdOf(tomorrow)}.ics`)),
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

  const syncModalOpen = document.getElementById('modal-sync').style.display !== 'none';
  if (!syncModalOpen) renderKalender();
  if (!expertMode) renderSimpleBar();
}

// ── Load data ──────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [tRes, aRes, lRes, lnRes, lpRes, lpProg, spRes, nRes, sfRes] = await Promise.all([
      fetch(v('Daten/termine.txt')),
      fetch(v('Daten/actions.json')),
      fetch(v('Daten/learn.txt')),
      fetch(v('Wissen/links.json')),
      fetch(v('Wissen/lernplan.json')),
      fetch(v('Wissen/lernplan_progress.json')),
      fetch(v('Wissen/sport.json')),
      fetch(v('Daten/notizen.json')),
      fetch(v('Daten/sync_files.json')),
    ]);
    if (tRes.ok)   rawTermine       = await tRes.text();
    if (aRes.ok)   actionsData      = await aRes.json();
    if (lRes.ok)   rawLearn         = await lRes.text();
    if (lnRes.ok)  linksData        = await lnRes.json();
    if (lpRes.ok)  lernplanData     = await lpRes.json();
    if (lpProg.ok) lernplanProgress = await lpProg.json();
    if (spRes.ok)  sportData        = await spRes.json();
    if (nRes.ok)   notizenData      = await nRes.json();
    if (sfRes.ok)  syncFiles        = await sfRes.json();
  } catch(e) { console.error('Load error', e); }
  await loadICSAuto();
  aktiverFokusTab = defaultFokusTab();
  syncFokusTabUI();
  renderAll();
}

function defaultFokusTab() {
  const saved = localStorage.getItem('fokusTab');
  if (saved) return saved;
  const h = new Date().getHours();
  if (h < 8)  return 'sport';
  if (h >= 17) return 'wissen';
  return 'notizen';
}

function syncFokusTabUI() {
  document.querySelectorAll('.fokus-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === aktiverFokusTab)
  );
  document.getElementById('btn-add-learn').style.display     = (aktiverFokusTab === 'links')   ? '' : 'none';
  document.getElementById('btn-add-notiz').style.display     = (aktiverFokusTab === 'notizen') ? '' : 'none';
  document.getElementById('btn-plan-next-day').style.display = (aktiverFokusTab === 'notizen') ? '' : 'none';
  const hasBtn = aktiverFokusTab === 'links' || aktiverFokusTab === 'notizen';
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
  fetch(`${WRITE_SERVER}/lernplan_progress.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(lernplanProgress, null, 2),
  }).catch(() => {});
}

function saveNotizenFile() {
  fetch(`${WRITE_SERVER}/notizen.json`, {
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
  document.body.className = phase.css + (expertMode ? ' mode-expert' : ' mode-simple');
  if (!expertMode) renderSimpleBar();
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
    const renderEvent = (e, extraCls = '') => {
      const syncMatch = syncFiles.find(sf => {
        const nameParts = sf.name.split(/[, ]+/).filter(p => p.length > 2);
        return nameParts.some(p => new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(e.title));
      });
      const syncLink = syncMatch
        ? ` <span class="cal-sync-link" onclick="openSyncModal('${syncMatch.file}','${syncMatch.name}')">📋</span>`
        : '';
      const badges = (e.tentative ? ' <span class="cal-badge cal-badge-tent" title="Tentativ">?</span>' : '')
                   + (e.optional  ? ' <span class="cal-badge cal-badge-opt"  title="Optional">opt</span>' : '');
      if (e.allDay) {
        return `<div class="cal-item cal-allday-item${extraCls ? ' ' + extraCls : ''}${e.tentative ? ' cal-tentative' : ''}${e.optional ? ' cal-optional' : ''}">
          <span class="cal-dot"></span>
          <span class="cal-time" style="font-style:italic">Ganztag</span>
          <span>${e.title}${badges}${syncLink}</span>
        </div>`;
      }
      const startMin = e.startDate.getHours() * 60 + e.startDate.getMinutes();
      const endMin   = e.endDate.getHours()   * 60 + e.endDate.getMinutes();
      const past     = curMin > endMin;
      const current  = curMin >= startMin && curMin <= endMin;
      let cls = 'cal-item';
      if (extraCls) cls += ' ' + extraCls;
      else if (past)    cls += ' cal-past';
      else if (current) cls += ' cal-current';
      else if (e.tentative) cls += ' cal-tentative';
      else if (e.optional)  cls += ' cal-optional';
      return `<div class="${cls}">
        <span class="cal-dot"></span>
        <span class="cal-time">${fmtTime(e.startDate)}–${fmtTime(e.endDate)}</span>
        <span>${e.title}${badges}${syncLink}</span>
      </div>`;
    };

    // Ganztagstermine zuerst, dann normale Termine nach Zeit
    const allDay  = icsEvents.filter(e => e.allDay);
    const timed   = icsEvents.filter(e => !e.allDay);
    calBody.innerHTML = [...allDay, ...timed].map(e => renderEvent(e)).join('');

    if (now.getHours() >= 17 && icsTomorrowEvents.length > 0) {
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowLabel = tomorrow.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit' });
      const allDayTom = icsTomorrowEvents.filter(e => e.allDay);
      const timedTom  = icsTomorrowEvents.filter(e => !e.allDay);
      calBody.innerHTML += `<div class="cal-tomorrow-header">${tomorrowLabel}</div>`
        + [...allDayTom, ...timedTom].map(e => renderEvent(e, 'cal-tomorrow')).join('');
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
  const hasBtn = tab === 'links' || tab === 'notizen';
  document.querySelector('#tile-fokus .tile-footer').classList.toggle('has-button', hasBtn);
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

  if (aktiverFokusTab === 'wissen') {
    fokusKat.textContent = 'Hörbücher';
    renderWissen(fokusBody);
    return;
  }

  if (aktiverFokusTab === 'sport') {
    fokusKat.textContent = 'Bewegung';
    renderSportLinks(fokusBody);
    return;
  }

  // fuehrung + tech: flat lernplan lists
  if (lernplanData && lernplanData.weeks) {
    const isFuehrung = aktiverFokusTab === 'fuehrung';
    fokusKat.textContent = isFuehrung ? 'Führung & People' : 'Tech & Engineering';
    renderLernplanFlat(fokusBody, isFuehrung);
    return;
  }

  fokusBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Lernplan nicht geladen</div>';
}

function renderSportLinks(container) {
  if (!sportData.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Sportlinks vorhanden</div>';
    return;
  }
  container.innerHTML = sportData.map(item =>
    `<div class="learn-item">
      <span class="learn-kat" title="${item.category}">${item.category.split(' ')[0]}</span>
      <a class="learn-link" href="${item.url}" target="_blank">${item.title}${item.creator ? ' <em style="color:var(--text-muted)">– ' + item.creator + '</em>' : ''}</a>
    </div>`
  ).join('');
}

function renderLernplanFlat(container, isFuehrung) {
  const allDays = lernplanData.weeks.flatMap(w => w.days);
  const filtered = allDays.filter(d => {
    const topics = (d.topics || []).map(t => t.toLowerCase());
    const hasFuehrung = topics.some(t => FUEHRUNG_TOPICS.has(t));
    return isFuehrung ? hasFuehrung : !hasFuehrung;
  });
  const total = filtered.length;
  const done  = filtered.filter(d => lernplanProgress[d.day]).length;
  let html = `<div class="lernplan-header">
    <span class="lernplan-title">${isFuehrung ? '👥' : '⚙️'} ${total} Themen</span>
    <span class="lernplan-total">${done}/${total}</span>
  </div>`;
  html += filtered.map(day => {
    const isDone = !!lernplanProgress[day.day];
    return `<div class="lernplan-day${isDone ? ' lernplan-done' : ''}">
      <input type="checkbox" class="lernplan-cb" id="lp-${day.day}"
        ${isDone ? 'checked' : ''} onchange="toggleLernplanDay(${day.day}, this.checked)">
      <label for="lp-${day.day}">
        <a href="${escapeHtml(day.url)}" target="_blank">
          ${escapeHtml(day.title)} <span class="lernplan-creator">(${escapeHtml(day.creator)})</span>
        </a>
      </label>
    </div>`;
  }).join('');
  container.innerHTML = html;
}

function renderLinks(container) {
  if (!linksData.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Links gespeichert</div>';
    return;
  }
  container.innerHTML = linksData.map((l, idx) =>
    `<div class="learn-item">
      <a class="learn-link" href="${escapeHtml(l.url)}" target="_blank" title="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>
      <button class="btn-x" title="Löschen" onclick="deleteLink(${idx})">✕</button>
    </div>`
  ).join('');
}

function renderLernplan() {} // unused, kept for safety

function renderWissen(container) {
  Promise.allSettled([
    fetch('Wissen/hörbuch.json').then(r => r.json()),
    fetch('Wissen/hinterbliebenen.json').then(r => r.json()),
    fetch('Wissen/leistungsabfall.json').then(r => r.json()),
  ]).then(([hoerbuchRes, hinterbliebenenRes, leistungsabfallRes]) => {
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
    if (hoerbuchRes.status === 'fulfilled') {
      html += sectionHeader('📖 Hörbücher');
      html += renderBuecher(hoerbuchRes.value, '📖');
    }
    const miscItems = [
      hinterbliebenenRes.status === 'fulfilled' ? renderBuecher(hinterbliebenenRes.value, '📋') : '',
      leistungsabfallRes.status === 'fulfilled' ? renderBuecher(leistungsabfallRes.value, '📉') : '',
    ].filter(Boolean).join('');
    if (miscItems) {
      html += sectionHeader('🗂 Misc');
      html += miscItems;
    }
    container.innerHTML = html || '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Inhalte geladen</div>';
  });
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

function renderNotizen(container) {
  if (!notizenData.length) {
    container.innerHTML = '<div class="notiz-empty">Noch keine Notizen. Oben erfassen.</div>';
    return;
  }
  // preserve open state of <details> by index
  const openSet = new Set(
    [...container.querySelectorAll('details.notiz-item')].reduce((acc, el, i) => {
      if (el.open) acc.push(i); return acc;
    }, [])
  );
  container.innerHTML = notizenData.map((n, idx) =>
    `<details class="notiz-item"${openSet.has(idx) ? ' open' : ''}>
      <summary class="notiz-summary">
        <span class="notiz-titel">${escapeHtml(n.titel)}</span>
        <span class="notiz-datum">${n.datum}</span>
        <button class="btn-x notiz-del" title="Bearbeiten" onclick="editNotiz(event,${idx})">✎</button>
        <button class="btn-x notiz-del" title="Löschen" onclick="deleteNotiz(event,${idx})">✕</button>
      </summary>
      <div class="notiz-body">${formatNotizText(n.text)}</div>
    </details>`
  ).join('');
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
  lernplanProgress[day] = checked;
  saveLernplanProgress();
  if (aktiverFokusTab === 'fuehrung' || aktiverFokusTab === 'tech') renderFokus();
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

let planPolling = false;
document.getElementById('btn-plan-next-day').addEventListener('click', async () => {
  if (planPolling) return;
  planPolling = true;
  const btn = document.getElementById('btn-plan-next-day');
  btn.textContent = '⟳ …';
  const triggeredAt = Date.now();
  try {
    await fetch(`${WRITE_SERVER}/run-plan-next-day`, { method: 'POST' });
  } catch(e) {}
  const deadline = triggeredAt + 5 * 60000;
  const poll = async () => {
    try {
      const r = await fetch('Daten/notizen.json?v=' + Date.now());
      if (r.ok) {
        const data = await r.json();
        const found = data.find(n => n.titel && n.titel.startsWith('Planung KW') && n.ts >= triggeredAt);
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
  fetch('Daten/' + file)
    .then(r => r.json())
    .then(mails => {
      if (!mails.length) {
        body.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">Keine Mails gefunden.</div>';
        return;
      }
      body.innerHTML = mails.map(m => `
        <div class="mail-item prio-${m.typ === 'gesendet' ? 'sent' : 'direct'}" style="padding:6px 4px;margin-bottom:2px">
          <div class="mail-time">${m.date} ${m.time}</div>
          <div class="mail-content">
            <div class="mail-from">${escapeHtml(m.typ === 'gesendet' ? '→ ' + shortName(m.to) : shortName(m.from))}</div>
            <div class="mail-subject">${escapeHtml(m.subject)}</div>
            <div class="mail-body" style="display:none">${escapeHtml(m.body)}</div>
          </div>
        </div>`).join('');
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
  return text.replace(/(https?:\/\/[^\s]+)/g, url =>
    `<a href="${url}" target="_blank" class="action-link">${url}</a>`
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
    const res = await fetch(v('Daten/mails_heute.json'));
    if (!res.ok) return;
    mailData = await res.json();
    if (!skipRender) renderMails();
  } catch(e) { console.error('loadMails error:', e); }
  checkSummaryExists();
  if (!expertMode) renderSimpleBar();
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
    const res = await fetch(`Daten/summary_KW${kw}.json?v=` + Date.now());
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
    const res = await fetch(`Daten/summary_KW${kw}.json?v=` + Date.now());
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
      const res = await fetch(`Daten/summary_KW${kw}.json?v=` + Date.now());
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
      const r = await fetch('Daten/mail_sync_status.json?v=' + Date.now());
      if (r.ok) {
        const d = await r.json();
        if (d.ts >= exportedAt) { updateSyncStatus(); return; }
      }
    } catch(e) {}
    if (Date.now() - exportedAt < 5 * 60000) setTimeout(pollSync, 5000);
  };
  setTimeout(pollSync, 5000);

  // 2. Reload mails_heute.json into mailData (no re-render)
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
  const summaryFile = `Daten/summary_KW${kw}.json`;

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
setInterval(checkServerStatus, 30000);

// ── Mail sync status ───────────────────────────────────────────────────────
async function updateSyncStatus() {
  const el = document.getElementById('mail-sync-status');
  if (!el) return;
  try {
    const r = await fetch('Daten/mail_sync_status.json?v=' + Date.now());
    if (!r.ok) { el.textContent = ''; return; }
    const d = await r.json();
    const last    = new Date(d.ts);
    const lastStr = last.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const now   = new Date();
    const t0730 = new Date(now); t0730.setHours(7, 30, 0, 0);
    const t1230 = new Date(now); t1230.setHours(12, 30, 0, 0);
    let next;
    if (now < t0730)      next = t0730;
    else if (now < t1230) next = t1230;
    else { next = new Date(t0730); next.setDate(next.getDate() + 1); }
    const nextStr = next.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    el.textContent = `⟳ ${lastStr} | ↻ ${nextStr}`;
  } catch(e) { el.textContent = ''; }
}

// ── Init ───────────────────────────────────────────────────────────────────
fetch('Daten/config.json').then(r => r.json()).then(cfg => {
  if (cfg.myAddresses) MY_ADDRESSES = cfg.myAddresses;
}).catch(() => {}).finally(() => {
  applyMode(expertMode);
  loadAll();
  loadMails();
  const startedAt = Date.now();
  fetch(`${WRITE_SERVER}/run-export-mails`, { method: 'POST' }).catch(() => {});
  updateSyncStatus();
  const pollSyncInit = async () => {
    try {
      const r = await fetch('Daten/mail_sync_status.json?v=' + Date.now());
      if (r.ok) {
        const d = await r.json();
        if (d.ts >= startedAt) { updateSyncStatus(); return; }
      }
    } catch(e) {}
    if (Date.now() - startedAt < 5 * 60000) setTimeout(pollSyncInit, 5000);
  };
  setTimeout(pollSyncInit, 5000);
});
setInterval(renderHeader, 60000);
setInterval(loadICSAuto, 15 * 60000);
setInterval(() => {
  const anyOpen = document.querySelector('.mail-body[style*="display: block"], .mail-body[style*="display:block"]');
  if (!anyOpen) loadMails();
}, 5 * 60000);
