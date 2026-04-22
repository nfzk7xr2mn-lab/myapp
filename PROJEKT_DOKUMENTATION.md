# Dein Tag. Deine Richtung. Deine Entscheidungen. - Projektdokumentation

Vollstaendige Anforderungs- und Implementierungsbeschreibung. Stand: 22. April 2026.

---

## 1. Ueberblick

Ein persoenliches **Browser-Dashboard** als lokale Web-App (kein Framework, kein Build-Step), das auf einem Windows-PC laeuft und folgende Informationen zeigt:

- **Grundmodus** (Standard): Ein kompakter Balken mit Uhrzeit, aktuellem Termin, Mail-Status und Tagesphase
- **Expertenmodus**: Vollansicht mit 4 Kacheln (Kalender, Fokus, Actions, Mails) -- Umschalten mit Taste `E`

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
+-- export_outlook_today.ps1     # Exportiert Kalendertermine heute+morgen als ICS -> data/
+-- export_outlook_mails.ps1     # Exportiert Mails der Woche als JSON -> data/
+-- export_sync_prep.ps1         # Prueft morgige Syncs, exportiert 2-Wochen-Mails pro Person
+-- summarize_mails.ps1          # KI-Zusammenfassung via Claude API -> data/summary_KW{n}.json
+-- plan_week.ps1            # KI-Tagesbewertung taeglich 18:00 -> data/notes.json
+-- secrets.ps1                  # API-Keys, E-Mail-Adressen, Namen (NICHT committet)
+-- .gitignore
|
+-- data/                       # Generierte Arbeitsdaten - nicht committet
|   +-- config.json              # {myAddresses} auto-generiert von export_outlook_mails.ps1
|   +-- notes.json             # Schnellnotizen + KI-Planungsnotizen [{titel,datum,ts,text}]
|   +-- actions.json             # Action Items [{created,due,text,done}]
|   +-- calendar_YYYYMMDD.ics     # Kalenderexport des jeweiligen Tages (heute + morgen)
|   +-- mails_today.json         # Mails der laufenden Woche (empfangen + gesendet)
|   +-- mail_sync_status.json    # {ts, count} letzter Mail-Export
|   +-- sync_files.json          # [{name, file, date}] Sync-Termine morgen
|   +-- KW{n}-{Vorname}.json     # 2-Wochen-Mails pro Sync-Person
|   +-- summary_KW{n}.json       # KI-Wochenzusammenfassung {summary, ts}
|   +-- contacts.json             # Kontaktliste [{name,rolle,first,last,mailFreq,meetFreq,freq,_weekId}]
|   +-- logo.png                  # Logo (Originalgroesse)
|   +-- logo_small.png            # Logo klein (Favicon + Expertenmodus-Header)
|   +-- export_mail.log          # Protokoll der Mail-Exportlaeufe
|
+-- knowledge/                      # Kuratierte Inhaltsdaten - nicht committet
    +-- audiobooks.json           # Hoerbuch-Eintraege mit Kerngedanken
    +-- survivors.json            # Postmortem-Checkliste
    +-- performance.json          # Wissen zu Leistungsabfall
    +-- links.json               # Bookmark-Links [{label, url}]
    +-- learningplan.json            # 6-Wochen-Lernplan (Tech + Fuehrung, 42 Tage)
    +-- learningplan_progress.json   # Fortschritt {"1": true, ...}
    +-- sport.json               # Sportlinks (kuratierte Dauerliste)
