# Mein Fokus Dashboard - Projektdokumentation

Vollstaendige Anforderungs- und Implementierungsbeschreibung. Stand: April 2026.

---

## 1. Ueberblick

Ein persoenliches **Browser-Dashboard** als lokale Web-App (kein Framework, kein Build-Step), das auf einem Windows-PC laeuft und folgende Informationen zeigt:

- **Grundmodus** (Standard): Ein kompakter Balken mit Uhrzeit, aktuellem Termin, Mail-Status und Tagesphase
- **Expertenmodus**: Vollansicht mit 4 Kacheln (Kalender, Fokus, Actions, Mails)

**Technologie-Stack:**
- Frontend: reines HTML/CSS/JavaScript (kein Framework)
- Backend fuer Schreibzugriff: Node.js HTTP-Server (Port 9001)
- Datenpipeline: PowerShell-Skripte via Windows Task Scheduler
- Datenformat: `.ics`, `.json`
- Entwicklungsserver: `npx live-server` (Port 5500)

---

## 2. Verzeichnisstruktur

```
C:\Users\D025095\myapp\myapp\
+-- index.html                   # Haupt-HTML, eine Seite
+-- style.css                    # Komplettes Styling
+-- script.js                    # Komplette Frontend-Logik
+-- write-server.js              # Node.js Schreibserver (Port 9001)
+-- setup.ps1                    # Einmaliges Setup: Prueft Voraussetzungen, registriert alle Tasks
+-- start-servers.ps1            # Startet live-server + write-server
+-- restart-writeserver.bat      # Startet write-server neu (ohne live-server)
+-- export_outlook_today.ps1     # Exportiert Kalendertermine heute+morgen als ICS -> Daten/
+-- export_outlook_mails.ps1     # Exportiert Mails der Woche als JSON -> Daten/
+-- export_sync_prep.ps1         # Prueft morgige Syncs, exportiert 2-Wochen-Mails pro Person
+-- summarize_mails.ps1          # KI-Zusammenfassung via Claude API -> Daten/summary_KW{n}.json
+-- plan_next_day.ps1            # KI-Tagesbewertung taeglich 18:00 -> Daten/notizen.json
+-- secrets.ps1                  # API-Keys, E-Mail-Adressen, Namen (NICHT committet)
+-- .gitignore
|
+-- Daten/                       # Generierte Arbeitsdaten - nicht committet
|   +-- config.json              # {myAddresses} auto-generiert von export_outlook_mails.ps1
|   +-- notizen.json             # Schnellnotizen + KI-Planungsnotizen [{titel,datum,ts,text}]
|   +-- actions.json             # Action Items [{created,due,text,done}]
|   +-- termine_YYYYMMDD.ics     # Kalenderexport des jeweiligen Tages (heute + morgen)
|   +-- mails_heute.json         # Mails der laufenden Woche (empfangen + gesendet)
|   +-- mail_sync_status.json    # {ts, count} letzter Mail-Export
|   +-- sync_files.json          # [{name, file, date}] Sync-Termine morgen
|   +-- KW{n}-{Vorname}.json     # 2-Wochen-Mails pro Sync-Person
|   +-- summary_KW{n}.json       # KI-Wochenzusammenfassung {summary, ts}
|   +-- export_mail.log          # Protokoll der Mail-Exportlaeufe
|
+-- Wissen/                      # Kuratierte Inhaltsdaten - nicht committet
    +-- hoerbuch.json            # Hoerbuch-Eintraege mit Kerngedanken
    +-- hinterbliebenen.json     # Postmortem-Checkliste
    +-- leistungsabfall.json     # Wissen zu Leistungsabfall
    +-- links.json               # Bookmark-Links [{label, url}]
    +-- lernplan.json            # 6-Wochen-Lernplan (Tech + Fuehrung, 42 Tage)
    +-- lernplan_progress.json   # Fortschritt {"1": true, ...}
    +-- sport.json               # Sportlinks (kuratierte Dauerliste)
```

---

## 3. Layout und Design

### 3.1 Modi: Grundmodus und Expertenmodus

Das Dashboard hat zwei Modi, umschaltbar per Taste `E` oder Button oben rechts. Der Modus wird in `localStorage` gespeichert. Standard: Expertenmodus (`expertMode = localStorage.getItem('expertMode') !== '0'`).

#### Grundmodus (`mode-simple`)

