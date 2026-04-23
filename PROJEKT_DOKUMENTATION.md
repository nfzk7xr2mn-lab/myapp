# Dein Tag. Deine Richtung. Deine Entscheidungen.

Projektdokumentation. Stand: 23. April 2026.

---

## 1. Ueberblick

Persoenliches **Browser-Dashboard** als lokale Web-App (kein Framework, kein Build-Step) auf Windows.

| Komponente | Technologie |
|---|---|
| Frontend | HTML / CSS / JavaScript (eine Seite, kein Framework) |
| Schreibserver | Node.js HTTP auf Port 9001 (`write-server.js`) |
| Entwicklungsserver | `npx live-server` auf Port 5500 |
| Datenpipeline | PowerShell-Skripte, getriggert via Task Scheduler + on-demand |
| Datenformate | `.ics` (Kalender), `.json` (alles andere) |
| Browser | Chrome App-Modus (`--app` Flag), Fenster-Resize via JS |

---

## 2. Verzeichnisstruktur

```
C:\Users\D025095\myapp\myapp\
+-- index.html / style.css / script.js   # Frontend (eine Seite)
+-- write-server.js                       # Node.js Schreibserver
+-- setup.ps1                             # Einmaliges Setup (Tasks, Shortcuts)
+-- start-servers.ps1 / start-dashboard.bat
+-- secrets.ps1.template                  # Vorlage (committet)
+-- secrets.ps1                           # API-Keys, Departments (NICHT committet)
+-- export_outlook_today.ps1              # Kalender -> data/calendar_*.ics
+-- export_outlook_mails.ps1              # Mails + Kontakte -> data/*.json
+-- export_sync_prep.ps1                  # Sync-Vorbereitung -> data/sync_files.json
+-- summarize_mails.ps1                   # KI-Zusammenfassung -> data/summary_KW*.json
+-- plan_week.ps1                         # KI-Tagesbewertung -> data/notes.json
+-- sync_jira.ps1                         # Jira-Items -> data/jira.json
+-- setup_jira.ps1                        # Jira OAuth-Setup (PKCE + Browser-Login)
+-- generate_quote.ps1                    # KI-Tageszitat -> knowledge/quotes.json
+-- generate_news.ps1                     # KI-Tagesnews -> knowledge/news.json
|
+-- data/                                 # Generiert, nicht committet
|   +-- config.json, notes.json, actions.json, contacts.json
|   +-- calendar_YYYYMMDD.ics, mails_today.json, mail_sync_status.json
|   +-- sync_files.json, KW{n}-{Name}.json, summary_KW{n}.json
|   +-- jira.json, jira_status.json
|   +-- logo_64.png, favicon-32.png, export_mail.log
|
+-- knowledge/                            # Kuratiert, nicht committet
    +-- audiobooks.json, survivors.json, performance.json
    +-- links.json, learningplan.json, learningplan_progress.json
    +-- sport.json, quotes.json, news.json, goals.json
```

---

## 3. Drei Modi

Umschaltbar per Taste `E` (zyklisch: Grund -> Experte -> Fokus) oder Button. Gespeichert in `localStorage` (`dashMode`). Standard: Grundmodus.

### Grundmodus

Schmaler Balken (56px) am unteren Bildschirmrand. Kein Emoji, nur Text.

```
[Uhr] [Datum] [Phase] | [Kalender 2-zeilig] [Reload] | [Badges] [Modus]
```

- **Kalender** (`#sb-cal`): Laufender Termin (gold) + naechster (gedimmt) + Frei-Status. Ab 17 Uhr: erster Termin des naechsten Tages mit Wochentag (z.B. "Donnerstag ab 09:00 ...") wenn heute keine Termine verbleiben. Ausgeblendet wenn komplett leer.
- **Badges** (`#sb-badges`): Vier Pill-Badges -- Termine (gold), Mails (gold), Aktionen (gruen), Jira (blau). Zahl + Label. Ausgeblendet bei 0.
- Einheitliche Schriftgroesse (0.70rem) im Kalender-Bereich, keine Emojis.
- Aktualisiert sich jede Minute.

### Expertenmodus

