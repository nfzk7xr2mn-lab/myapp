# Mein Fokus Dashboard – Projektdokumentation

Vollständige Anforderungs- und Implementierungsbeschreibung. Stand: April 2026.

---

## 1. Überblick

Ein persönliches **Browser-Dashboard** als lokale Web-App (kein Framework, kein Build-Step), das auf einem Windows-PC läuft und folgende Informationen auf einen Blick zeigt:

- Heutige **Kalender-Termine** (aus Outlook, als ICS-Datei)
- **Fokus-Bereich** mit Sportlinks, Lernplan, Bookmarks und Hörbüchern
- Persönliche **Action Items** mit Fälligkeitsdatum
- **Mails der laufenden Woche** aus Outlook, priorisiert und zusammengefasst

**Technologie-Stack:**
- Frontend: reines HTML/CSS/JavaScript (kein Framework)
- Backend für Schreibzugriff: Node.js HTTP-Server (Port 9001)
- Datenpipeline: PowerShell-Skripte via Windows Task Scheduler
- Datenformat: `.txt`-Dateien, `.ics`, `.json`
- Entwicklungsserver: `npx live-server` (Port 5500)

---

## 2. Verzeichnisstruktur

```
C:\Users\D025095\myapp\myapp\
├── index.html                   # Haupt-HTML, eine Seite
├── style.css                    # Komplettes Styling
├── script.js                    # Komplette Frontend-Logik
├── write-server.js              # Node.js Schreibserver (Port 9001)
├── start-servers.ps1            # Startet live-server + write-server (mit Auto-Restart)
├── restart-write-server.ps1     # Neustart write-server allein
├── register-write-server.ps1    # Registriert write-server als Task Scheduler Task
├── register-mail-export.ps1     # Registriert Mail-Export als Task Scheduler Task
├── export_outlook_today.ps1     # Exportiert heutige Kalendertermine als ICS → Daten/
├── export_outlook_mails.ps1     # Exportiert Mails der Woche als JSON → Daten/; schreibt auch Daten/config.json
├── export_sync_prep.ps1         # Prüft morgige Syncs, exportiert 2-Wochen-Mails pro Person → Daten/KW{n}-{Vorname}.json
├── summarize_mails.ps1          # Erstellt KI-Zusammenfassung via Claude API → Daten/
├── secrets.ps1                  # API-Keys, E-Mail-Adressen, Namen (NICHT committet)
├── config.json                  # Frontend-Konfiguration: myAddresses (NICHT committet)
├── .gitignore                   # Daten/, Wissen/, secrets.ps1, config.json
│
├── Daten/                       # Generierte Arbeitsdaten – nicht committet
│   ├── config.json              # myAddresses aus secrets.ps1 (auto-generiert von export_outlook_mails.ps1)
│   ├── notizen.json             # Schnellnotizen (JSON-Array)
│   ├── learn.txt                # Lernlinks (legacy, noch für Tab-Fallback)
│   ├── termine.txt              # Kalender-Fallback (legacy)
│   ├── termine_YYYYMMDD.ics     # Kalenderexport des jeweiligen Tages
│   ├── mails_heute.json         # Mails der laufenden Woche (empfangen + gesendet)
│   ├── KW{n}-{Vorname}.json     # 2-Wochen-Mails pro Sync-Person (erzeugt von export_sync_prep.ps1)
│   ├── sync_files.json          # Liste der Sync-Dateien für Dashboard [{name, file, date}]
│   ├── export_mail.log          # Protokoll der Mail-Exportläufe
│   └── summary_KW{n}.json       # KI-Zusammenfassung der Kalenderwoche n
│
└── Wissen/                      # Kuratierte Inhaltsdaten – nicht committet
    ├── hörbuch.json             # Hörbuch-Einträge mit Kerngedanken
    ├── hinterbliebenen.json     # Postmortem-Checkliste (gleiches Format wie hörbuch.json)
    ├── links.json               # Bookmark-Links
    ├── lernplan.json            # 6-Wochen-Lernplan (Tech + Führung, 42 Tage)
    ├── lernplan_progress.json   # Fortschritt im Lernplan { "1": true, ... }
    └── sport.json               # Sportlinks (kuratierte Dauerliste)
```