Nur ein horizontaler Balken, keine Kacheln:
```
[HH:MM]  [Wochentag, Datum]  [Phase]  |  [Termin]  |  [N Absender Betreff]  [Modus-Button]
```
- `#header` und `#tiles` sind ausgeblendet
- **Termin**: laufender Termin (startMin <= now <= endMin) oder naechster bevorstehender aus `icsEvents`
- **Mails**: Anzahl heutiger empfangener Mails + Absender + Betreff der letzten Mail
- Aktualisiert sich jede Minute

#### Expertenmodus (`mode-expert`)

Volle 4-Kachel-Ansicht. `#simple-bar` ist ausgeblendet.

#### Implementierung

| Funktion | Zweck |
|---|---|
| `applyMode(expert)` | Setzt `body.className`, speichert in `localStorage`, ruft `renderSimpleBar()` auf |
| `renderSimpleBar()` | Befuellt `#sb-clock`, `#sb-date`, `#sb-phase`, `#sb-cal`, `#sb-mail` |
| `renderHeader()` | Ruft `renderSimpleBar()` auf wenn `!expertMode` |
| `loadMails()` | Ruft `renderSimpleBar()` auf wenn `!expertMode` |
| `loadICSAuto()` | Ruft `renderSimpleBar()` auf wenn `!expertMode` |

### 3.2 Tagesphase-Hintergruende

| Phase | Zeitraum | CSS-Klasse |
|---|---|---|
| Morgen | 06:00-11:30 | `phase-morgen` |
| Mittag | 11:30-13:00 | `phase-mittag` |
| Nachmittag | 13:00-17:00 | `phase-nachmittag` |
| Abend | 17:00-19:30 | `phase-abend` |
| Spaetabend | 19:30-22:30 | `phase-spaetabend` |
| Nacht | 22:30-06:00 | `phase-nacht` |

### 3.3 Farbpalette

```css
--gold:        #C9A84C
--gold-light:  #E8C97A
--gold-dark:   #8B6914
--tile-bg:     rgba(255,255,255,0.04)
--tile-border: rgba(201,168,76,0.18)
--text:        #f0ead6
--text-muted:  #8a7d60
```

### 3.4 Kachel-Design (Expertenmodus)

Jede Kachel (`div.tile`):
- Semi-transparenter Hintergrund + `backdrop-filter: blur(20px)`
- Goldener Border
- Aufbau: `.tile-header` / (optionale Tabs) / `.tile-body` (scrollbar) / `.tile-footer`

### 3.5 Server-Status-Dot

Kleiner Kreis im Expertenmodus-Header (`#server-status`). Prueft alle 30 Sekunden `GET /ping`:
- Gruen: write-server erreichbar
- Rot: nicht erreichbar

---

## 4. Kachel 1: Kalender

### Darstellung
- Heutige Termine mit Uhrzeit und Titel
- Laufender Termin: gold hervorgehoben (`cal-current`)
- Vergangene Termine: grau, opacity 0.4 (`cal-past`)
- Tentativ: gedimmt, Badge `?` (`cal-tentative`)
- Optional: gedimmt, Badge `opt` (`cal-optional`)
- Ab 17 Uhr: Vorschau morgiger Termine (`cal-tomorrow`, opacity 0.55)

### ICS-Datei: `Daten/termine_YYYYMMDD.ics`
- Erzeugt von `export_outlook_today.ps1`
- Wird beim Start und alle 15 Minuten automatisch geladen (`loadICSAuto`)

### ICS-Parser (`parseICS(text, forDate)`)
- Liest `DTSTART`, `DTEND`, `SUMMARY`, `TRANSP`, `X-MICROSOFT-CDO-BUSYSTATUS`, `X-MYAPP-ROLE`
- `TRANSP:TRANSPARENT` -> wird nicht angezeigt (Free-Termine)
- `VALUE=DATE` ohne `T` -> Ganztag (`allDay: true`)
- UTC mit `Z`-Suffix -> korrekt in Lokalzeit umgerechnet

### Sync-Vorbereitung
- `Daten/sync_files.json` wird beim Start geladen
- Klick auf Termin-Link oeffnet `#modal-sync` mit Mailliste
- Titel im Modal: `shortName(name)` -- zeigt nur Vorname + erster Buchstabe Nachname

---

## 5. Kachel 2: Fokus (6 Tabs)