Volle 4-Kachel-Ansicht (Daten, Instruktionen, Aktionen, Mails). Keine Kachel-Emojis. Header mit Tageszitat (kursiv gold), Zitat-Refresh, Server-Status-Dot, Modus-Button.

### Fokusmodus

Zwei-Spalten-Layout: links kompakt (Kalender, Mails, Aktionen), rechts gross (Instruktionen).

```
[Kalender kompakt]  | [                ]
[Mails kompakt]     | [ Instruktionen  ]
[Aktionen]          | [                ]
```

- **Kalender** (max 130px): Nur laufender + naechster Termin. Ab 17 Uhr: erster Termin morgen.
- **Mails** (max 150px): Nur heutige Mails (Top 5) mit Prio-Marker, keine Tabs.
- **Aktionen**: Restliche Hoehe links.
- **Instruktionen**: Volle Hoehe rechts, doppelte Breite.
- Header wie Expertenmodus.

### Tagesphase-Hintergruende

Morgen 06-11:30 | Mittag 11:30-13 | Nachmittag 13-17 | Abend 17-19:30 | Spaetabend 19:30-22:30 | Nacht 22:30-06

### Farbpalette

`--gold: #C9A84C` | `--gold-light: #E8C97A` | `--text: #f0ead6` | `--text-muted: #8a7d60`

Kacheln: semi-transparent + `backdrop-filter: blur(20px)`, goldener Border.

---

## 4. Kachel Daten (Kalender)

- Heutige Termine mit Uhrzeit. Laufend: gold. Vergangen: grau. Tentativ: `?`. Optional: `opt`.
- Ab 17 Uhr: Vorschau naechster Tag (Expertenmodus: alle Termine; Grundmodus/Fokusmodus: erster Termin mit Wochentag).
- Quelle: `data/calendar_YYYYMMDD.ics` (erzeugt von `export_outlook_today.ps1`). Geladen beim Start + alle 30 Min.
- ICS-Parser: `DTSTART/DTEND/SUMMARY/TRANSP/X-MICROSOFT-CDO-BUSYSTATUS/X-MYAPP-ROLE`. Free-Termine unsichtbar. UTC korrekt konvertiert.
- Sync-Vorbereitung: `data/sync_files.json`. Klick auf Termin-Link oeffnet Modal mit Mailliste. Gesendete Mails als "gesendet" markiert (statt Empfaengerliste).

---

## 5. Kachel Instruktionen (7 Tabs)

Default-Tab je nach Uhrzeit: vor 8 -> Wissen, 8-17 -> Notizen, ab 17 -> Wissen.

### Notizen
- `data/notes.json`, aufklappbar, neueste oben. Emoji-Zeilen gold, Rest gedimmt.
- Planungsnotizen (KWxx-MO/DI/...) unter gemeinsamem Baum-Knoten, Kurzlabel pro Tag, Uhrzeit neben KW-Header.
- Buttons: `+ Notiz` (Modal), `Planung` (POST `/run-plan-week`, Polling 8s, max 8 Min.)
- Polling vergleicht Notiz-Timestamps (vorher vs. nachher), nicht Browser-Uhrzeit.

### Wissen
Sport | Fuehrung & People | Tech & Engineering | Hoerbuecher | Misc -- alles in Sektionen. Lernplan mit Checkbox-Fortschritt.

### Links
`knowledge/links.json`. Bookmark-Sammlung.

### Netzwerk
Automatische Kontaktliste aus Direkt-Mails und Kleingruppenmeeetings (max 8 Teilnehmer).

| Sortierung | Darstellung |
|---|---|
| Oft | Top 20 (Inner Circle, goldener Stern), Baumansicht nach Abteilung |
| A-Z | Alphabetisch, flach |
| Abteilung | Baumansicht, Gruppen zugeklappt |

- Suchfeld mit Echtzeit-Filter. Manuelles Hinzufuegen per `+ Kontakt`.
- Klick oeffnet Modal (Rolle bearbeiten, Kontakt loeschen).
- Frequenzzahlen nie angezeigt (Datenschutz).