```

---

## 3. Layout und Design

### 3.1 Modi: Grundmodus und Expertenmodus

Das Dashboard hat zwei Modi, umschaltbar per Taste `E` oder Button oben rechts. Der Modus wird in `localStorage` gespeichert. Standard: Grundmodus (`expertMode = localStorage.getItem('expertMode') === '1'`).

Das Dashboard laeuft im **Chrome App-Modus** (`--app` Flag), was echtes Fenster-Resize via JavaScript erlaubt. `start-servers.ps1` oeffnet Chrome automatisch.

#### Grundmodus (`mode-simple`)

Schmaler Balken am unteren Bildschirmrand (64px hoch, volle Breite):
```
[HH:MM]  [Wochentag, Datum]  [Phase]  |  [Kalender 2-zeilig] [⟳]  |  [✉ N]  [Badges]  [Modus-Button]
```
- `#header` und `#tiles` sind ausgeblendet
- Fenster wird auf 64px Hoehe verkleinert und am unteren Bildschirmrand positioniert (`window.resizeTo` + `window.moveTo`)
- **Kalender-Block** (`#sb-cal`): Zweizeiliges Spalten-Layout (flexbox column). Zeile 1 (`.sb-line1`): Uhrzeit vorne, laufender oder naechster Termin. Zeile 2 (`.sb-line2`, kleiner/gedimmt): naechster Termin und/oder Frei-Status. Beispiel: Zeile 1 "bis 18:00 Teammeeting", Zeile 2 "ab 19:10 Tanzen, frei ab 20:00". Laufender Termin gold (`.sb-current`), naechster gedimmt (`.sb-next`). Frei-Status (`.sb-free-tag`): "jetzt frei" wenn kein Termin laeuft, sonst "frei ab HH:MM". Aufeinanderfolgende Termine (Luecke <= 5 Min.) gelten als durchgehend belegt. `max-width: 55%`. Daneben ein `⟳`-Button (`#btn-refresh-cal`) zum manuellen Neuladen der ICS-Dateien (ruft `loadICSAuto()` auf, Dreh-Animation als Feedback).
- **Mails** (`#sb-mail`): Anzahl heutiger empfangener Mails (nur Zahl, kein Absender/Betreff). `min-width: 120px` garantiert Sichtbarkeit.
- **Badges** (`#sb-badges`): Kompakte Zaehler rechts neben der Mail-Sektion. Zeigt Anzahl unbeantworteter Direkt-/Chef-Mails (gold Pill) und offene Actions (gruen Pill). Berechnung: Direkt-Mail gilt als beantwortet wenn eine gesendete Mail an denselben Absender existiert (gleicher oder spaeterer Tag).
- Aktualisiert sich jede Minute

#### Expertenmodus (`mode-expert`)

Volle 4-Kachel-Ansicht. `#simple-bar` ist ausgeblendet. Fenster wird auf Working-Area-Groesse (`screen.availWidth x screen.availHeight`) erweitert und oben links positioniert. Im Header rechts: Server-Status-Dot + Modus-Wechsel-Button (`#btn-mode-toggle-expert`, Klasse `.btn-mode`) zum Zurueckschalten in den Grundmodus.

#### Implementierung

| Funktion | Zweck |
|---|---|
| `applyMode(expert)` | Setzt `body.className`, speichert in `localStorage`, ruft `renderSimpleBar()` auf, resized Fenster |
| `renderSimpleBar()` | Befuellt `#sb-clock`, `#sb-date`, `#sb-phase`, `#sb-cal` (inkl. Frei-Status), `#sb-mail`, `#sb-badges` |
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

Kleiner Kreis im Expertenmodus-Header (`#server-status`). Prueft alle 5 Minuten `GET /ping`:
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

### ICS-Datei: `data/calendar_YYYYMMDD.ics`
- Erzeugt von `export_outlook_today.ps1`
- Wird beim Start und alle 30 Minuten automatisch geladen (`loadICSAuto`)

### ICS-Parser (`parseICS(text, forDate)`)
- Liest `DTSTART`, `DTEND`, `SUMMARY`, `TRANSP`, `X-MICROSOFT-CDO-BUSYSTATUS`, `X-MYAPP-ROLE`
- `TRANSP:TRANSPARENT` -> wird nicht angezeigt (Free-Termine)
- `VALUE=DATE` ohne `T` -> Ganztag (`allDay: true`)
- UTC mit `Z`-Suffix -> korrekt in Lokalzeit umgerechnet

### Sync-Vorbereitung
- `data/sync_files.json` wird beim Start geladen
- Klick auf Termin-Link oeffnet `#modal-sync` mit Mailliste
- Titel im Modal: `shortName(name)` -- zeigt nur Vorname + erster Buchstabe Nachname

---

## 5. Kachel 2: Fokus (7 Tabs)