---

## 3. Layout und Design

### 3.1 Grundlayout

- Vollbild (`100vh`), kein Scrollen der Gesamtseite (`overflow: hidden`)
- **Header** oben: Uhrzeit (groß, gold), Datum ausgeschrieben, Tagesphase-Badge
- **Hauptbereich**: 4 gleich breite Kacheln (`grid-template-columns: 1fr 1fr 1fr 1fr`)
- Schrift: `Inter` (Google Fonts), Basisfarbe: helles Beige `#f0ead6`
- Hintergrund: sehr dunkles Blau-Schwarz `#05050a`

### 3.2 Tagesphase-Hintergründe

Die Hintergrundfarbe wechselt automatisch je nach Tageszeit. Alle 6 Phasen nutzen `radial-gradient(ellipse at top, ...)` mit 3 Haltepunkten (sehr dunkel, elegant):

| Phase       | Zeitraum      | Farbfamilie               | CSS-Klasse           |
|-------------|---------------|---------------------------|----------------------|
| Morgen      | 06:00–11:30   | Warmes Champagner-Gold    | `phase-morgen`       |
| Mittag      | 11:30–13:00   | Tiefes Smaragdgrün        | `phase-mittag`       |
| Nachmittag  | 13:00–17:00   | Kühles Saphirblau         | `phase-nachmittag`   |
| Abend       | 17:00–19:30   | Tiefes Bordeaux-Rosé      | `phase-abend`        |
| Spätabend   | 19:30–22:30   | Amethyst                  | `phase-spaetabend`   |
| Nacht       | 22:30–06:00   | Mitternachtsblau          | `phase-nacht`        |

Die Phase wird per `body.className = phase.css` gesetzt. Der Übergang ist mit `transition: background 2s ease` animiert.

### 3.3 Farbpalette

```css
--gold:        #C9A84C   /* Hauptakzent */
--gold-light:  #E8C97A   /* Hell-Akzent */
--gold-dark:   #8B6914   /* Dunkel-Akzent */
--tile-bg:     rgba(255,255,255,0.04)
--tile-border: rgba(201,168,76,0.18)
--text:        #f0ead6
--text-muted:  #8a7d60
--radius:      16px
--shadow:      0 4px 32px rgba(0,0,0,0.5)
```

### 3.4 Kachel-Design

Jede Kachel (`div.tile`) hat:
- Dunkles semi-transparentes Hintergrundbild + `backdrop-filter: blur(20px)`
- Gold-farbenen Border
- Interner Aufbau: `.tile-header` / (optionale Tabs) / `.tile-body` (scrollbar) / `.tile-footer`

---

## 4. Kachel 1: Kalender

### Anforderungen
- Zeigt heutige Termine mit Uhrzeit und Titel
- Laufender Termin wird **gold hervorgehoben** (`cal-current`)
- Vergangene Termine werden **ausgegraut** (`cal-past`, opacity 0.4)
- **Ab 17 Uhr**: Vorschau der morgigen Termine unterhalb (gedimmt, `cal-tomorrow`)
- ICS-Datei wird automatisch beim Start und alle 15 Minuten geladen (kein manueller Import)

### Datei: `Daten/termine_YYYYMMDD.ics`
- Dateiname enthält das Datum (z.B. `termine_20260419.ics`, `termine_20260420.ics`)
- Wird von `export_outlook_today.ps1` erzeugt — je eine Datei für heute und morgen
- ICS-Standard, Zeiten als UTC (`Z`-Format) oder lokal

### ICS-Parser (`parseICS(text, forDate)`)
- Verarbeitet `BEGIN:VEVENT` / `END:VEVENT` Blöcke
- Liest `DTSTART`, `DTEND`, `SUMMARY`, `TRANSP`
- Ganztagstermine (`DTSTART;VALUE=DATE:YYYYMMDD`, kein `T`) → `allDay: true`, werden ohne Uhrzeit angezeigt
- UTC-Zeiten (`Z`-Suffix) werden korrekt in Lokalzeit umgerechnet
- **Free-Termine werden gefiltert**: `TRANSP:TRANSPARENT` → wird nicht angezeigt
- Filtert auf das übergebene Zieldatum (`forDate`), Standard: heute
- Sortierung nach Startzeit

