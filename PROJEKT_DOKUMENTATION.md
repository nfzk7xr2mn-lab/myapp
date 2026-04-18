# Mein Fokus Dashboard – Projektdokumentation

Vollständige Anforderungs- und Implementierungsbeschreibung. Stand: April 2026.

---

## 1. Überblick

Ein persönliches **Browser-Dashboard** als lokale Web-App (kein Framework, kein Build-Step), das auf einem Windows-PC läuft und folgende Informationen auf einen Blick zeigt:

- Heutige **Kalender-Termine** (aus Outlook, als ICS-Datei)
- **Fokus-Bereich** mit Lernlinks, Sporttipps und eigenen Bookmarks
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
├── start-servers.ps1            # Startet live-server + write-server
├── register-write-server.ps1    # Registriert write-server als Task Scheduler Task
├── export_outlook_today.ps1     # Exportiert heutige Kalendertermine als ICS
├── export_outlook_mails.ps1     # Exportiert Mails der Woche als JSON
├── summarize_mails.ps1          # Erstellt KI-Zusammenfassung via Claude API
├── secrets.ps1                  # API-Keys, E-Mail-Adressen, Namen (NICHT committet)
├── .gitignore                   # secrets.ps1, *.png, *.ics, *.txt, summary*.json
│
│   (Datendateien – nicht committet)
├── actions.txt                  # Action Items
├── learn.txt                    # Lernlinks und Sporttipps
├── links.txt                    # Bookmark-Links
├── termine_YYYYMMDD.ics         # Kalenderexport des jeweiligen Tages
├── mails_heute.json             # Mails der laufenden Woche
└── summary_KW{n}.json           # KI-Zusammenfassung der Kalenderwoche n
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
- ICS-Datei wird automatisch beim Start geladen

### Datei: `termine_YYYYMMDD.ics`
- Dateiname enthält das aktuelle Datum (z.B. `termine_20260418.ics`)
- Wird von `export_outlook_today.ps1` erzeugt
- ICS-Standard, Zeiten als UTC (`Z`-Format) oder lokal

### ICS-Parser (`parseICS`)
- Verarbeitet `BEGIN:VEVENT` / `END:VEVENT` Blöcke
- Liest `DTSTART`, `DTEND`, `SUMMARY`
- UTC-Zeiten werden korrekt in Lokalzeit umgerechnet
- Nur Termine **des heutigen Tages** werden angezeigt
- Sortierung nach Startzeit

### Auto-Load
- `loadICSAuto()` wird beim Start und alle 15 Minuten aufgerufen
- Dateiname wird dynamisch aus aktuellem Datum gebaut
- Fehler werden still ignoriert (Datei noch nicht vorhanden)

### Manueller Import
- Button "ICS importieren" öffnet `<input type="file">`
- Validiert, ob der Dateiname das heutige Datum enthält
- Nur `termine_YYYYMMDD.ics` für heute wird akzeptiert

### Fallback
- Falls keine ICS-Datei vorhanden: `rawTermine` aus `termine.txt` (legacy, Zeilen `TT.MM. HH:MM-HH:MM Titel`)

---

## 5. Kachel 2: Fokus (3 Tabs)

### Anforderungen
- 3 Tabs: **Lernen**, **Sport**, **Links**
- Lernen und Sport: Einträge aus `learn.txt`, nach Kategorien getrennt, abarbeitbar mit ✕
- Links: Bookmarks aus `links.txt`, immer sichtbar, löschbar aber nicht "erledigt"
- "+ hinzufügen" / "+ Link" Button unten öffnet kontextsensitives Modal

### Dateiformat `learn.txt`
```
Kategorie | TT.MM. | URL | [x]
```
- Pflichtfelder: Kategorie, Datum, URL
- 4. Feld `x` = als erledigt markiert
- Leerzeilen werden ignoriert

Kategorien sind fest unterteilt:
```javascript
WISSEN_KATS = ['Führung','Presentation','Verhandlungen','Rhetorik','KI','Naturwissenschaften']
SPORT_KATS  = ['Dehnübungen für Frauen über 50','kurze Yogaübungen',
               'kurze Sporteinheiten mit den eigenen Körper ohne Hilfsmittel']
```