### Default-Tab
- Wird in `localStorage` gespeichert (`fokusTab`) -- bleibt nach Reload erhalten
- Erster Besuch ohne gespeicherten Wert: vor 8 Uhr -> Sport, 8-17 Uhr -> Notizen, ab 17 Uhr -> Wissen

### Tab Notizen
- Schnellnotizen aus `data/notes.json`
- Aufklappbar via `<details>`, neueste oben
- Emoji-Zeilen in Gold (`--gold`), Leerzeile vor jeder Emoji-Zeile (ab 2. Zeile); Rest gedimmt
- **`+ Notiz`-Button** oeffnet Modal
- **`Planung`-Button** loest `plan_week.ps1` on-demand aus:
  - POST `/run-plan-week` -> write-server startet PS-Skript via `execFile`
  - Polling alle 8 Sekunden auf `data/notes.json` bis Eintrag mit `titel.startsWith('Planung KW')` und `ts >= triggeredAt` (max. 5 Min.)
  - Doppelklick-Schutz via `planPolling`-Flag

Dateiformat `data/notes.json`:
```json
[{"titel":"Planung KW17-MO","datum":"21.04.","ts":1745276400000,"text":"..."}]
```
`ts` ist Unix-Millisekunden (UTC), wird von `plan_week.ps1` gesetzt.

### Tab Sport
- Kuratierte Dauerliste aus `knowledge/sport.json`

### Tab Fuehrung / Tab Tech
- Flache Liste aus `knowledge/learningplan.json`
- Checkbox-Fortschritt in `knowledge/learningplan_progress.json`

### Tab Links
- `knowledge/links.json`: `[{"label":"...","url":"..."}]`

### Tab Wissen
- Hoebucher, Postmortem, Leistungsabfall
- Aufklappbar: Titel -> Zusammenfassung -> Kerngedanken

### Tab Netzwerk
- Automatisch generierte Kontaktliste aus E-Mail-Korrespondenz und Kalendereintraegen
- Sortiert nach Interaktionshaeufigkeit (`freq` = `mailFreq + meetFreq`), umschaltbar auf alphabetisch (A-Z)
- Pro Kontakt: Name (shortName-Format), editierbare Rolle/Notizen, Frequenz-Badge, Datumsspanne
- Klick oeffnet `#modal-netzwerk` zum Bearbeiten der Rolle
- Sortier-Toggle (`Haeufigkeit` / `A-Z` / `Abteilung`) ueber der Liste, Auswahl in `localStorage` gespeichert
- **Suchfeld**: Echtzeit-Filter ueber der Sortierleiste, filtert nach Name und Rolle. Suchtext und Cursor-Position bleiben beim Re-Render erhalten.
- **Manuelles Hinzufuegen**: `+ Kontakt`-Button im Footer oeffnet `#modal-add-contact`. Eingegebener Name wird via `toShortName()` (JS-Pendant zu PowerShells `ConvertTo-ShortName`) in ShortName-Format konvertiert. Duplikat-Pruefung per Name.
- Daten: `data/contacts.json`

Dateiformat `data/contacts.json`:
```json
[{"name":"Daniel K.","rolle":"Tech Lead","first":"13.01.","last":"22.04.","mailFreq":12,"meetFreq":8,"freq":20,"_weekId":"2026-W17"}]
```
- `name`: shortName-Format (Vorname + 1. Buchstabe Nachname), KEIN voller Nachname
- `rolle`: Freitext, user-editierbar im Dashboard
- `mailFreq`/`meetFreq`: Separate Zaehler fuer Mail-Korrespondenz und Meeting-Beteiligungen
- `freq`: Summe, Sortierkriterium
- `_weekId`: Interne Wochenkennung fuer korrekte Akkumulation (verhindert Doppelzaehlung)