**Kontakt-Extraktion** (in `export_outlook_mails.ps1`):
- Empfangene Mails: nur wenn ich alleiniger To-Empfaenger (prio `direct`/`chef`) -> mailFreq++
- Gesendete Mails: nur 1:1 (genau ein Empfaenger) -> mailFreq++
- Kalender: nur Meetings mit max 8 ATTENDEEs -> meetFreq++
- Filter: eigene Namen, DL/SAP/Cloud/External-Praefixe (auch Suffix und Komma-Varianten), `_`/Ziffern
- Department-Lookup via Outlook COM (gecacht). `rolle` nie ueberschrieben.
- Bereinigung: Kontakte ohne mailFreq und ohne meetFreq werden entfernt.

Datenformat:
```json
[{"name":"Daniel K.","rolle":"Tech Lead","first":"13.01.","last":"22.04.","mailFreq":12,"meetFreq":3,"freq":15,"_weekId":"2026-W17"}]
```

### Jira
- Zwei Baeume: **"Meine"** (persoenlich zugewiesene Items, gruppiert nach Projekt, offen per Default) + **"SL Toolset for Cloud"** (Toolset-Items, gruppiert nach Release, zugeklappt per Default).
- Alle Items als kompakte Pill-Buttons farbcodiert nach Status. "Meine" zeigt gekuerzten Jira-Key (CLMSLORCHESTRATOR -> SLOCON, CLMSLCCI4ABAP -> CLOUDLM), Toolset zeigt Kategorie-Nummer (z.B. "RAMP-2859"). Summary + Status als Tooltip.
- Toolset-Items haben `releases`- und `category`-Feld in `data/jira.json`. Kategorien: SLV (HECSPCVAL), REGR (CLMOQHEC einzel-Release), RAMP (CLMCONSUMABILITY / CLMOQHEC multi-Release).
- Items mit mehreren Releases erscheinen unter jedem Release.
- Releases absteigend sortiert (neuestes oben), Kategorien: REGR > RAMP > SLV. Items innerhalb nach Status: Running/In Progress > On Hold > Open/To Do > Planned.
- Status-Farben: In Progress/Running (blau), Blocked (rot), On Hold (orange), Open/Planned/To Do (grau), Done (gruen). Keine Prio-Farben.
- Klick auf Pill oeffnet Jira im System-Browser (`openExternal()` via `/open-url`).
- Smart Sync/Setup-Button: pollt `jira_status.json`, wechselt bei Token-Fehler zu Setup.
- Letzter Sync-Zeitpunkt unten angezeigt (immer Datum + Uhrzeit).
- Auth: OAuth 2.0 via SAP MCP-Proxy.

### Neues
- Positive Nachrichten von squirrel-news.net, zusammengefasst via Claude API zu 3-5 Emoji-Bullets.
- Auto-Trigger bei App-Start wenn veraltet. Aktualisieren-Button im Footer.
- Zeitstempel unten (gleiches Format wie Jira).

### Ziele
- Jahresziele aus `knowledge/goals.json` mit automatischem Mail-Abgleich.
- 4 aufklappbare Sektionen (eine pro Ziel) mit Gewichtung, Beschreibung und gematchten Mails der Woche.
- Keyword-Matching: Jedes Ziel hat `keywords`-Array, gematcht gegen `mailData[].subject` (case-insensitive).
- Header zeigt Jahr, Kalenderwoche und Gesamtzahl der Mail-Bezuege.
- Meta-Zeile: Zeitpunkt der letzten Berechnung (Stand).
- Aktualisieren-Button im Footer: laedt Mail- und Goals-Daten neu, berechnet Bezuege sofort. Taeglich 1x ausreichend.
- Pro Ziel: Gewichts-Badge (gold), Titel, Mail-Count, bis zu 15 Mails mit Prio-Marker, Absender, Datum und Keyword-Badges. Klick auf Mail klappt Body auf.

---

## 6. Kachel Aktionen

To-Do-Liste (`data/actions.json`). Tabs: Offen / Erledigt. Ueberfaellig rot, Heute gold. Bearbeiten + Erledigt-Buttons pro Eintrag. URLs werden automatisch verlinkt (`linkify()`).

---

## 7. Kachel Mails

