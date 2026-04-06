// 1. Initialisierung der Phasen (Laden aus Speicher oder Standardwerte)
let phases = JSON.parse(localStorage.getItem('myapp_phases')) || [
    { id: 'morning', time: '06:30', name: 'Aufstehen', css: 'phase-morning' },
    { id: 'sport1', time: '07:45', name: 'Frühsport', css: 'phase-sport' },
    { id: 'work1', time: '08:00', name: 'Arbeiten', css: 'phase-work' },
    { id: 'break', time: '11:30', name: 'Mittagspause', css: 'phase-break' },
    { id: 'work2', time: '13:00', name: 'Arbeiten', css: 'phase-work' },
    { id: 'sport2', time: '16:00', name: 'Sport', css: 'phase-sport' },
    { id: 'wrap', time: '16:15', name: 'Wrap-Up', css: 'phase-evening' },
    { id: 'dinner', time: '18:00', name: 'Essen & Relaxen', css: 'phase-break' },
    { id: 'hobby', time: '20:00', name: 'Hobby / Lernen', css: 'phase-evening' },
    { id: 'stretch', time: '22:00', name: 'Dehnen', css: 'phase-sport' },
    { id: 'sleep', time: '22:30', name: 'Schlafen', css: 'phase-sleep' }
];

// 2. Hauptfunktion: Uhrzeit, Datum und Phasen-Logik aktualisieren
function updateApp() {
    const now = new Date();
    const hrs = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hrs}:${min}`;
    const isWeekend = (now.getDay() === 6 || now.getDay() === 0);

    // Uhrzeit und Datum im HTML setzen
    document.getElementById('clock').innerText = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('date-string').innerText = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });

    // KW (Kalenderwoche) berechnen
    const dateForKW = new Date(now.getTime());
    dateForKW.setHours(0, 0, 0, 0);
    dateForKW.setDate(dateForKW.getDate() + 3 - (dateForKW.getDay() + 6) % 7);
    const week1 = new Date(dateForKW.getFullYear(), 0, 4);
    const kw = 1 + Math.round(((dateForKW.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    document.getElementById('cal-info').innerText = `KW ${kw} | ${now.toLocaleDateString('de-DE', {month: 'long'})}`;

    // Phasen-Logik (Wochenende vs. Werktag)
    let currentPhase;
    if (isWeekend) {
        document.body.className = 'phase-morning'; // Helles Design für Wochenende
        document.getElementById('phase-task').innerText = "Wochenende genießen";
    } else {
        // Finde die aktuell gültige Phase basierend auf der Uhrzeit
        const sortedPhases = [...phases].sort((a, b) => a.time.localeCompare(b.time));
        currentPhase = sortedPhases[sortedPhases.length - 1]; // Standard: letzte Phase vom Vortag

        for (let ph of sortedPhases) {
            if (currentTime >= ph.time) {
                currentPhase = ph;
            }
        }

        document.body.className = currentPhase.css;
        document.getElementById('phase-task').innerText = currentPhase.name;
    }
}

// 3. Einstellungen-Panel umschalten (Anzeigen/Verbergen)
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    const list = document.getElementById('settings-list');
    
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
    } else {
        // Erzeuge Eingabefelder dynamisch aus dem phases-Array
        list.innerHTML = phases.map(ph => `
            <div class="setting-row">
                <input type="time" id="t-${ph.id}" value="${ph.time}" class="time-input">
                <input type="text" id="n-${ph.id}" value="${ph.name}" class="text-input">
            </div>
        `).join('');
        panel.style.display = 'block';
    }
}

// 4. Neue Werte aus den Einstellungen speichern
function saveSettings() {
    phases.forEach(ph => {
        const timeInput = document.getElementById('t-' + ph.id);
        const nameInput = document.getElementById('n-' + ph.id);
        if (timeInput && nameInput) {
            ph.time = timeInput.value;
            ph.name = nameInput.value;
        }
    });

    localStorage.setItem('myapp_phases', JSON.stringify(phases));
    toggleSettings();
    updateApp();
}

// 5. Historie-Log (einfache Version)
function logAction(msg) {
    console.log("Aktion geloggt: " + msg);
    alert(msg + " wurde für heute vermerkt.");
}

// 6. Start der App
setInterval(updateApp, 1000); // Jede Sekunde prüfen (für die Uhrzeit)
updateApp();