Kontakt-Extraktion (in `export_outlook_mails.ps1`):
- Empfangene Mails: Absender-Name -> shortName -> mailFreq++
- Gesendete Mails: Empfaenger (`;`-getrennt) -> je shortName -> mailFreq++
- Kalender: ATTENDEE CN-Werte aus `data/calendar_*.ics` der Woche -> meetFreq++
- Self-Filter: Eigene Namen ($MyDisplayNames) werden uebersprungen
- DL/SAP/Cloud/External-Filter: Namen die mit "DL ", "SAP " oder "Cloud " beginnen, "(external" enthalten, oder `_`/Ziffern enthalten werden uebersprungen
- Department-Lookup: Wenn `rolle` leer ist oder nur "Mitarbeiter", wird die Abteilung aus Outlook (Exchange `Resolve-Contact` -> `GetExchangeUser().Department`) automatisch ergaenzt. Ergebnis wird gecacht (`$deptCache`). Volle Namen werden nur im Speicher gehalten, nie in `contacts.json` persistiert.
- Merge: `rolle` wird nie ueberschrieben, Frequenzen werden pro Woche akkumuliert. Direkt vor dem Schreiben wird `contacts.json` nochmals gelesen -- nur Rollen die sich seit dem initialen Read geaendert haben (= User-Edits waehrend des Exports) werden uebernommen.

---

## 6. Kachel 3: Actions

- To-Do-Liste mit Faelligkeitsdatum aus `data/actions.json`
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
- Polling auf `data/summary_KW{n}.json`

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
| POST | `/run-export-calendar` | Spawnt `export_outlook_today.ps1` via spawn+detached |
| POST | `/run-plan-week` | Startet `plan_week.ps1` via execFile (wartet auf Abschluss, Timeout 8 Min.) |
| PUT | `/{dateiname}` | Schreibt Datei (Allowlist) |

### PUT-Allowlist

| Dateiname | Zielordner |
|---|---|
| `actions.json` | `data/` |
| `notes.json` | `data/` |
| `learn.txt` | `data/` |
| `termine.txt` | `data/` |
| `links.json` | `knowledge/` |
| `learningplan_progress.json` | `knowledge/` |
| `sport.json` | `knowledge/` |
| `contacts.json` | `data/` |

---

## 9. PowerShell-Datenpipeline

### 9.1 `secrets.ps1` (nicht committet)

Enthaelt: `$ApiKey`, `$ProxyUri`, `$MyAddresses`, `$MyDisplayNames`, `$ChefName`, `$ChefEmail`, `$ExcludeSenders`, `$Mitarbeiter`.

**Niemals** Namen, E-Mail-Adressen oder API-Keys in committeten Skripten.

### 9.2 `export_outlook_today.ps1`
- Exportiert heute und morgen je als `data/calendar_YYYYMMDD.ics`
- Free (`BusyStatus=0`) -> `TRANSP:TRANSPARENT`
- Tentativ (`BusyStatus=1`) -> `X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE`
- Optional -> `X-MYAPP-ROLE:OPT-PARTICIPANT`
- Meeting-Teilnehmer als `ATTENDEE;CN=Name:MAILTO:unknown` Zeilen (fuer Netzwerk-Kontaktextraktion)

### 9.3 `export_outlook_mails.ps1`
- Exportiert Inbox + Gesendete: aktueller Montag bis heute
- Schreibt `data/mails_today.json`, `data/mail_sync_status.json`, `data/config.json`
- Extrahiert Kontakte aus Mails + Kalender-ICS-Dateien -> `data/contacts.json`
- Timestamp via `[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()`

### 9.4 `export_sync_prep.ps1`
- Prueft Kalender morgen auf 1:1-Syncs
- Schreibt `data/KW{n}-{Vorname}.json` und `data/sync_files.json`

### 9.5 `summarize_mails.ps1`
- Liest `data/mails_today.json`, sendet an Claude API
- Schreibt `data/summary_KW{n}.json`: `{"summary":"...","ts":<Unix-ms>}`