### Tab Lernen / Sport
- Zeigt bis zu 5 aktive (nicht erledigte) Einträge der jeweiligen Kategoriegruppe
- ✕-Button markiert Eintrag mit `x` in learn.txt und spart ihn
- Falls keine eigenen Einträge vorhanden: `FALLBACK_LINKS` (fest kodierte Beispiel-URLs)
- Kategorie-Badge abgekürzt (erstes Wort)
- URL-Text: Domain + bis 40 Zeichen

### Tab Links
- Dateiformat `links.txt`: eine Zeile pro Eintrag `[Bezeichnung|URL]`
- Klick auf Bezeichnung öffnet URL in neuem Tab
- ✕-Button **löscht** den Eintrag dauerhaft aus links.txt
- Kein "erledigt"-Konzept: Links bleiben immer verfügbar bis gelöscht

### Modal: Lernlink hinzufügen
- Öffnet sich bei "+ hinzufügen" im Lernen- oder Sport-Tab
- `<select>` wird dynamisch mit WISSEN_KATS oder SPORT_KATS befüllt (je nach aktivem Tab)
- Eingabe: Kategorie (Dropdown), URL

### Modal: Link hinzufügen
- Öffnet sich bei "+ Link" im Links-Tab
- Eingabe: Bezeichnung (optional), URL
- Ohne Bezeichnung wird URL als Label verwendet

### Schreiben via Write-Server
- `saveLearnFile()` → PUT `http://127.0.0.1:9001/learn.txt`
- `saveLinksFile()` → PUT `http://127.0.0.1:9001/links.txt`
- Fallback bei Fehler: Browser-Download

---

## 6. Kachel 3: Actions

### Anforderungen
- Persönliche To-Do-Liste mit Fälligkeitsdatum
- Offene Actions sortiert nach Fälligkeit (überfällig → heute → zukünftig)
- Erledigte Actions dieser Woche werden angezeigt (durchgestrichen, transparent)
- Erledigte Actions **der Vorwoche** werden ausgeblendet
- Neue Action per Modal: Text + Fälligkeitsdatum

### Dateiformat `actions.txt`
```
TT.MM. | TT.MM. | Beschreibung | [x]
```
- Feld 1: Erstelldatum
- Feld 2: Fälligkeitsdatum
- Feld 3: Text
- Feld 4: `x` = erledigt (leer = offen)

### Farbkodierung
- Überfällig: rot (`#e74c3c`)
- Heute fällig: gold, fett
- Offen/zukünftig: gedämpft

### Schreiben via Write-Server
- `saveActionsFile()` → PUT `http://127.0.0.1:9001/actions.txt`

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

### Datei: `mails_heute.json`
JSON-Array, ein Objekt pro Mail:
```json
{
  "date":    "18.04.",
  "time":    "09:42",
  "from":    "Reichart, Stephan",
  "to":      "Schott, Susanne",
  "cc":      "",
  "prio":    "chef",
  "subject": "Betreff",
  "body":    "Mailtext (max. 300 Zeichen)"
}
```

### Prioritätssystem

