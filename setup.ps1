# setup.ps1
# One-time setup: checks prerequisites, registers all scheduled tasks.
# Run once from a normal (non-admin) PowerShell window:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$currentUser = $env:USERNAME
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ok     = $true

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "    [FEHLER] $msg" -ForegroundColor Red; $script:ok = $false }
function Write-Warn($msg) { Write-Host "    [WARN] $msg" -ForegroundColor Yellow }

# ── 1. Voraussetzungen pruefen ───────────────────────────────────────────────

Write-Step "Voraussetzungen pruefen"

# Node.js
try {
    $node = (Get-Command node -ErrorAction Stop).Source
    $nodeVersion = & node --version 2>&1
    Write-OK "Node.js gefunden: $nodeVersion ($node)"
} catch {
    Write-Fail "Node.js nicht gefunden. Bitte installieren: https://nodejs.org"
}

# npx / live-server
try {
    $null = Get-Command npx -ErrorAction Stop
    Write-OK "npx gefunden"
} catch {
    Write-Warn "npx nicht gefunden - live-server wird nicht funktionieren"
}

# secrets.ps1
if (Test-Path "$appDir\secrets.ps1") {
    Write-OK "secrets.ps1 vorhanden"
} else {
    Write-Fail "secrets.ps1 fehlt! Bitte anlegen (Vorlage in PROJEKT_DOKUMENTATION.md Abschnitt 9.1)"
}

# data directory
if (-not (Test-Path "$appDir\data")) {
    New-Item -ItemType Directory -Path "$appDir\data" | Out-Null
    Write-OK "data/ angelegt"
} else {
    Write-OK "data/ vorhanden"
}

# knowledge directory
if (-not (Test-Path "$appDir\knowledge")) {
    New-Item -ItemType Directory -Path "$appDir\knowledge" | Out-Null
    Write-Warn "knowledge/ neu angelegt - bitte JSON-Dateien einspielen"
} else {
    Write-OK "knowledge/ vorhanden"
}

# C:\Temp fuer modal.lock
if (-not (Test-Path "C:\Temp")) {
    New-Item -ItemType Directory -Path "C:\Temp" | Out-Null
    Write-OK "C:\Temp angelegt"
} else {
    Write-OK "C:\Temp vorhanden"
}

if (-not $ok) {
    Write-Host "`nBitte Fehler beheben und setup.ps1 erneut ausfuehren." -ForegroundColor Red
    exit 1
}

# ── 2. Alte Tasks entfernen ──────────────────────────────────────────────────

Write-Step "Alte Tasks entfernen"

$taskNames = @("MyApp Write Server","MyApp Mail Export","MyApp Sync Prep","MyApp Kalender Export","MyApp Tagesplanung")
foreach ($tn in $taskNames) {
    schtasks /delete /tn $tn /f 2>$null | Out-Null
}
Write-OK "Alte Tasks bereinigt"

$ps  = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$psArgs = "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File"

# ── 3. Task: Write Server (bei Anmeldung starten) ────────────────────────────

Write-Step "Task: MyApp Write Server"

$node = (Get-Command node -ErrorAction Stop).Source

# schtasks /tr braucht den gesamten Befehl als einen String.
# Bei Pfaden mit Leerzeichen: innere Quotes mit \", aussen keine extra Quotes noetig.
function New-TR($exe, $args) {
    # Ergibt z.B.: \"C:\Program Files\nodejs\node.exe\" \"C:\...\write-server.js\"
    return "`\`"$exe`\`" $args"
}

$trNode   = New-TR $node "`\`"$appDir\write-server.js`\`""
$trMail   = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\export_outlook_mails.ps1`\`""
$trSync   = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\export_sync_prep.ps1`\`""
$trCal    = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\export_outlook_today.ps1`\`""
$trPlan   = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\plan_week.ps1`\`""

$r = schtasks /create /tn "MyApp Write Server" /tr $trNode /sc ONLOGON /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OK "Write Server registriert (startet bei Anmeldung)"
} else {
    Write-Fail "Write Server konnte nicht registriert werden: $r"
}

# Sofort starten
Start-Process -FilePath $node -ArgumentList "`"$appDir\write-server.js`"" -WorkingDirectory $appDir -WindowStyle Minimized
Write-OK "Write Server gestartet (Port 9001)"

# ── 4. Task: Mail Export (07:30 + 12:30) ────────────────────────────────────

Write-Step "Task: MyApp Mail Export"

$r1 = schtasks /create /tn "MyApp Mail Export"      /tr $trMail /sc DAILY /st 07:30 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Mail Export 07:30 fehlgeschlagen: $r1" }
$r2 = schtasks /create /tn "MyApp Mail Export 1230"  /tr $trMail /sc DAILY /st 12:30 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Mail Export 12:30 fehlgeschlagen: $r2" }
if ($ok) { Write-OK "Mail Export registriert (07:30 + 12:30)" }

# ── 5. Task: Sync Prep (17:00) ───────────────────────────────────────────────

Write-Step "Task: MyApp Sync Prep"

$r = schtasks /create /tn "MyApp Sync Prep" /tr $trSync /sc DAILY /st 17:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -eq 0) { Write-OK "Sync Prep registriert (17:00)" } else { Write-Fail "Sync Prep fehlgeschlagen: $r" }

# ── 6. Task: Kalender Export (06:00 + 12:00) ────────────────────────────────

Write-Step "Task: MyApp Kalender Export"

$r1 = schtasks /create /tn "MyApp Kalender Export"      /tr $trCal /sc DAILY /st 06:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Kalender Export 06:00 fehlgeschlagen: $r1" }
$r2 = schtasks /create /tn "MyApp Kalender Export 1200"  /tr $trCal /sc DAILY /st 12:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Kalender Export 12:00 fehlgeschlagen: $r2" }
if ($ok) { Write-OK "Kalender Export registriert (06:00 + 12:00)" }

# ── 7. Task: Tagesplanung (18:00) ────────────────────────────────────────────

Write-Step "Task: MyApp Tagesplanung"

$r = schtasks /create /tn "MyApp Tagesplanung" /tr $trPlan /sc DAILY /st 18:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -eq 0) { Write-OK "Tagesplanung registriert (18:00)" } else { Write-Fail "Tagesplanung fehlgeschlagen: $r" }

# ── 8. Zusammenfassung ───────────────────────────────────────────────────────

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Setup abgeschlossen!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Registrierte Tasks:" -ForegroundColor White
Write-Host "  MyApp Write Server       - bei Anmeldung, laeuft dauerhaft" -ForegroundColor Gray
Write-Host "  MyApp Mail Export        - 07:30 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Mail Export 1230   - 12:30 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Sync Prep          - 17:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Kalender Export    - 06:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Kalender Export 1200 - 12:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Tagesplanung       - 18:00 taeglich" -ForegroundColor Gray
Write-Host ""
Write-Host "Naechste Schritte:" -ForegroundColor White
Write-Host "  1. Outlook starten (falls noch nicht offen)" -ForegroundColor Gray
Write-Host "  2. Dashboard oeffnen: http://127.0.0.1:5500" -ForegroundColor Gray
Write-Host "  3. Fuer live-server: start-servers.ps1 ausfuehren" -ForegroundColor Gray
Write-Host ""