### 9.6 `plan_week.ps1`
- Taeglich 18:00 und on-demand via `POST /run-plan-week`
- Bewertet alle 5 Wochentage (MO-FR) der aktuellen Woche, je als eigene Notiz
- Pro Tag: Liest ICS des Tages + Mails die VOR diesem Tag eingegangen sind (Wissen vom Vorabend)
- 5 separate API-Calls (ein Call pro Tag), Mails werden einmal geladen, pro Tag nach Datum gefiltert
- Sendet an Claude API -> bewertet wie gut der Tag geplant ist (Assistent-Perspektive)
- Schreibt als `Planung KWxx-MO`, `-DI`, `-MI`, `-DO`, `-FR` in `data/notes.json` (gleicher Titel wird ersetzt)
- Alle Notizen bekommen denselben `ts`-Wert (Unix-ms) fuer Polling-Erkennung im Dashboard
- `notes.json` wird einmal am Ende geschrieben (nicht 5x)
- Ueberspringt wenn `C:\Temp\myapp-modal.lock` existiert
- Wird via `execFile` gestartet (nicht spawn) -- wichtig fuer Corporate Windows
- Polling-Timeout im Dashboard: 8 Minuten (5 API-Calls koennen 30-50 Sek. dauern)

**Prompt-Konzept:** Assistent bewertet den Tag, kein Tagesplaner.
Format: Emoji + Doppelpunkt + ein Satz, max 5 Zeilen, max 120 Woerter, kein Markdown-Fettdruck.
Themen: Taktdichte, Vorbereitung, Mittagspause, was gut ist, offene Auftraege.

### 9.7 `setup.ps1`
Einmaliges Setup -- kann beliebig oft ausgefuehrt werden (idempotent):
1. Prueft Node.js, npx, `secrets.ps1`, `data/`, `knowledge/`, `C:\Temp`
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
| Server-Health-Check | 5 Min. | `setInterval(checkServerStatus)` |
| ICS nachladen | 30 Min. | `setInterval(loadICSAuto)` |
| Mails nachladen | 30 Min. | nur wenn kein Mail-Body offen |
| Mail-Export (PS) | 07:30 + 12:30 | Task Scheduler |
| Mail-Export on-demand | App-Start (nur 07-13 Uhr) + Zusammenfassen-Button | `POST /run-export-mails` |
| Planung on-demand | Button "Planung" | `POST /run-plan-week` |
| Tagesplanung automatisch | 18:00 | Task Scheduler |

**Drosselung (seit 22.04.2026):** Alle periodischen Intervalle wurden reduziert, um haeufiges Starten von PS-Prozessen zu vermeiden. Der Mail-Export beim App-Start wird nur noch zwischen 07:00 und 12:59 Uhr getriggert.

---

## 11. Daten-Persistenz und `.gitignore`

**Nicht committet:** `secrets.ps1`, `data/`, `knowledge/`

**Committet:** `index.html`, `style.css`, `script.js`, `write-server.js`, alle `.ps1` ausser `secrets.ps1`, `restart-writeserver.bat`, `PROJEKT_DOKUMENTATION.md`

---

## 12. Modals

| Modal | Zweck |
|---|---|
| `modal-action` | Action erfassen / bearbeiten |
| `modal-notiz` | Notiz erfassen / bearbeiten |
| `modal-link` | Bookmark hinzufuegen |
| `modal-sync` | Sync-Mails anzeigen (read-only) |
| `modal-netzwerk` | Kontakt-Rolle bearbeiten |
| `modal-add-contact` | Neuen Kontakt manuell anlegen |

Modals setzen `C:\Temp\myapp-modal.lock` via write-server.

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
5. Google Chrome muss installiert sein (fuer App-Modus mit Fenster-Resize)

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