| Prio     | Symbol | Bedeutung                           | Darstellung                     |
|----------|--------|-------------------------------------|---------------------------------|
| `chef`   | ★      | Von meinem Vorgesetzten             | Orange (#e07b54), fetter Rand   |
| `direct` | ●      | Nur ich in To                       | Gold, fetter Rand               |
| `action` | ◆      | Ich + andere in To                  | Grün (#7ecfb0), dünner Rand     |
| `cc`     | ○      | Nur in CC                           | 60% Opacity                     |
| `fyi`    | ·      | Nicht adressiert / Newsletter       | 38% Opacity                     |

### Namenskürzung `shortName()`
Gleiche Logik in JS und PowerShell:
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
- Button "⟳ Zusammenfassen" löst Polling aus: prüft alle 3 Sekunden ob `summary_KW{n}.json` neuer ist als der Zeitpunkt des Klicks (bis 90 Sek. Timeout)
- Wenn Datei existiert und aktuell: Button "KW{n} lesen" erscheint
- Zusammenfassung wird Markdown → HTML gerendert (h3/h4/ul/li/strong/em)

### Datei: `summary_KW{n}.json`
```json
{ "summary": "Markdown-Text...", "ts": 1776516962481 }
```

---

## 8. Write-Server (`write-server.js`)

Node.js HTTP-Server, läuft lokal auf `http://127.0.0.1:9001`.

### Anforderungen
- Nur `PUT`-Methode erlaubt
- Nur diese 4 Dateien dürfen geschrieben werden (Allowlist):
  - `actions.txt`
  - `learn.txt`
  - `termine.txt`
  - `links.txt`
- CORS-Header für `*` (damit Browser-Requests funktionieren)
- UTF-8-Encoding

### Registrierung als Task Scheduler Task
Skript `register-write-server.ps1`:
- Trigger: bei Windows-Anmeldung (`AtLogOn`)
- Kein Ablauf-Timeout (`ExecutionTimeLimit 0`)
- Auto-Restart: 3 Versuche, Intervall 1 Minute
- `MultipleInstances: IgnoreNew`
- Sofortiger Start nach Registrierung

---

## 9. PowerShell-Datenpipeline

### 9.1 `secrets.ps1` (nicht committet)
Enthält alle personenbezogenen Daten und API-Schlüssel:
```powershell
$ApiKey          = "..."                # Anthropic API Key
$ProxyUri        = "http://localhost:9000/anthropic/v1/messages"
$MyAddresses     = @('email1@...', 'email2@...')  # Eigene E-Mail-Adressen
$MyDisplayNames  = @('nachname, vorname', 'vorname nachname')  # Outlook-Anzeigenamen
$ChefNames       = @('nachname, vorname', 'vorname nachname')  # Chef-Erkennungsliste
```
Wird in jedem Skript via `. "$PSScriptRoot\secrets.ps1"` geladen (Dot-Sourcing).

### 9.2 `export_outlook_today.ps1`
- Verbindet sich mit Outlook COM (`New-Object -ComObject Outlook.Application`)
- Liest Standard-Kalender-Ordner (`olFolderCalendar = 9`)
- `IncludeRecurrences = $true` für Serientermine
- Filtert auf heutigen Tag
- Schreibt `termine_YYYYMMDD.ics` (UTC-Zeiten)

Muss **manuell oder via Task Scheduler** täglich morgens laufen.

### 9.3 `export_outlook_mails.ps1`
- Verbindet sich mit Outlook COM
- Liest Standard-Posteingang (`olFolderInbox = 6`) **rekursiv** (inkl. Unterordner wie "2026")
- Filtert: aktueller Montag bis einschließlich heute
- Erkennt Priorität via To/CC-Feldern + `$MyAddresses`/`$MyDisplayNames`/`$ChefNames`
- Schreibt `mails_heute.json` (UTF-8 ohne BOM, kein Kommas-Problem mit `ConvertTo-Json`)

Läuft via Task Scheduler alle 15 Minuten.

### 9.4 `summarize_mails.ps1`
- Liest `mails_heute.json`
- Baut Mailtext-Liste mit gekürzten Namen (`Get-ShortName`)
- Sendet POST an Anthropic-API (via lokalem Proxy auf Port 9000)
- Modell: `anthropic--claude-sonnet-latest`
- Prompt: Deutsch, nach Thema gruppieren, Action Items hervorheben, Namen kursiv (`*Name*`)
- Schreibt `summary_KW{n}.json`
- Body als UTF-8-Byte-Array gesendet (`[System.Text.Encoding]::UTF8.GetBytes(...)`) zur Vermeidung von Encoding-Problemen

Läuft via Task Scheduler periodisch (z.B. alle 15 Minuten).

### 9.5 `start-servers.ps1`
Hilfsskript: startet live-server (Port 5500) und write-server (Port 9001) in minimierten Fenstern.

---

## 10. Refresh-Logik

| Was                        | Intervall         | Bedingung                                  |
|----------------------------|-------------------|--------------------------------------------|
| Uhr + Header               | alle 30 Sekunden  | immer                                      |
| ICS-Datei nachladen        | alle 15 Minuten   | immer                                      |
| Mails nachladen            | alle 5 Minuten    | nur wenn **kein** Mail-Body gerade geöffnet |
| Kalender-Export (PS)       | täglich morgens   | manuell oder Task Scheduler                |
| Mail-Export (PS)           | alle 15 Minuten   | Task Scheduler                             |
| Zusammenfassung (PS)       | periodisch        | Task Scheduler                             |

---

## 11. Daten-Persistenz und `.gitignore`

**Nicht committet** (`.gitignore`):
```
*.png
*.ics
secrets.ps1
termine.txt
actions.txt
learn.txt
links.txt
mails_heute.json
summary_KW*.json
```

**Committet:**
- `index.html`, `style.css`, `script.js`
- `write-server.js`
- Alle `.ps1` außer `secrets.ps1`
- `.gitignore`

---

## 12. Modals

Drei Overlay-Modals (`.modal-overlay`), geschlossen per Klick auf den Hintergrund:

| Modal ID        | Zweck                          | Felder                          |
|-----------------|--------------------------------|---------------------------------|
| `modal-action`  | Neue Action erfassen           | Text, Fälligkeitsdatum          |
| `modal-learn`   | Neuen Lernlink hinzufügen      | Kategorie (Dropdown), URL       |
| `modal-link`    | Neuen Bookmark-Link hinzufügen | Bezeichnung (optional), URL     |

Das Lernen-Modal zeigt im Dropdown nur die Kategorien des aktiven Tabs (WISSEN_KATS oder SPORT_KATS).

---

## 13. Sicherheits- und Datenschutz-Anforderungen

- **Niemals** API-Keys, E-Mail-Adressen oder Personennamen in committierten Dateien
- Alle Secrets ausschließlich in `secrets.ps1` (in `.gitignore`)
- Write-Server erlaubt nur Schreibzugriff auf explizit erlaubte Dateien (Allowlist)
- Write-Server lauscht nur auf `127.0.0.1` (kein Netzwerkzugriff von außen)

---

## 14. Entwicklungsumgebung einrichten (Schritt für Schritt)

1. Node.js installieren (für write-server)
2. `npm install -g live-server` (oder via npx)
3. `secrets.ps1` anlegen (Vorlage aus Abschnitt 9.1)
4. Write-Server als Task Scheduler Task registrieren: `.\register-write-server.ps1`
5. Task Scheduler Tasks für PS-Skripte einrichten:
   - `export_outlook_today.ps1` – täglich morgens
   - `export_outlook_mails.ps1` – alle 15 Minuten
   - `summarize_mails.ps1` – alle 15 Minuten
6. Dashboard starten: `.\start-servers.ps1`
7. Browser öffnen: `http://127.0.0.1:5500`

---

## 15. Bekannte Designentscheidungen und Fallstricke

- **Outlook COM**: Benötigt laufendes Outlook. To-Feld enthält Anzeigenamen, nicht E-Mail-Adressen → `$MyDisplayNames` notwendig
- **UTF-8 ohne BOM**: JSON-Dateien müssen BOM-frei sein (`New-Object System.Text.UTF8Encoding $false`)
- **JSON mit ConvertTo-Json**: Bei einem einzigen Objekt kein Array → explizite Array-Prüfung nötig
- **Anthropic API via Proxy**: Läuft auf Port 9000 (separater lokaler Proxy, nicht direkt)
- **Kein bundler**: Alles in einer JS-Datei, kein Import/Export
- **ICS Datumsformat**: Outlook exportiert UTC-Zeiten mit `Z`-Suffix; Parser muss beides unterstützen
- **WEEKDAY_SHORT**: Muss als Konstante in script.js definiert sein (`['So','Mo','Di','Mi','Do','Fr','Sa']`) – fehlt sie, ist die Seite komplett leer
