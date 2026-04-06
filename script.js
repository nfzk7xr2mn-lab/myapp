let phases = [], appointments = "", actionItems = "", fullData = {};
let checkedStates = JSON.parse(localStorage.getItem('myapp_checked_states')) || {};

async function loadAllData() {
    const v = Date.now();
    try {
        const cRes = await fetch(`content.json?v=${v}`);
        if (!cRes.ok) throw new Error();
        fullData = await cRes.json();
        phases = fullData.phases || [];

        const tRes = await fetch(`termine.txt?v=${v}`);
        if (tRes.ok) appointments = await tRes.text();

        const aRes = await fetch(`actions.txt?v=${v}`);
        if (aRes.ok) actionItems = await aRes.text();

        updateApp();
    } catch (e) {
        document.getElementById('phase-task').innerHTML = `<span style="color:red;">JSON FEHLER!</span>`;
    }
}

function updateApp() {
    if (!phases.length) return;
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    document.getElementById('clock').innerText = currentTime;
    document.getElementById('date-string').innerText = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });

    // Phase ermitteln
    const sorted = [...phases].sort((a, b) => a.time.localeCompare(b.time));
    let idx = sorted.length - 1;
    for (let i = 0; i < sorted.length; i++) { if (currentTime >= sorted[i].time) idx = i; }
    const current = sorted[idx];

    document.body.className = current.css;
    document.getElementById('phase-task').innerText = current.name;

    // Termine (Heutige filtern)
    const todayStr = now.getDate().toString().padStart(2, '0') + "." + (now.getMonth() + 1).toString().padStart(2, '0') + ".";
    const appLines = appointments.split('\n').filter(l => l.trim().startsWith(todayStr));
    document.getElementById('cal-info').innerHTML = appLines.map(l => `<div class="cal-entry" style="font-size:0.85rem;">${l.substring(7)}</div>`).join('') || "Keine Termine heute";

    // Impulse
    const c = fullData.content[current.id];
    if (c) {
        document.getElementById('content-box').innerHTML = `
            <p style="font-size:0.9rem; margin-bottom:15px; font-style:italic;">"${c.tip}"</p>
            ${c.sport ? `<a href="${c.sport}" target="_blank" class="impulse-link">🏃 Sport</a>` : ''}
            ${c.learn ? `<a href="${c.learn}" target="_blank" class="impulse-link" style="background:rgba(255,255,255,0.1); color:white; margin-left:5px;">📖 Lernen</a>` : ''}
        `;
    }

    // Progress & Tasks
    const lines = actionItems.split('\n').filter(l => l.trim().includes('|'));
    let done = 0;
    const tasksHtml = lines.map(line => {
        const p = line.split('|').map(x => x.trim());
        const isChecked = checkedStates[line] || (p[3] && p[3].toLowerCase() === 'x');
        if (isChecked) done++;
        return `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; opacity:${isChecked?0.4:1}">
                <input type="checkbox" ${isChecked?'checked':''} onclick="toggleCheck('${line.replace(/'/g, "\\'")}')">
                <span style="font-size:0.85rem; ${isChecked?'text-decoration:line-through':''}">${p[2]}</span>
            </div>`;
    }).join('');

    const perc = lines.length ? Math.round((done / lines.length) * 100) : 0;
    document.getElementById('action-item-list').innerHTML = `
        <div class="progress-text">${perc}%</div>
        <div class="progress-container"><div class="progress-bar" style="width:${perc}%"></div></div>
        ${tasksHtml}
    `;
}

function toggleCheck(k) { checkedStates[k] = !checkedStates[k]; localStorage.setItem('myapp_checked_states', JSON.stringify(checkedStates)); updateApp(); }
function toggleFocus() { document.body.classList.toggle('focus-mode'); }
function toggleSettings() { const s = document.getElementById('settings-panel'); s.style.display = s.style.display === 'block' ? 'none' : 'block'; }
// ==========================================
// DYNAMISCHE WOCHENPLAN-LOGIK (KW-basiert)
// ==========================================
function openWeeklyScreenshot() {
    const modal = document.getElementById('screenshot-modal');
    const img = document.getElementById('weekly-img');
    const now = new Date();

    // 1. Kalenderwoche berechnen (ISO-Standard)
    const tempDate = new Date(now.valueOf());
    const dayNum = (now.getDay() + 6) % 7;
    tempDate.setDate(tempDate.getDate() - dayNum + 3);
    const firstThursday = tempDate.valueOf();
    tempDate.setMonth(0, 1);
    if (tempDate.getDay() !== 4) {
        tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
    }
    const kw = 1 + Math.ceil((firstThursday - tempDate) / 604800000);

    // 2. Bildpfad setzen (z.B. "15.png")
    // WICHTIG: Die Datei muss exakt so heißen wie die Zahl!
    img.src = `${kw}.png`; 

    // 3. Fehler abfangen (Falls das Bild für die KW noch nicht existiert)
    img.onerror = function() {
        console.error("Wochenplan für KW " + kw + " nicht gefunden.");
        // Optional: Ein Standardbild laden, falls KW-Bild fehlt:
        // img.src = "default.png"; 
    };

    // 4. Anzeigen
    modal.style.display = 'flex';
}

function logAction(m) { alert(m); }

loadAllData();
setInterval(updateApp, 5000);
 
