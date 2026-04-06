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
    
    // 1. Uhrzeit formatieren (HH:mm)
    const hrs = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hrs}:${min}`;

    // 2. Datum für die Header-Anzeige
    const dateOptions = { weekday: 'long', day: '2-digit', month: 'long' };
    document.getElementById('clock').innerText = `${hrs}:${min}`;
    document.getElementById('date-string').innerText = now.toLocaleDateString('de-DE', dateOptions);

    // 3. Kalenderwoche berechnen (ISO-8601 Standard)
    const tempDate = new Date(now.valueOf());
    const dayNum = (now.getDay() + 6) % 7;
    tempDate.setDate(tempDate.getDate() - dayNum + 3);
    const firstThursday = tempDate.valueOf();
    tempDate.setMonth(0, 1);
    if (tempDate.getDay() !== 4) {
        tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
    }
    const kw = 1 + Math.ceil((firstThursday - tempDate) / 604800000);
    const aktuellerMonat = now.toLocaleDateString('de-DE', { month: 'long' });
    
    // Anzeige in der Kalender-Kachel aktualisieren
    const calInfo = document.getElementById('cal-info');
    if (calInfo) {
        calInfo.innerText = `KW ${kw} | ${aktuellerMonat}`;
    }

    // 4. Phasen-Logik & Hintergrundfarbe
    const isWeekend = (now.getDay() === 6 || now.getDay() === 0);
    let currentPhase;

    if (isWeekend) {
        // Am Wochenende nutzen wir ein neutrales/helles Design
        document.body.className = 'phase-morning'; 
        document.getElementById('phase-task').innerText = "Wochenende genießen";
    } else {
        // Sortiere Phasen nach Zeit, um die aktuellste zu finden
        const sortedPhases = [...phases].sort((a, b) => a.time.localeCompare(b.time));
        
        // Standard: Falls vor der ersten Phase (z.B. nach Mitternacht), nimm die letzte (Schlafen)
        currentPhase = sortedPhases[sortedPhases.length - 1]; 

        for (let ph of sortedPhases) {
            if (currentTime >= ph.time) {
                currentPhase = ph;
            }
        }

        // Hintergrundklasse am Body setzen und Text in der Impuls-Kachel ändern
        document.body.className = currentPhase.css;
        const taskElement = document.getElementById('phase-task');
        if (taskElement) {
            taskElement.innerText = currentPhase.name;
        }
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

