// ==========================================
// 1. DATEN INITIALISIEREN
// ==========================================
let phases = JSON.parse(localStorage.getItem('myapp_phases')) || [
    { id: 'morning', time: '06:30', name: 'Aufstehen', css: 'phase-morning' },
    { id: 'work', time: '08:00', name: 'Arbeiten', css: 'phase-work' },
    { id: 'sleep', time: '22:30', name: 'Schlafen', css: 'phase-sleep' }
];

let appointments = "";
let actionItems = "";
let checkedStates = JSON.parse(localStorage.getItem('myapp_checked_states')) || {};

// ==========================================
// 2. EXTERNE DATEIEN LADEN (Über Live Server)
// ==========================================
async function loadExternalFiles() {
    try {
        // Cache-Buster (?v=...) verhindert, dass der Browser alte Versionen der Textdateien anzeigt
        const v = Date.now();
        
        const tRes = await fetch(`termine.txt?v=${v}`);
        if (tRes.ok) appointments = await tRes.text();
        
        const aRes = await fetch(`actions.txt?v=${v}`);
        if (aRes.ok) actionItems = await aRes.text();
        
        console.log("Dateien erfolgreich geladen.");
    } catch (e) {
        console.error("Fehler beim Laden der Dateien. Sicherstellen, dass 'Go Live' aktiv ist!", e);
        // Fallback auf LocalStorage falls Server offline
        appointments = localStorage.getItem('myapp_appointments') || "";
        actionItems = localStorage.getItem('myapp_actions') || "";
    }
    updateApp();
}

// ==========================================
// 3. HAUPTFUNKTION (UPDATE-LOOP)
// ==========================================
function updateApp() {
    const now = new Date();
    const hrs = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hrs}:${min}`;

    // Header-Daten
    document.getElementById('clock').innerText = currentTime;
    document.getElementById('date-string').innerText = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
    
    // KW Berechnung
    const tempDate = new Date(now.valueOf());
    const dayNum = (now.getDay() + 6) % 7;
    tempDate.setDate(tempDate.getDate() - dayNum + 3);
    const kw = 1 + Math.ceil((tempDate.valueOf() - new Date(tempDate.getFullYear(), 0, 4).valueOf()) / 604800000);

    // Phasen-Logik
    const sortedPhases = [...phases].sort((a, b) => a.time.localeCompare(b.time));
    let currentIndex = sortedPhases.length - 1;
    for (let i = 0; i < sortedPhases.length; i++) {
        if (currentTime >= sortedPhases[i].time) currentIndex = i;
    }
    const currentPhase = sortedPhases[currentIndex];
    const nextPhase = sortedPhases[(currentIndex + 1) % sortedPhases.length];

    document.body.className = currentPhase.css;
    const phaseEl = document.getElementById('phase-task');
    if(phaseEl) phaseEl.innerText = currentPhase.name;

    // --- KALENDER LOGIK (Aus termine.txt) ---
    const todayStr = now.getDate().toString().padStart(2, '0') + "." + (now.getMonth() + 1).toString().padStart(2, '0') + ".";
    const appLines = appointments.split('\n').filter(l => l.trim().startsWith(todayStr));
    
    let running = null, upcoming = [], nextP = null;
    appLines.forEach(line => {
        const time = line.substring(7, 12);
        const isNextBeforeCurrent = nextPhase.time < currentPhase.time;
        const inCurrent = !isNextBeforeCurrent ? (time >= currentPhase.time && time < nextPhase.time) : (time >= currentPhase.time || time < nextPhase.time);

        if (inCurrent) {
            if (time <= currentTime) running = line.substring(7);
            else upcoming.push(line.substring(7));
        } else if (time >= nextPhase.time && !nextP) {
            nextP = line.substring(7);
        }
    });

    const calInfo = document.getElementById('cal-info');
    if (calInfo) {
        let html = `KW ${kw} | ${now.toLocaleDateString('de-DE', {month:'long'})}`;
        if (running) html += `<div style="color:var(--accent-gold); font-weight:bold; margin-top:8px;">● JETZT: ${running}</div>`;
        if (upcoming.length > 0) html += `<div style="font-size:0.8rem; opacity:0.8; margin-top:5px; padding-left:10px;">🕒 Später: ${upcoming.join(', ')}</div>`;
        if (nextP) html += `<div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.1); padding-top:6px; font-size:0.75rem; opacity:0.6;">Danach: ${nextP}</div>`;
        calInfo.innerHTML = html;
    }

    // --- RÜCKBLICK LOGIK (Aus actions.txt) ---
    const actionDisplay = document.getElementById('action-item-list');
    if (actionDisplay) {
        const lines = actionItems.split('\n').filter(l => l.trim().includes('|'));
        let actionHtml = "";
        lines.forEach((line) => {
            const parts = line.split('|').map(p => p.trim());
            
            // Status: Entweder aus Datei (4. Spalte) ODER aus Browser-Klick
            let isChecked = (parts.length >= 4 && (parts[3].toLowerCase() === 'erledigt' || parts[3].toLowerCase() === 'x')) 
                            || checkedStates[line];

            const style = isChecked ? 'text-decoration:line-through; opacity:0.4;' : '';
            
            actionHtml += `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); padding:6px; border-radius:4px;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="toggleCheck('${line.replace(/'/g, "\\'")}')" style="cursor:pointer; width:16px; height:16px;">
                    <div style="font-size:0.75rem; ${style}">
                        <small style="color:var(--accent-gold); display:block; font-size:0.6rem;">${parts[0]} - ${parts[1]}</small>
                        ${parts[2]}
                    </div>
                </div>`;
        });
        actionDisplay.innerHTML = actionHtml || "<span style='color:gray;'>Keine Aufgaben in actions.txt</span>";
    }
}