- Mails der Woche aus `data/mails_today.json`, gruppiert nach Tag (Tabs).
- Prioritaeten: `chef` (\*), `direct` (o), `action` (+), `cc` (-), `fyi` (.), `sent` (>)
- Chef-Erkennung: Sender-Department via Outlook Exchange User aufgeloest, verglichen mit `$ChefDept` aus `secrets.ps1`.
- Wochenzusammenfassung: Button -> Mail-Export + KI-Zusammenfassung -> Polling.

---

## 8. Write-Server

Node.js auf `127.0.0.1:9001`. PowerShell-Pfad hardcoded (`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`). Spawn ohne `detached`/`unref` (Corporate-Windows-Workaround).

| Methode | Pfad | Aktion |
|---|---|---|
| GET | `/ping` | Healthcheck |
| POST | `/modal-lock?state=1\|0` | Lock-Datei schreiben/loeschen |
| POST | `/run-export-mails` | Mail-Export spawnen |
| POST | `/run-summarize` | KI-Zusammenfassung spawnen |
| POST | `/run-export-calendar` | Kalender-Export spawnen |
| POST | `/run-plan-week` | Tagesbewertung (execFile, 8 Min. Timeout) |
| POST | `/run-generate-quote[?force=1]` | Tageszitat spawnen |
| POST | `/run-generate-news[?force=1]` | Tagesnews spawnen |
| POST | `/run-sync-jira` | Jira-Sync (execFile, 60s) |
| POST | `/run-setup-jira` | Jira-Setup (execFile, 210s) |
| POST | `/open-url` | URL im System-Browser oeffnen (Protokoll-Check) |
| PUT | `/{datei}` | Datei schreiben (Allowlist) |

**PUT-Allowlist:** `data/` -> actions, notes, contacts, jira, jira_status. `knowledge/` -> links, learningplan_progress, sport, quotes, news.

---

## 9. PowerShell-Skripte

### secrets.ps1
Nicht committet. Enthaelt `$ApiKey`, `$ProxyUri`, `$MyAddresses`, `$MyDisplayNames`, `$ChefDept`, `$MitarbeiterDept`, `$Mitarbeiter`.

### export_outlook_today.ps1
Kalender heute + morgen als ICS. Free -> TRANSPARENT, Tentativ -> TENTATIVE, Optional -> OPT-PARTICIPANT. ATTENDEEs fuer Netzwerk-Extraktion.

### export_outlook_mails.ps1
Inbox + Gesendete (Montag bis heute). Schreibt `mails_today.json`, `mail_sync_status.json`, `config.json`, `contacts.json`. Kontakt-Extraktion mit Department-Lookup und Race-Condition-Schutz.

### export_sync_prep.ps1
Morgige 1:1-Syncs -> `sync_files.json` + `KW{n}-{Name}.json`. Terminerkennung via Namens-Matching. Mail-Zuordnung ausschliesslich ueber Email-Adresse (kein Name-Matching, verhindert falsche Zuordnung bei gleichem Vornamen). Gesendete Mails: nur direkte To-Empfaenger (kein CC), Exchange-Adressen aufgeloest.

### summarize_mails.ps1
Claude API via Corporate Proxy -> `summary_KW{n}.json`.

### plan_week.ps1
Taeglich 18 Uhr + on-demand. 5 separate API-Calls (MO-FR). Emoji + ein Satz pro Tag. Ueberspringt bei `modal.lock`.

### generate_quote.ps1
Zitat aus klassischer deutscher Literatur via Claude API. `-force` fuer Neugenerierung.

### generate_news.ps1
squirrel-news.net -> Claude API -> 3-5 Emoji-Bullets. JSON manuell gebaut (ConvertTo-Json-Bug). `-force` fuer Neugenerierung.

### sync_jira.ps1
Zwei JQL-Queries: (1) persoenliche Items (`assignee = user`), (2) Toolset-Items (`project in (CLMCONSUMABILITY, CLMOQHEC, HECSPCVAL)` mit `fixVersion`). Release-Nummern aus `fix_versions` extrahiert (z.B. "SL Toolset for Cloud 2604 (T2026.15)" -> "2604"). Kategorie automatisch: HECSPCVAL -> SLV, CLMOQHEC einzel-Release -> REGR, CLMOQHEC multi-Release / CLMCONSUMABILITY -> RAMP. Manuell gesetzte `category` wird preserviert. OAuth-Token-Refresh. UTF-8 ohne BOM. Manueller JSON-Build (ConvertTo-Json-Bug).