### Auto-Load (`loadICSAuto`)
- Lädt beim Start und alle 15 Minuten **parallel** heute- und morgen-ICS via `Promise.allSettled`
- Hilfsfunktion `ymdOf(date)` erzeugt den `YYYYMMDD`-Teil des Dateinamens
- Fehler werden still ignoriert (Datei noch nicht vorhanden)

### Fallback
- Falls keine ICS-Datei vorhanden: `rawTermine` aus `Daten/termine.txt` (legacy)

### Sync-Vorbereitung (📋-Link)
- Beim Start wird `Daten/sync_files.json` geladen (erzeugt von `export_sync_prep.ps1`)
- Enthält `[{name, file, date}]` — eine Zeile pro Sync-Termin mit Dateiname
- Beim Rendern eines Kalendereintrags: wenn der Terminbetreff einen Namen aus `syncFiles` enthält, wird ein 📋-Link neben dem Titel eingeblendet
- Klick auf 📋 öffnet Modal `#modal-sync` und lädt `Daten/{file}` (KW{n}-{Vorname}.json)
- Modal zeigt Mail-Liste chronologisch: Datum, Typ (empfangen/gesendet), Absender/Empfänger gekürzt via `shortName()` (Vorname N.), Betreff, Body-Vorschau

---

## 5. Kachel 2: Fokus (6 Tabs)

### Anforderungen
- 6 Tabs: **Notizen**, **Sport**, **Führung**, **Tech**, **Links**, **Wissen**
- Standard-Tab **phasenabhängig** (`defaultFokusTab()`):
  - vor 8 Uhr → Sport
  - ab 17 Uhr → Wissen
  - tagsüber (8–17 Uhr) → Notizen
- Tab-Identifikation via `data-tab`-Attribut (nicht Buttontext)
- Footer-Buttons: `+ Notiz` nur im Notizen-Tab, `+ Link` nur im Links-Tab; alle 4 Tile-Footer haben gleiche Höhe via unsichtbarem Platzhalter-Button (`border-color:transparent`) — Trennlinien liegen dadurch immer auf exakt gleicher Höhe

### Tab Notizen
- Schnellnotizen aus `Daten/notizen.json`
- Jede Notiz: Überschrift + Datum in der Zusammenfassung — Freitext aufklappbar via `<details>`, standardmäßig geschlossen
- Offene Notizen bleiben beim Re-Render offen (open-State wird per Index gespeichert und wiederhergestellt)
- Zeilen mit Emoji am Anfang werden **fett** dargestellt, reine Textzeilen in `--text-muted` (grau)
- ✎-Button öffnet Modal mit vorausgefülltem Inhalt zum Bearbeiten (Datum bleibt erhalten)
- ✕-Button löscht Notiz dauerhaft
- Neueste Notiz oben (beim Speichern per `unshift` eingefügt)
- `+ Notiz` Button öffnet Modal mit Überschrift + Textarea
- Dateiformat `Daten/notizen.json`:
```json
[{"titel":"…","datum":"TT.MM.","text":"…"}]
```
- `saveNotizenFile()` → PUT `/notizen.json` → `Daten/notizen.json`

### Tab Sport
- Zeigt alle Einträge aus `Wissen/sport.json`
- Kein ✕-Button (kuratierte Dauerliste, kein Erledigt-Konzept)
- Dateiformat `Wissen/sport.json`:
```json
[{"id":1,"title":"…","creator":"…","url":"…","category":"…"}]
```
- Kategorien: `Dehnübungen für Frauen über 50`, `kurze Yogaübungen`, `kurze Sporteinheiten mit den eigenen Körper ohne Hilfsmittel`