### Default-Tab
- Wird in `localStorage` gespeichert (`fokusTab`) -- bleibt nach Reload erhalten
- Erster Besuch ohne gespeicherten Wert: vor 8 Uhr -> Sport, 8-17 Uhr -> Notizen, ab 17 Uhr -> Wissen

### Tab Notizen
- Schnellnotizen aus `Daten/notizen.json`
- Aufklappbar via `<details>`, neueste oben
- Emoji-Zeilen in Gold (`--gold`), Leerzeile vor jeder Emoji-Zeile (ab 2. Zeile); Rest gedimmt
- **`+ Notiz`-Button** oeffnet Modal
- **`Planung`-Button** loest `plan_next_day.ps1` on-demand aus:
  - POST `/run-plan-next-day` -> write-server startet PS-Skript via `execFile`
  - Polling alle 8 Sekunden auf `Daten/notizen.json` bis Eintrag mit `titel.startsWith('Planung KW')` und `ts >= triggeredAt` (max. 5 Min.)
  - Doppelklick-Schutz via `planPolling`-Flag

Dateiformat `Daten/notizen.json`:
```json
[{"titel":"Planung KW17-MO","datum":"21.04.","ts":1745276400000,"text":"..."}]
```
`ts` ist Unix-Millisekunden (UTC), wird von `plan_next_day.ps1` gesetzt.

### Tab Sport
- Kuratierte Dauerliste aus `Wissen/sport.json`

### Tab Fuehrung / Tab Tech
- Flache Liste aus `Wissen/lernplan.json`
- Checkbox-Fortschritt in `Wissen/lernplan_progress.json`

### Tab Links
- `Wissen/links.json`: `[{"label":"...","url":"..."}]`

### Tab Wissen
- Hoebucher, Postmortem, Leistungsabfall
- Aufklappbar: Titel -> Zusammenfassung -> Kerngedanken

---

## 6. Kachel 3: Actions

- To-Do-Liste mit Faelligkeitsdatum aus `Daten/actions.json`
- Tabs: Offen / Erledigt
- Ueberfaellig: rot; Heute: gold

Format:
```json
[{"created":"21.04.","due":"21.04.2026","text":"...","done":false}]
```

---

## 7. Kachel 4: Mails

### Header
- Anzahl Mails diese Woche
- Letzter Sync / naechster Sync

### Prioritaetssystem

| Prio | Symbol | Bedeutung |
|---|---|---|
| `chef` | * | Von Vorgesetztem |
| `direct` | o | Nur ich in To |
| `action` | + | Ich + andere in To |
| `cc` | - | Nur CC |
| `fyi` | . | Nicht adressiert |
| `sent` | > | Gesendet |

### Wochenzusammenfassung
- "Zusammenfassen": exportiert Mails, dann `POST /run-summarize`
- Polling auf `Daten/summary_KW{n}.json`

---

## 8. Write-Server (`write-server.js`)

Node.js, `http://127.0.0.1:9001`.

**Wichtig:** PowerShell wird via `execFile` (nicht `spawn`) gestartet mit absolutem Pfad (`POWERSHELL`-Konstante aus `process.env.SystemRoot`). `spawn` mit `detached` funktioniert nicht zuverlaessig auf Corporate Windows.

### Endpoints

| Method | Path | Aktion |
|---|---|---|
| GET | `/ping` | Healthcheck -> `ok` |
| POST | `/modal-lock?state=1\|0` | `C:\Temp\myapp-modal.lock` schreiben/loeschen |
| POST | `/run-export-mails` | Spawnt `export_outlook_mails.ps1` via spawn+detached |
| POST | `/run-summarize` | Spawnt `summarize_mails.ps1` via spawn+detached |
| POST | `/run-plan-next-day` | Startet `plan_next_day.ps1` via execFile (wartet auf Abschluss) |
| PUT | `/{dateiname}` | Schreibt Datei (Allowlist) |

### PUT-Allowlist

| Dateiname | Zielordner |
|---|---|
| `actions.json` | `Daten/` |
| `notizen.json` | `Daten/` |
| `learn.txt` | `Daten/` |
| `termine.txt` | `Daten/` |
| `links.json` | `Wissen/` |
| `lernplan_progress.json` | `Wissen/` |
| `sport.json` | `Wissen/` |

---

## 9. PowerShell-Datenpipeline

### 9.1 `secrets.ps1` (nicht committet)

Enthaelt: `$ApiKey`, `$ProxyUri`, `$MyAddresses`, `$MyDisplayNames`, `$ChefName`, `$ChefEmail`, `$ExcludeSenders`, `$Mitarbeiter`.