### setup_jira.ps1
PKCE-Flow mit Browser-Login (SAP SSO). Callback auf Port 41562. Statusmeldungen in `jira_status.json`.

### setup.ps1
Einmaliges Setup: prueft Voraussetzungen, registriert 11 Scheduled Tasks, erstellt Shortcuts.

| Task | Zeitplan |
|---|---|
| Write Server / Live Server / Dashboard | bei Anmeldung |
| Mail Export | 07:30 + 12:30 |
| Sync Prep | 17:00 |
| Kalender Export | 06:00 + 12:00 |
| Tagesplanung | 18:00 |
| Jira Sync | 08:00 + 13:00 |

---

## 10. Refresh-Logik

| Was | Intervall |
|---|---|
| Uhr + SimpleBar | 60 Sek. |
| Server-Health | 5 Min. |
| ICS + Mails nachladen | 30 Min. |
| Mail-Export bei Start | nur 07-13 Uhr |
| Tageszitat / Neues | bei Start wenn veraltet |

Alle periodischen Refreshes durch `isAnyModalOpen()` geschuetzt.

---

## 11. Modals

`modal-action` (Aktion), `modal-notiz` (Notiz), `modal-link` (Link), `modal-sync` (Sync-Mails), `modal-netzwerk` (Kontakt bearbeiten), `modal-add-contact` (neuer Kontakt). Lock-Datei: `C:\Temp\myapp-modal.lock` (nicht in `data/`, da live-server sonst Reload ausloest).

---

## 12. Sicherheit

- **Secrets**: Nur in `secrets.ps1` (nicht committet). `.gitignore` mit `# PRIVACY`.
- **XSS**: Alle Benutzerdaten via `escapeHtml()` (inkl. `"` fuer Attribut-Kontexte). `safeHref()` blockiert `javascript:`-URLs. `linkify()` nutzt `safeHref()` + `rel="noopener noreferrer"`.
- **Write-Server**: Allowlist fuer PUT, nur `127.0.0.1`, CORS auf `127.0.0.1:5500`, 10 MB Body-Limit.
- **URL-Oeffnung**: `/open-url` prueft Protokoll (`http:`/`https:`) via `new URL()`, oeffnet via `explorer.exe`.
- **Namen**: `shortName()` (Vorname + erster Buchstabe Nachname). Frequenzzahlen nie angezeigt.
- **Kalender**: Kein inline `onclick` mit Benutzerdaten -- `data-*` Attribute + `addEventListener`.

---

## 13. Einrichtung

1. Node.js + `npm install -g live-server`
2. `secrets.ps1.template` -> `secrets.ps1` mit eigenen Werten
3. `knowledge/`-Dateien einspielen
4. Outlook + Chrome muessen installiert sein

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

Nach Neustart startet alles automatisch (ONLOGON-Tasks + Startup-Shortcut).

---

## 14. Bekannte Fallstricke

| Thema | Details |
|---|---|
| Kein `detached`/`unref` | Fuehrt auf Corporate Windows zu stillen Spawn-Fehlern. Stattdessen `{ stdio: 'ignore' }`. |
| PowerShell nur ASCII | Em-Dashes, Umlaute verursachen silent Parser-Fehler bei non-interaktivem Start. |
| CRLF Pflicht | PS-Skripte brauchen Windows-Zeilenenden. `unix2dos` nach Schreiben. |
| PS-Pfad hardcoded | `SystemRoot` ist leer wenn Node aus Git Bash startet. |
| Outlook COM + `/it` | Braucht laufendes Outlook + interaktive Session. GPO verhindert `Register-ScheduledTask`. |
| `ConvertTo-Json` Bug | Arrays in Hashtables werden als `{value:[],Count:N}` serialisiert. JSON manuell bauen. |
| UTF-8 ohne BOM | `[System.Text.UTF8Encoding]::new($false)` fuer alle JSON-Writes. |
| `live-server --ignore` | `data,knowledge` vom Watch ausgeschlossen. |
| ISOWeek in PS 5.1 | `GetWeekOfYear` statt `[System.Globalization.ISOWeek]` (braucht .NET 5+). |
