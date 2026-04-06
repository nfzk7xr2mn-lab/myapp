// ==========================================
// 1. INITIALISIERUNG
// ==========================================
let phases = []; // Wird aus JSON geladen
let appointments = "";
let actionItems = "";
let fullData = {}; // Speichert die komplette content.json
let checkedStates = JSON.parse(localStorage.getItem('myapp_checked_states')) || {};
let currentPhaseGlobal = null;

// ==========================================
// 2. DATEN LADEN
// ==========================================
async function loadAllData() {
    const v = Date.now();
    try {
        // Content & Phasen JSON laden
        const cRes = await fetch(`content.json?v=${v}`);
        if (cRes.ok) {
            fullData = await cRes.json();
            phases = fullData.phases; // Phasen aus der JSON zuweisen
        }

        const tRes = await fetch(`termine.txt?v=${v}`);
        if (tRes.ok) appointments = await tRes.text();
        
        const aRes = await fetch(`actions.txt?v=${v}`);
        if (aRes.ok) actionItems = await aRes.text();
        
    } catch (e) {
        console.error("Datenfehler:", e);
    }
    updateApp();
}

// ==========================================
// 3. HAUPTFUNKTION
// ==========================================
function updateApp() {
    if (phases.length === 0) return; // Warten bis Daten da sind

    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    // Zeit & Datum
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
    currentPhaseGlobal = sortedPhases[currentIndex];
    const nextPhase = sortedPhases[(currentIndex + 1) % sortedPhases.length];

    // Design anpassen
    document.body.className = currentPhaseGlobal.css;
    document.getElementById('phase-task').innerText = currentPhaseGlobal.name;

    // --- KALENDER ANZEIGE ---
    const todayStr = now.getDate().toString().padStart(2, '0') + "." + (now.getMonth() + 1).toString().padStart(2, '0') + ".";
    const appLines = appointments.split('\n').filter(l => l.trim().startsWith(todayStr));
    
    let running = null, upcoming = [], nextP = null;
    appLines.forEach(line => {
        const timePart = line.substring(7, 18).trim(); 
        const startTime = timePart.split('-')[0];
        const isNextBeforeCurrent = nextPhase.time < currentPhaseGlobal.time;
        const inCurrent = !isNextBeforeCurrent ? (startTime >= currentPhaseGlobal.time && startTime < nextPhase.time) : (startTime >= currentPhaseGlobal.time || startTime < nextPhase.time);

        if (inCurrent) {
            if (startTime <= currentTime) running = line.substring(7);
            else upcoming.push(line.substring(7));
        } else if (startTime >= nextPhase.time && !nextP) {
            nextP = line.substring(7);
        }
    });

    const calInfo = document.getElementById('cal-info');
    if (calInfo) {
        let html = `<div style="opacity:0.5; font-size:0.75rem; margin-bottom:10px;">KW ${kw} | ${now.toLocaleDateString('de-DE', {month:'long'})}</div>`;
        if (running) html += `<div class="cal-entry" style="border-left-color:var(--accent-gold);"><small>JETZT</small><br><b>${running}</b></div>`;
        if (upcoming.length > 0) html += `<div class="cal-entry"><small>DEMNÄCHST</small><br>${upcoming.join('<br>')}</div>`;
        calInfo.innerHTML = html;
    }

    // --- IMPULSE AUS CONTENT-SEKTION ---
    const contentBox = document.getElementById('content-box');
    if (contentBox && fullData.content && fullData.content[currentPhaseGlobal.id]) {
        const c = fullData.content[currentPhaseGlobal.id];
        contentBox.innerHTML = `
            <div style="margin-top:15px; padding:12px; background:rgba(255,255,255,0.05); border-radius:8px;">
                <p style="font-size:0.8rem; margin-bottom:10px;">💡 ${c.tip}</p>
                <div style="display:flex; gap:10px;">
                    ${c.sport ? `<a href="${c.sport}" target="_blank" class="impulse-link">🏃 Sport</a>` : ''}
                    ${c.learn ? `<a href="${c.learn}" target="_blank" class="impulse-link">📖 Lernen</a>` : ''}
                </div>
            </div>`;
    }

    // --- RÜCKBLICK (Actions) ---
    const actionDisplay = document.getElementById('action-item-list');
    if (actionDisplay) {
        const lines = actionItems.split('\n').filter(l => l.trim().includes('|'));
        let actionHtml = "";
        lines.forEach((line) => {
            const parts = line.split('|').map(p => p.trim());
            let isChecked = (parts.length >= 4 && (parts[3].toLowerCase() === 'erledigt' || parts[3].toLowerCase() === 'x')) || checkedStates[line];
            const style = isChecked ? 'text-decoration:line-through; opacity:0.4;' : '';
            actionHtml += `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="toggleCheck('${line.replace(/'/g, "\\'")}')">
                    <span style="font-size:0.75rem; ${style}">${parts[2]}</span>
                </div>`;
        });
        actionDisplay.innerHTML = actionHtml || "Keine Aufgaben";
    }
}

// Checkbox-Logik
function toggleCheck(lineKey) {
    checkedStates[lineKey] = !checkedStates[lineKey];
    localStorage.setItem('myapp_checked_states', JSON.stringify(checkedStates));
    updateApp();
}

// Initialer Start
loadAllData();
setInterval(updateApp, 5000); 
setInterval(loadAllData, 30000); 