**Niemals** Namen, E-Mail-Adressen oder API-Keys in committeten Skripten.

### 9.2 `export_outlook_today.ps1`
- Exportiert heute und morgen je als `Daten/termine_YYYYMMDD.ics`
- Free (`BusyStatus=0`) -> `TRANSP:TRANSPARENT`
- Tentativ (`BusyStatus=1`) -> `X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE`
- Optional -> `X-MYAPP-ROLE:OPT-PARTICIPANT`

### 9.3 `export_outlook_mails.ps1`
- Exportiert Inbox + Gesendete: aktueller Montag bis heute
- Schreibt `Daten/mails_heute.json`, `Daten/mail_sync_status.json`, `Daten/config.json`
- Timestamp via `[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()`

### 9.4 `export_sync_prep.ps1`
- Prueft Kalender morgen auf 1:1-Syncs
- Schreibt `Daten/KW{n}-{Vorname}.json` und `Daten/sync_files.json`

### 9.5 `summarize_mails.ps1`
- Liest `Daten/mails_heute.json`, sendet an Claude API
- Schreibt `Daten/summary_KW{n}.json`: `{"summary":"...","ts":<Unix-ms>}`

### 9.6 `plan_next_day.ps1`
- Taeglich 18:00 und on-demand via `POST /run-plan-next-day`
- Bestimmt naechsten Werktag (ueberspringt Sa/So)
- Liest ICS des naechsten Tages + heutige relevante Mails (`prio != fyi`)
- Sendet an Claude API -> bewertet wie gut morgen geplant ist (Assistent-Perspektive)
- Schreibt als `Planung KWxx-TT` in `Daten/notizen.json` (neueste oben, gleicher Titel wird ersetzt)
- Notiz enthaelt `ts`-Feld (Unix-ms) fuer Polling-Erkennung im Dashboard
- Ueberspringt wenn `C:\Temp\myapp-modal.lock` existiert
- Wird via `execFile` gestartet (nicht spawn) -- wichtig fuer Corporate Windows

**Prompt-Konzept:** Assistent bewertet den Tag, kein Tagesplaner.
Format: Emoji + Doppelpunkt + ein Satz, max 5 Zeilen, max 120 Woerter, kein Markdown-Fettdruck.
Themen: Taktdichte, Vorbereitung, Mittagspause, was gut ist, offene Auftraege.

### 9.7 `setup.ps1`
Einmaliges Setup -- kann beliebig oft ausgefuehrt werden (idempotent):
1. Prueft Node.js, npx, `secrets.ps1`, `Daten/`, `Wissen/`, `C:\Temp`
2. Registriert alle 7 Tasks via `schtasks /create /it /ru %USERNAME% /f`
3. Startet write-server sofort via `Start-Process`

**Hinweis:** `schtasks /tr` erfordert escaped Quotes bei Pfaden mit Leerzeichen. Hilfsfunktion `New-TR` baut korrekte `\"...\"`-Strings.

| Task | Zeitplan |
|---|---|
| MyApp Write Server | bei Anmeldung |
| MyApp Mail Export | 07:30 taeglich |
| MyApp Mail Export 1230 | 12:30 taeglich |
| MyApp Sync Prep | 17:00 taeglich |
| MyApp Kalender Export | 06:00 taeglich |
| MyApp Kalender Export 1200 | 12:00 taeglich |
| MyApp Tagesplanung | 18:00 taeglich |

---

## 10. Refresh-Logik

| Was | Intervall | Trigger |
|---|---|---|
| Uhr + SimpleBar | 60 Sek. | `setInterval` |
| ICS nachladen | 15 Min. | `setInterval` |
| Mails nachladen | 5 Min. | nur wenn kein Mail-Body offen |
| Mail-Export | 07:30 + 12:30 | Task Scheduler |
| Mail-Export on-demand | App-Start + Zusammenfassen-Button | `POST /run-export-mails` |
| Planung on-demand | Button "Planung" | `POST /run-plan-next-day` |
| Tagesplanung automatisch | 18:00 | Task Scheduler |

---

## 11. Daten-Persistenz und `.gitignore`

**Nicht committet:** `secrets.ps1`, `Daten/`, `Wissen/`

**Committet:** `index.html`, `style.css`, `script.js`, `write-server.js`, alle `.ps1` ausser `secrets.ps1`, `restart-writeserver.bat`, `PROJEKT_DOKUMENTATION.md`