// ==========================================
// 4. FUNKTIONEN & EVENTS
// ==========================================

function toggleCheck(lineKey) {
    checkedStates[lineKey] = !checkedStates[lineKey];
    localStorage.setItem('myapp_checked_states', JSON.stringify(checkedStates));
    updateApp();
}

function toggleSettings() {
    const p = document.getElementById('settings-panel');
    p.style.display = (p.style.display === 'block') ? 'none' : 'block';
    if (p.style.display === 'block') {
        const areaStyle = "width:100%; height:70px; margin-bottom:10px; background:#fff; border-radius:5px; border:none; padding:8px; font-family:monospace; font-size:0.8rem; color:#333;";
        document.getElementById('settings-list').innerHTML = `
            <p style="font-size:0.6rem; color:orange; margin-bottom:5px;">Hinweis: Änderungen hier werden im Browser gecached. Dateien manuell in VS Code pflegen!</p>
            <textarea id="appt-in" style="${areaStyle}">${appointments}</textarea>
            <textarea id="action-in" style="${areaStyle}">${actionItems}</textarea>
        ` + phases.map(ph => `<div style="display:flex; gap:5px; margin-bottom:5px;">
            <input type="time" id="t-${ph.id}" value="${ph.time}" style="flex:1;">
            <input type="text" id="n-${ph.id}" value="${ph.name}" style="flex:2;">
        </div>`).join('');
    }
}

function saveSettings() {
    appointments = document.getElementById('appt-in').value;
    actionItems = document.getElementById('action-in').value;
    localStorage.setItem('myapp_appointments', appointments);
    localStorage.setItem('myapp_actions', actionItems);
    phases.forEach(ph => {
        ph.time = document.getElementById('t-' + ph.id).value;
        ph.name = document.getElementById('n-' + ph.id).value;
    });
    localStorage.setItem('myapp_phases', JSON.stringify(phases));
    toggleSettings();
    updateApp();
}

function openWeeklyScreenshot() {
    const now = new Date();
    const tempDate = new Date(now.valueOf());
    const dayNum = (now.getDay() + 6) % 7;
    tempDate.setDate(tempDate.getDate() - dayNum + 3);
    const kw = 1 + Math.ceil((tempDate.valueOf() - new Date(tempDate.getFullYear(), 0, 4).valueOf()) / 604800000);
    document.getElementById('weekly-img').src = `${kw}.png`;
    document.getElementById('screenshot-modal').style.display = 'flex';
}

function logAction(msg) { console.log(msg); alert(msg); }

// INITIALER START
loadExternalFiles();
setInterval(updateApp, 5000); // Alle 5 Sek. UI Update
setInterval(loadExternalFiles, 30000); // Alle 30 Sek. Dateien neu einlesen