- **execFile statt spawn fuer plan_week**: `spawn` mit `detached:true` funktioniert auf Corporate Windows nicht -- Output kommt nicht an, Script laeuft nicht durch. `execFile` loest das Problem.
- **PowerShell -- NUR ASCII**: Keine Em-Dashes, Umlaute oder Nicht-ASCII in PS-Skripten -- auch nicht in Kommentaren. Verursacht silent Parser-Fehler wenn PS non-interaktiv via Node.js gestartet wird.
- **CRLF in PS-Skripten**: PS-Skripte muessen Windows-Zeilenenden (CRLF) haben. Mit `unix2dos` konvertieren nach dem Schreiben via Claude-Tools.
- **POWERSHELL-Konstante**: Absoluter Pfad `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` statt `powershell.exe` -- PATH fuer Node-Prozesse auf Corporate Windows kann eingeschraenkt sein.
- **Outlook COM**: Benoetigt laufendes Outlook + interaktive Session. Tasks mit `schtasks /it` registrieren.
- **schtasks /tr Quoting**: Bei Pfaden mit Leerzeichen muessen innere Anfuehrungszeichen escaped werden. `New-TR`-Hilfsfunktion in `setup.ps1`.
- **Register-ScheduledTask blockiert**: Corporate GPO verhindert den PS-Cmdlet fuer normale User -> `schtasks.exe /create` als Alternative.
- **UTC-Timestamp**: `[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()` verwenden. JS-Seite: `timeZone: 'Europe/Berlin'` in `toLocaleTimeString` explizit setzen.
- **modal.lock in `C:\Temp\`**: Nicht in `data/` -- live-server wuerde sonst Seite neu laden.
- **UTF-8 ohne BOM**: `New-Object System.Text.UTF8Encoding $false` fuer alle JSON-Schreibvorgaenge.
- **Planung-Polling**: Prueft `n.ts >= triggeredAt` -- nicht nur ob Notiz existiert, sondern ob sie nach dem Button-Klick geschrieben wurde. Doppelklick-Schutz via `planPolling`-Flag. Intervall 8 Sekunden.
- **Multi-Trigger via schtasks**: `schtasks` unterstuetzt nur einen Trigger pro Task -> Mail Export und Kalender Export jeweils als zwei separate Tasks.
- **$pid reserviert**: `$pid` ist eine reservierte PS-Variable (Prozess-ID). Als Loop-Variable `$procId` verwenden.
- **expertMode-Default**: `localStorage.getItem('expertMode') === '1'` -- Default ist Grundmodus, nur explizites `'1'` schaltet auf Expertenmodus. Erster Besuch startet im kompakten Grundmodus (SimpleBar).
- **fokusTab in localStorage**: Aktiver Fokus-Tab wird in `localStorage` gespeichert -- bleibt nach Reload erhalten. Zeitplan-Default greift nur beim ersten Besuch.
- **shortName fuer alle Personennamen**: Ueberall in der UI `shortName()` verwenden -- gibt `Vorname N.` zurueck. Gilt auch fuer Sync-Modal-Titel.
- **Refresh-Drosselung**: Server-Health-Check 5 Min. (nicht 30 Sek.), Mails 30 Min. (nicht 5 Min.), ICS 30 Min. (nicht 15 Min.), Mail-Export bei App-Start nur 07-13 Uhr. Reduziert PS-Prozessstarts drastisch.
- **debug-check.js**: Wird in `index.html` referenziert (`<script src="debug-check.js">`), Datei existiert aber nicht. Verursacht einen 404 beim Laden, ist aber nicht funktionskritisch.
- **live-server --ignore**: `data,knowledge` werden vom Watch ausgeschlossen, damit PS-Schreibvorgaenge kein Browser-Reload ausloesen.
- **restart-writeserver.bat**: Killt alle `node.exe`-Prozesse und startet beide Server neu. Vorsicht: killt auch andere Node-Prozesse. Besser `start-servers.ps1` verwenden (killt nur Ports 5500+9001).

---

## 16. Editorconfig und VS Code

`.editorconfig`:
- Alle Dateien: UTF-8, LF-Zeilenenden, Trailing Whitespace trimmen
- PS-Skripte: 4 Spaces Einrueckung

`.vscode/settings.json`:
- `liveServer.settings.port: 5501` (weicht vom Standard 5500 ab -- `start-servers.ps1` startet auf 5500 via `npx live-server`)

---

## 17. Aenderungshistorie

| Datum | Aenderung |
|---|---|
| 22.04.2026 | Refresh-Intervalle reduziert: Health-Check 30s->5min, Mails 5min->30min, ICS 15min->30min. Mail-Export bei App-Start nur 07-13 Uhr. |
| 22.04.2026 | Default-Modus auf Grundmodus (SimpleBar) umgestellt. Vorher war Expertenmodus Standard. |
| 22.04.2026 | Bug: SimpleBar zeigte aelteste statt neueste Mail. Fix: `todayMails[0]` statt `todayMails[length-1]`. |
| 22.04.2026 | Chrome App-Modus: `start-servers.ps1` oeffnet Chrome mit `--app` Flag. Grundmodus = schmaler 64px-Balken am unteren Bildschirmrand, Expertenmodus = Vollbild. Fenster-Resize via `window.resizeTo`/`window.moveTo` in `applyMode()`. |
| 22.04.2026 | Modus-Wechsel-Button im Expertenmodus-Header (`#btn-mode-toggle-expert`). Erlaubt Zurueckschalten in Grundmodus ohne Tastatur. |
| 22.04.2026 | Frei-Status-Anzeige (`#sb-free`) in SimpleBar: zeigt "jetzt frei" oder "frei ab HH:MM" basierend auf Kalendertermin-Analyse. Aufeinanderfolgende Termine (Luecke <= 5 Min.) werden als durchgehend belegt behandelt. |
| 22.04.2026 | Naechster Termin wird im Grundmodus zusaetzlich zum laufenden Termin angezeigt. |
| 22.04.2026 | Frei-Status bugfix: Tentative/optionale Termine blockieren jetzt korrekt den Frei-Status (konsistent mit Kalenderanzeige). |
| 22.04.2026 | SimpleBar: Einheitliche Schriftgroesse 0.75rem (war vorher 0.62-0.78rem gemischt). Kalender-Block mit `flex-wrap` und `max-width: 50%`. Phase-Badge im Expertenmodus-Header absolut zentriert. |
| 22.04.2026 | Frei-Status in Kalender-Block integriert (war vorher separates `#sb-free`-Element). Spart Platz fuer Mail-Sektion. |
| 22.04.2026 | Kalender-Block im Grundmodus auf Fliesstext umgestellt: "Termin bis HH:MM, danach Termin2 ab HH:MM, frei ab HH:MM" statt Pipe-Trennzeichen. |
| 22.04.2026 | Kalender-Block im Grundmodus auf zweizeiliges Layout umgestellt: Zeile 1 = laufender Termin mit Endzeit, Zeile 2 = naechster Termin + Frei-Status. Uhrzeit jeweils am Anfang der Zeile. `flex-direction: column` mit `sb-line1`/`sb-line2` Spans. |
| 22.04.2026 | Badges in SimpleBar: Anzahl unbeantworteter Direkt-/Chef-Mails und offene Actions als kompakte Zaehler-Pills (`#sb-badges`). Gold fuer Mails, gruen fuer Actions. |
| 22.04.2026 | Mail-Sektion in SimpleBar vereinfacht: zeigt nur noch Anzahl (kein Absender/Betreff). Badges uebernehmen die Detail-Information. |
| 22.04.2026 | Kalender-Refresh-Button (`#btn-refresh-cal`) in SimpleBar: laedt ICS-Dateien manuell neu. Dreh-Animation als visuelles Feedback. |
| 22.04.2026 | Planung auf ganze Woche umgestellt: `plan_week.ps1` bewertet jetzt alle 5 Wochentage (MO-FR) mit je eigenem API-Call. Notizen als "Planung KW{n}-MO" bis "-FR". Polling-Timeout 5min -> 8min. |
| 22.04.2026 | Konsistenz-Rename: Alle Datei-/Ordnernamen auf Englisch vereinheitlicht. `Daten/` -> `data/`, `Wissen/` -> `knowledge/`, `mails_heute.json` -> `mails_today.json`, `notizen.json` -> `notes.json`, `termine_*.ics` -> `calendar_*.ics`, `lernplan*.json` -> `learningplan*.json`, Knowledge-JSONs umbenannt. CSS-Klassen `.lernplan-*` -> `.learningplan-*`. |
| 22.04.2026 | Mail-Datumsfilter in `plan_week.ps1`: Jeder Tag bekommt nur Mails, die VOR diesem Tag eingegangen sind (Wissen vom Vorabend). MO bekommt keine Wochenmails, FR bekommt alle. Prompt weist KI explizit auf Zeitkontext hin. |
| 22.04.2026 | Logo (`logo_small.png`) als Favicon und im Expertenmodus-Header (32px, links neben Uhr). `logo.png` als Original. Titel und Tagline: "Dein Tag. Deine Richtung. Deine Entscheidungen." |
| 22.04.2026 | Notizen open-state: Aufgeklappte `<details>` bleiben beim Re-Render offen. Tracking per Notiz-Titel statt per Index, damit Aenderungen an der Liste (z.B. Planung-Polling) den Zustand nicht zuruecksetzen. |
| 22.04.2026 | Vergangene Planungsnotizen (Planung KW-Tag vor heute) werden ausgegraut (opacity 0.4, Klasse `.notiz-past`). |
| 22.04.2026 | Kachel-Titel umbenannt: Kalender -> Daten, Fokus -> Instruktionen, Actions -> Aktionen, Mails -> Korrespondenz. |
| 22.04.2026 | Netzwerk-Tab: Automatische Kontaktliste aus Mail-Korrespondenz und Kalender-Teilnehmern. ShortName-Format, editierbare Rolle, Frequenz-Sortierung. ATTENDEE-Export in ICS, Kontakt-Extraktion in export_outlook_mails.ps1, Frontend in script.js mit Modal-Editor. |
| 22.04.2026 | Netzwerk: ICS-Kontaktextraktion schliesst jetzt morgen ein (+1 Tag). Filter erweitert: "SAP "-Praefix wird wie "DL " gefiltert. |
| 22.04.2026 | Netzwerk-Bug: `editNetzwerk(idx)` verwendete Index des sortierten Arrays statt des Originals. Rolle landete beim falschen Kontakt. Fix: `contactsData.indexOf(c)` fuer korrekten Index. |
| 22.04.2026 | Netzwerk: Department-Auto-Population. Wenn `rolle` leer ist, wird die Abteilung via Outlook COM (`GetExchangeUser().Department`) automatisch gesetzt. `$fullNameMap` trackt Display-Namen fuer spaeteres Resolve. Ergebnis wird gecacht (`$deptCache`). |
| 22.04.2026 | Logo-Dateien (`logo.png`, `logo_small.png`) nach `data/` verschoben. Pfade in `index.html` angepasst. |
| 22.04.2026 | Netzwerk: Department-Lookup auf `Resolve-Contact` umgestellt. Loest auch ShortNames auf, ergaenzt "Mitarbeiter"-Rollen mit Abteilung. Volle Namen nur im Speicher, nie in `contacts.json`. |
| 22.04.2026 | Netzwerk: Sortierung umschaltbar (Haeufigkeit / A-Z). Toggle-Buttons ueber der Liste, Auswahl in `localStorage`. |
| 22.04.2026 | Netzwerk: "Cloud "-Praefix wird wie "DL "/"SAP " gefiltert (keine Personen-Kontakte). |
| 22.04.2026 | Netzwerk-Bug: `saveContactsFile()` ueberschrieb gesamte `contacts.json` mit veraltetem In-Memory-Stand. Rollen gingen verloren wenn PS-Export zwischenzeitlich lief. Fix: `saveContactRole()` liest Datei frisch, patcht nur die eine Rolle. |
| 22.04.2026 | Netzwerk: Race-Condition-Schutz im PS-Export. Vor dem Schreiben wird `contacts.json` nochmals gelesen. Rollen die sich seit dem initialen Read geaendert haben (User-Edits waehrend des Exports) werden uebernommen, Department-Lookups bleiben erhalten. |
| 22.04.2026 | Netzwerk: Dritte Sortierung "Abteilung" -- sortiert primaer nach Rolle (alphabetisch), sekundaer nach Frequenz absteigend. |
| 22.04.2026 | Netzwerk: Suchfilter -- Echtzeit-Suchfeld ueber Sortierleiste, filtert nach Name und Rolle. Cursor-Position bleibt beim Re-Render erhalten. |
| 22.04.2026 | Netzwerk: Manuelles Hinzufuegen von Kontakten -- `+ Kontakt`-Button im Footer, Modal mit Name + Rolle, `toShortName()` JS-Funktion (Pendant zu PowerShells `ConvertTo-ShortName`), Duplikat-Pruefung, read-modify-write Pattern. |
| 22.04.2026 | Netzwerk: "(external"-Filter in `ConvertTo-ShortName` (PS) und `toShortName` (JS) -- externe Dienstleister/Zeitarbeiter werden automatisch gefiltert. |