---

## 12. Modals

| Modal | Zweck |
|---|---|
| `modal-action` | Action erfassen / bearbeiten |
| `modal-notiz` | Notiz erfassen / bearbeiten |
| `modal-link` | Bookmark hinzufuegen |
| `modal-sync` | Sync-Mails anzeigen (read-only) |

Modals setzen `C:\Temp\myapp-modal.lock` via write-server.

---

## 13. Sicherheits- und Datenschutz-Anforderungen

- Niemals API-Keys, E-Mail-Adressen oder Personennamen in committeten Dateien
- Alle Secrets ausschliesslich in `secrets.ps1`
- Write-Server: Allowlist fuer PUT, lauscht nur auf `127.0.0.1`
- Namen in UI: immer via `shortName()` -- zeigt nur Vorname + erster Buchstabe Nachname

---

## 14. Einrichtung (einmalig)

### Voraussetzungen
1. Node.js installieren
2. `npm install -g live-server`
3. `secrets.ps1` anlegen
4. Outlook muss offen sein wenn PS-Skripte laufen

### Setup ausfuehren
```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\D025095\myapp\myapp\setup.ps1
```

### Dashboard taeglich starten
```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\D025095\myapp\myapp\start-servers.ps1
```
Dann Browser: `http://127.0.0.1:5500`

---

## 15. Bekannte Designentscheidungen und Fallstricke

- **execFile statt spawn fuer plan_next_day**: `spawn` mit `detached:true` funktioniert auf Corporate Windows nicht -- Output kommt nicht an, Script laeuft nicht durch. `execFile` loest das Problem.
- **PowerShell -- NUR ASCII**: Keine Em-Dashes, Umlaute oder Nicht-ASCII in PS-Skripten -- auch nicht in Kommentaren. Verursacht silent Parser-Fehler wenn PS non-interaktiv via Node.js gestartet wird.
- **CRLF in PS-Skripten**: PS-Skripte muessen Windows-Zeilenenden (CRLF) haben. Mit `unix2dos` konvertieren nach dem Schreiben via Claude-Tools.
- **POWERSHELL-Konstante**: Absoluter Pfad `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` statt `powershell.exe` -- PATH fuer Node-Prozesse auf Corporate Windows kann eingeschraenkt sein.
- **Outlook COM**: Benoetigt laufendes Outlook + interaktive Session. Tasks mit `schtasks /it` registrieren.
- **schtasks /tr Quoting**: Bei Pfaden mit Leerzeichen muessen innere Anfuehrungszeichen escaped werden. `New-TR`-Hilfsfunktion in `setup.ps1`.
- **Register-ScheduledTask blockiert**: Corporate GPO verhindert den PS-Cmdlet fuer normale User -> `schtasks.exe /create` als Alternative.
- **UTC-Timestamp**: `[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()` verwenden. JS-Seite: `timeZone: 'Europe/Berlin'` in `toLocaleTimeString` explizit setzen.
- **modal.lock in `C:\Temp\`**: Nicht in `Daten/` -- live-server wuerde sonst Seite neu laden.
- **UTF-8 ohne BOM**: `New-Object System.Text.UTF8Encoding $false` fuer alle JSON-Schreibvorgaenge.
- **Planung-Polling**: Prueft `n.ts >= triggeredAt` -- nicht nur ob Notiz existiert, sondern ob sie nach dem Button-Klick geschrieben wurde. Doppelklick-Schutz via `planPolling`-Flag. Intervall 8 Sekunden.
- **Multi-Trigger via schtasks**: `schtasks` unterstuetzt nur einen Trigger pro Task -> Mail Export und Kalender Export jeweils als zwei separate Tasks.
- **$pid reserviert**: `$pid` ist eine reservierte PS-Variable (Prozess-ID). Als Loop-Variable `$procId` verwenden.
- **expertMode-Default**: `localStorage.getItem('expertMode') !== '0'` -- Default ist Expertenmodus, nur explizites `'0'` schaltet auf Grundmodus.
- **fokusTab in localStorage**: Aktiver Fokus-Tab wird in `localStorage` gespeichert -- bleibt nach Reload erhalten. Zeitplan-Default greift nur beim ersten Besuch.
- **shortName fuer alle Personennamen**: Ueberall in der UI `shortName()` verwenden -- gibt `Vorname N.` zurueck. Gilt auch fuer Sync-Modal-Titel.