### Tab Führung
- Flache Liste aller Lernplan-Einträge mit Führungs-Topics
- Topics die als Führung gelten: `leadership`, `role clarity`, `mindset`, `managing managers`, `execution`, `okr`, `delivery`, `scaling`, `organization`, `vision`, `1:1s`, `feedback`, `culture`, `management`
- Jeder Eintrag: Checkbox + Titel + Creator (gedimmt) + Link
- Abgehakte Einträge grau + durchgestrichen
- Fortschrittsanzeige (done/total) oben

### Tab Tech
- Flache Liste aller Lernplan-Einträge **ohne** Führungs-Topics
- Alle übrigen Topics (LLMs, k8s, ABAP, cloud, architecture, devops, AI, RAG, …)
- Gleiche Darstellung wie Führung-Tab

### Lernplan-Fortschritt
- Fortschritt in `Wissen/lernplan_progress.json` gespeichert: `{ "1": true, "5": true, … }`
- `toggleLernplanDay(day, checked)` → aktualisiert State + speichert + re-rendert
- `saveLernplanProgress()` → PUT `http://127.0.0.1:9001/lernplan_progress.json`

### Tab Links
- Dateiformat `Wissen/links.json`: Array von `{"label": "...", "url": "..."}` Objekten
- Klick auf Bezeichnung öffnet URL in neuem Tab
- ✕-Button löscht Eintrag dauerhaft
- "+ Link" Button öffnet Modal

### Tab Wissen
- Hörbücher aus `Wissen/hörbuch.json`
- Hinterbliebenen-Checkliste aus `Wissen/hinterbliebenen.json` (gleiche Struktur)
- Beide werden parallel via `Promise.allSettled` geladen
- Aufklappbar: Titel → Zusammenfassung → Resümee (Kerngedanken)
- Abschnittstrenner `wissen-section-header` zwischen den beiden Quellen
- Dateiformat identisch für beide JSONs:
```json
[{"titel":"…","autor":"…","zusammenfassung":"…","kerngedanken":[{"nr":1,"titel":"…","beschreibung":"…"}]}]
```
- Zeilenumbrüche in `beschreibung` als `\n` escapen (JSON erlaubt keine echten Zeilenumbrüche)

### Schreiben via Write-Server
- `saveNotizenFile()` → PUT `/notizen.json` → `Daten/notizen.json`
- `saveSportFile()` → PUT `/sport.json` → `Wissen/sport.json`
- `saveLinksFile()` → PUT `/links.json` → `Wissen/links.json`
- `saveLernplanProgress()` → PUT `/lernplan_progress.json` → `Wissen/lernplan_progress.json`

---

## 6. Kachel 3: Actions

### Anforderungen
- Persönliche To-Do-Liste mit Fälligkeitsdatum
- Offene Actions sortiert nach Fälligkeit (überfällig → heute → zukünftig)
- Erledigte Actions dieser Woche werden angezeigt (durchgestrichen, transparent)
- Erledigte Actions **der Vorwoche** werden ausgeblendet
- Neue Action per Modal: Text + Fälligkeitsdatum
- Bestehende Actions per ✎-Button bearbeiten (Text + Fälligkeitsdatum änderbar, Erstelldatum bleibt erhalten)

### Dateiformat `Daten/actions.json`
```json
[
  {"created":"19.04.","due":"19.04.2026","text":"Beschreibung","done":false}
]
```
- `created`: Erstelldatum `TT.MM.`
- `due`: Fälligkeitsdatum `TT.MM.` oder `TT.MM.JJJJ` (beide Formate werden unterstützt)
- `text`: Beschreibung
- `done`: `true` = erledigt

### Farbkodierung
- Überfällig: rot (`#e74c3c`)
- Heute fällig: gold, fett
- Offen/zukünftig: gedämpft
- URLs im Text werden automatisch als klickbare Links dargestellt (`linkify()`, öffnet in neuem Tab)

### Schreiben via Write-Server
- `saveActionsFile()` → PUT `http://127.0.0.1:9001/actions.json` → `Daten/actions.json`

---

## 7. Kachel 4: Mails

### Anforderungen
- Mails der **laufenden Arbeitswoche** aus Outlook
- Nach Wochentag gruppiert, Tabs Mo–Fr (aktueller Tag vorausgewählt)
- Priorisierung: Chef > Direkt > Action > CC > FYI
- Absender als "Vorname N." gekürzt (kursiv), DLs ausgeschrieben
- Klick auf Mail öffnet Vorschautext
- Kein Refresh wenn eine Mail gerade geöffnet ist (5-Min-Intervall, Pause wenn Body sichtbar)
- KI-Zusammenfassung der Woche: auf Knopfdruck anfordern, bei Existenz direkt abrufbar

### Datei: `Daten/mails_heute.json`
JSON-Array, ein Objekt pro Mail:
```json
{
  "date":    "18.04.",
  "time":    "09:42",
  "typ":     "empfangen",
  "from":    "Reichart, Stephan",
  "to":      "Schott, Susanne",
  "cc":      "",
  "prio":    "chef",
  "auftrag": false,
  "subject": "Betreff",
  "body":    "Mailtext (max. 300 Zeichen)"
}
```
- `typ`: `"empfangen"` oder `"gesendet"`
- `auftrag`: `true` wenn Betreff/Body Auftrags-Keywords enthält

### Prioritätssystem

| Prio     | Symbol | Bedeutung                           | Darstellung                     |
|----------|--------|-------------------------------------|---------------------------------|
| `chef`   | ★      | Von meinem Vorgesetzten             | Orange (#e07b54), fetter Rand   |
| `direct` | ●      | Nur ich in To                       | Gold, fetter Rand               |
| `action` | ◆      | Ich + andere in To                  | Grün (#7ecfb0), dünner Rand     |
| `cc`     | ○      | Nur in CC                           | 60% Opacity                     |
| `fyi`    | ·      | Nicht adressiert / Newsletter       | 38% Opacity                     |
| `sent`   | 📤     | Gesendet                            | 75% Opacity, gedämpft           |

Mails mit `auftrag: true` erhalten roten linken Rand + ⚑-Badge.

### Namenskürzung `shortName()`
1. Starts with `DL ` oder enthält `_` oder Ziffer → **vollständig anzeigen**
2. Format `Nachname, Vorname` → `Vorname N.`
3. Format `Vorname Nachname` → `Vorname N.`
4. Einwörtige Namen → unverändert

Alle Namen werden **kursiv** (`<em>`) dargestellt.

### Ausschluss-Filter (in `export_outlook_mails.ps1`)
Mails werden ignoriert wenn Absender enthält:
- `itsm`
- `sharepoint`
- `do.not.reply+hrwf@sap.com`

### Wochenzusammenfassung
- Button "⟳ Zusammenfassen" löst Polling aus: prüft alle 3 Sekunden ob `Daten/summary_KW{n}.json` neuer ist als der Zeitpunkt des Klicks (bis 90 Sek. Timeout)
- Wenn Datei existiert und aktuell: Button "KW{n} lesen" erscheint
- Zusammenfassung wird Markdown → HTML gerendert (h3/h4/ul/li/strong/em)

### History-Tab
- Fixer 📋-Tab ganz rechts in der Mail-Tab-Leiste
- Lädt alle verfügbaren `summary_KW{n}.json`-Dateien (sucht die letzten 20 KWs rückwärts)
- KW-Auswahl innerhalb der History-Ansicht
- Zurück zur Mail-Liste per "← Mails anzeigen"-Button

### Datei: `Daten/summary_KW{n}.json`
```json
{ "summary": "Markdown-Text...", "ts": 1776516962481 }
```

---

## 8. Write-Server (`write-server.js`)

Node.js HTTP-Server, läuft lokal auf `http://127.0.0.1:9001`.

### Anforderungen
- `PUT`-Methode für Datei-Schreibzugriffe (Allowlist):

| Dateiname              | Zielordner  |
|------------------------|-------------|
| `actions.json`         | `Daten/`    |
| `notizen.json`         | `Daten/`    |
| `learn.txt`            | `Daten/`    |
| `termine.txt`          | `Daten/`    |
| `links.json`           | `Wissen/`   |
| `lernplan_progress.json` | `Wissen/` |
| `sport.json`           | `Wissen/`   |

- `POST /run-export-mails` — startet `export_outlook_mails.ps1` via `child_process.spawn`
- `POST /run-summarize` — startet `summarize_mails.ps1` via `child_process.spawn`
- CORS-Header für `*`
- Lauscht nur auf `127.0.0.1`
- UTF-8-Encoding

**Wichtig:** Der write-server muss in der interaktiven Windows-Session laufen (nicht als Dienst/SYSTEM), damit die gestarteten PowerShell-Prozesse Zugriff auf Outlook COM haben.

---

## 9. PowerShell-Datenpipeline

### 9.1 `secrets.ps1` (nicht committet)
Enthält alle personenbezogenen Daten und API-Schlüssel:
```powershell
$ApiKey          = "..."
$ProxyUri        = "http://localhost:9000/anthropic/v1/messages"
$MyAddresses     = @('email1@...', 'email2@...')
$MyDisplayNames  = @('nachname, vorname', 'vorname nachname')
$ChefNames       = @('nachname, vorname', 'vorname nachname')
$ChefEmail       = 'vorname.nachname@sap.com'
$Mitarbeiter     = @(
    @{ name = 'Nachname, Vorname'; email = 'vorname.nachname@sap.com' },
    ...
)
```
`$Mitarbeiter` enthält alle direkten Mitarbeiter als Hashtable-Array. `$ChefEmail` ist die E-Mail-Adresse des Vorgesetzten. Wird in jedem Skript via `. "$PSScriptRoot\secrets.ps1"` geladen.

### 9.1b `Daten/config.json` (nicht committet, auto-generiert)
```json
{ "myAddresses": ["email1@...", "email2@..."] }
```
Wird von `export_outlook_mails.ps1` aus `$MyAddresses` (secrets.ps1) erzeugt. Wird beim App-Start per `fetch('Daten/config.json')` geladen. Keine manuelle Pflege nötig.

### 9.2 `export_outlook_today.ps1`
- Verbindet sich mit Outlook COM
- Exportiert **heute und morgen** je als eigene ICS-Datei
- Export-Logik in `Export-DayICS`-Funktion gekapselt, wird zweimal aufgerufen
- Ganztagstermine (`item.AllDayEvent`) → `DTSTART;VALUE=DATE:YYYYMMDD` (kein UTC-Stempel)
- Normale Termine → UTC (`DTSTART:YYYYMMDDTHHmmssZ`)
- Free-Termine (`item.BusyStatus -eq 0`) → `TRANSP:TRANSPARENT` wird mitgeschrieben
- Erstellt `Daten/` automatisch falls nicht vorhanden

### 9.3 `export_outlook_mails.ps1`
- Verbindet sich mit Outlook COM (benötigt interaktive Session)
- Liest Posteingang rekursiv (inkl. Unterordner via `Restrict()`)
- Liest Gesendete Elemente
- Filtert: aktueller Montag bis einschließlich heute
- Schreibt `Daten/mails_heute.json` (UTF-8 ohne BOM)
- Schreibt `Daten/export_mail.log`
- Überschreibt bestehende Datei **nicht** wenn Export 0 Mails liefert
- Erstellt `Daten/` automatisch falls nicht vorhanden

### 9.4 `export_sync_prep.ps1`
- Prüft Kalender des **nächsten Tages** auf 1:1-Sync-Termine mit Mitarbeitern und Chef
- Suchpool: `$Mitarbeiter` + `@{ name='Reichart, Stephan'; email=$ChefEmail }` (aus secrets.ps1)
- Namensabgleich: Namensteile (>2 Zeichen) gegen Terminbetreff (case-insensitive)
- Lädt alle Inbox- und Gesendete-Mails der letzten **2 Wochen** einmalig (nicht pro Person)
- Mail-Filter via **DASL-Syntax** (`@SQL="urn:schemas:httpmail:datereceived" >= '...'`) — notwendig weil Outlook `Restrict()` mit `[ReceivedTime]` auf Exchange-Stores versagt
- Suche in Inbox rekursiv (inkl. Unterordner), ebenso Gesendete Elemente
- Matching pro Person: Empfangen → Absender-Email/Name; Gesendet → To/CC-Felder
- Schreibt `Daten/KW{n}-{Vorname}.json` pro gefundener Person (UTF-8 ohne BOM)
- Schreibt `Daten/sync_files.json`: `[{name, file, date}]` für Dashboard-Integration
- Dateiformat `Daten/KW{n}-{Vorname}.json`:
```json
[{"date":"19.04.2026","time":"09:42","typ":"empfangen","from":"...","to":"...","subject":"...","body":"..."}]
```

### 9.5 `summarize_mails.ps1`
- Liest `Daten/mails_heute.json`
- Sendet POST an Anthropic-API (via lokalem Proxy Port 9000)
- Modell: `anthropic--claude-sonnet-latest`, max 2048 Tokens
- Schreibt `Daten/summary_KW{n}.json`
- Erstellt `Daten/` automatisch falls nicht vorhanden

### 9.6 `start-servers.ps1`
Startet live-server (Port 5500) und write-server (Port 9001). Stoppt zuvor **beide** laufenden Prozesse auf Port 5500 und 9001 (vorher nur Port 9001).

### 9.7 `register-mail-export.ps1`
Registriert `export_outlook_mails.ps1` als Task Scheduler Task mit `LogonType Interactive`.

---

## 10. Refresh-Logik

| Was                           | Intervall         | Bedingung                                   |
|-------------------------------|-------------------|---------------------------------------------|
| Uhr + Header                  | alle 60 Sekunden  | immer                                       |
| ICS-Datei nachladen           | alle 15 Minuten   | immer                                       |
| Mails nachladen               | alle 5 Minuten    | nur wenn kein Mail-Body gerade geöffnet     |
| Mail-Export + Zusammenfassung | auf Knopfdruck    | Button "Zusammenfassen" triggert beides     |

---

## 11. Daten-Persistenz und `.gitignore`

**Nicht committet:**
```
secrets.ps1
Daten/
Wissen/
```

**Committet:**
- `index.html`, `style.css`, `script.js`
- `write-server.js`
- Alle `.ps1` außer `secrets.ps1`
- `.gitignore`, `PROJEKT_DOKUMENTATION.md`

---

## 12. Modals

| Modal ID        | Zweck                                    | Felder                              |
|-----------------|------------------------------------------|-------------------------------------|
| `modal-action`  | Action erfassen **oder bearbeiten**      | Text, Fälligkeitsdatum              |
| `modal-notiz`   | Neue Schnellnotiz erfassen               | Überschrift, Freitext (Textarea)    |
| `modal-link`    | Neuen Bookmark-Link hinzufügen           | Bezeichnung (optional), URL         |
| `modal-sync`    | Sync-Mails anzeigen                      | Read-only, Mail-Liste aus KW{n}-{Vorname}.json |

Geschlossen per Klick auf den Hintergrund. Footer-Buttons je nach aktivem Tab eingeblendet.

---

## 13. Sicherheits- und Datenschutz-Anforderungen

- **Niemals** API-Keys, E-Mail-Adressen oder Personennamen in committierten Dateien
- Alle Secrets ausschließlich in `secrets.ps1` (in `.gitignore`)
- Write-Server erlaubt nur Schreibzugriff auf explizit erlaubte Dateien (Allowlist)
- Write-Server lauscht nur auf `127.0.0.1`

---

## 14. Entwicklungsumgebung einrichten (Schritt für Schritt)

1. Node.js installieren (für write-server)
2. `npm install -g live-server` (oder via npx)
3. `secrets.ps1` anlegen (Vorlage aus Abschnitt 9.1)
4. `config.json` anlegen (Vorlage aus Abschnitt 9.1b)
5. Write-Server als Task Scheduler Task registrieren: `.\register-write-server.ps1`
6. Task Scheduler Tasks für PS-Skripte einrichten:
   - `export_outlook_today.ps1` – täglich morgens
   - `export_outlook_mails.ps1` – alle 5 Minuten (Interactive)
7. Dashboard starten: `.\start-servers.ps1`
8. Browser öffnen: `http://127.0.0.1:5500`

---

## 15. Bekannte Designentscheidungen und Fallstricke

- **Outlook COM**: Benötigt laufendes Outlook **und** interaktive Windows-Session. Task Scheduler Tasks müssen mit `LogonType Interactive` registriert sein, sonst `CO_E_SERVER_EXEC_FAILURE (0x80080005)`
- **write-server als COM-Proxy**: Da der Browser Outlook nicht direkt ansprechen kann, spawnt write-server PowerShell-Prozesse — deshalb muss er in der interaktiven Session laufen
- **Keine leere JSON-Überschreibung**: `export_outlook_mails.ps1` schreibt `mails_heute.json` nur wenn Mails gefunden wurden
- **UTF-8 ohne BOM**: JSON-Dateien müssen BOM-frei sein (`New-Object System.Text.UTF8Encoding $false`)
- **Anthropic API via Proxy**: Läuft auf Port 9000 (separater lokaler Proxy)
- **Kein bundler**: Alles in einer JS-Datei, kein Import/Export
- **ICS Datumsformat**: Ganztagstermine als `VALUE=DATE` (kein `T`), normale Termine UTC mit `Z`-Suffix; Parser erkennt beide Formate automatisch
- **Free-Termine ausgeblendet**: `BusyStatus=0` → PS-Skript schreibt `TRANSP:TRANSPARENT`, Parser überspringt diese Events
- **WEEKDAY_SHORT**: Muss als Konstante in script.js definiert sein — fehlt sie, ist die Seite leer
- **DASL-Filter für Outlook Restrict()**: `[ReceivedTime]`-Filter schlägt auf Exchange-Stores (inkl. Unterordner) komplett fehl — liefert 0 Ergebnisse trotz vorhandener Mails. Lösung: DASL-Syntax `@SQL="urn:schemas:httpmail:datereceived" >= 'yyyy-MM-dd HH:mm:ss'` mit UTC-Zeitstempel. Für Gesendete: `urn:schemas:httpmail:date`.
- **PowerShell case-insensitiv**: `$SyncPersonen` und `$syncPersonen` sind dieselbe Variable — Akkumulator muss anders heißen (z.B. `$gefunden`).
- **Kalender-Restrict() funktioniert weiterhin** mit klassischem Format — nur Mail-Ordner brauchen DASL.
- **Em-Dashes in PS-Scripts**: PowerShell-Dateien müssen ASCII-sichere Zeichen verwenden (kein `—`, kein `–`)
- **modal.lock liegt in `C:\Temp\`**: Die Lock-Datei `myapp-modal.lock` wird in `C:\Temp\` geschrieben (nicht in `Daten/`), damit live-server sie nicht erkennt und keinen Seiten-Reload auslöst. Alle PS-Skripte prüfen entsprechend `C:\Temp\myapp-modal.lock`. `C:\Temp` muss existieren.
- **Daten/ wird auto-erstellt**: Alle PS-Skripte prüfen ob `Daten/` existiert und legen es ggf. an
- **Sport ist Standard-Tab**: Nur vor 8 Uhr; tagsüber Notizen, ab 17 Uhr Wissen — gesteuert via `defaultFokusTab()` in script.js
- **Tab-Matching via data-tab**: Tabs haben `data-tab`-Attribut statt Textvergleich — wichtig bei Umlauten (Führung)
- **Führung/Tech-Filter**: Topic-Matching gegen `FUEHRUNG_TOPICS` Set (lowercase); alles was nicht matcht → Tech-Tab
- **sport.json kuratiert**: Sport-Tab hat kein Erledigt-Konzept — `Wissen/sport.json` ist eine Dauerliste, nicht tagesbasiert
- **actions.json statt actions.txt**: Actions werden als JSON-Array gespeichert; `done: true` statt `x`-Flag; `due` akzeptiert `TT.MM.` und `TT.MM.JJJJ`
- **Notizen**: neueste oben (`unshift`), geschlossen via `<details>` ohne `open`-Attribut, Freitext mit Zeilenumbrüchen (`\n` → `<br>`)
- **Kalender-Vorschau morgen**: setzt voraus dass `termine_YYYYMMDD.ics` für den nächsten Tag existiert — wird jetzt von `export_outlook_today.ps1` erzeugt; ohne Datei bleibt die Vorschau leer
