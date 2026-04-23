# setup.ps1
# One-time setup: checks prerequisites, registers all scheduled tasks.
# Run once from a normal (non-admin) PowerShell window:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$currentUser = $env:USERNAME
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ok     = $true

# Ensure System32 and Node.js are in PATH (needed when started from non-interactive shells)
$sysPaths = @("$env:SystemRoot\System32", "C:\Windows\System32", "C:\Program Files\nodejs")
foreach ($sp in $sysPaths) {
    if ((Test-Path $sp) -and ($env:PATH -notlike "*$sp*")) {
        $env:PATH = "$sp;$env:PATH"
    }
}

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

$taskNames = @("MyApp Write Server","MyApp Live Server","MyApp Dashboard","MyApp Mail Export","MyApp Mail Export 1230","MyApp Sync Prep","MyApp Kalender Export","MyApp Kalender Export 1200","MyApp Tagesplanung","MyApp Jira Sync","MyApp Jira Sync 1300")
foreach ($tn in $taskNames) {
    schtasks /delete /tn $tn /f 2>$null | Out-Null
}
Write-OK "Alte Tasks bereinigt"

$ps  = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$psArgs = "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File"

# ── 3. Server sofort starten + Autostart einrichten ─────────────────────────

Write-Step "Server starten"

$node = (Get-Command node -ErrorAction Stop).Source

Start-Process -FilePath $node -ArgumentList "`"$appDir\write-server.js`"" -WorkingDirectory $appDir -WindowStyle Minimized
Write-OK "Write Server gestartet (Port 9001)"

$npx = (Get-Command npx -ErrorAction SilentlyContinue).Source
if (-not $npx) {
    $npx = Join-Path (Split-Path $node) "npx.cmd"
}
Start-Process "cmd" -ArgumentList "/c `"$npx`" live-server --port=5500 --no-browser --ignore=`"data,knowledge`" `"$appDir`"" -WorkingDirectory $appDir -WindowStyle Minimized
Write-OK "Live Server gestartet (Port 5500)"

Start-Sleep -Milliseconds 2000
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chrome) {
    Start-Process $chrome -ArgumentList "--app=http://127.0.0.1:5500 --window-size=1280,64 --window-position=0,736"
    Write-OK "Chrome App gestartet"
}

Write-Step "Autostart einrichten"

# start-dashboard.bat -- einfacher Doppelklick-Starter
$batPath = Join-Path $appDir "start-dashboard.bat"
$batContent = @"
@echo off
cd /d "$appDir"
powershell -ExecutionPolicy Bypass -File "$appDir\start-servers.ps1"
"@
[IO.File]::WriteAllText($batPath, $batContent, (New-Object System.Text.UTF8Encoding $false))
Write-OK "start-dashboard.bat erstellt"

# Shortcut in shell:startup -> startet bei Windows-Anmeldung automatisch
$startupDir = [Environment]::GetFolderPath("Startup")
$lnkPath = Join-Path $startupDir "MyApp Dashboard.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnkPath)
$sc.TargetPath = $batPath
$sc.WorkingDirectory = $appDir
$sc.Description = "MyApp Dashboard starten"
$sc.WindowStyle = 7  # minimized
$sc.Save()
Write-OK "Autostart-Shortcut: $lnkPath"

# ── 4. Scheduled Tasks fuer Datenpipeline ───────────────────────────────────

Write-Step "Scheduled Tasks registrieren"

function New-TR($exe, $args) {
    return "`\`"$exe`\`" $args"
}

$trMail   = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\export_outlook_mails.ps1`\`""
$trSync   = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\export_sync_prep.ps1`\`""
$trCal    = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\export_outlook_today.ps1`\`""
$trPlan   = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\plan_week.ps1`\`""
$trJira   = New-TR $ps   "-NonInteractive -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\`"$appDir\sync_jira.ps1`\`""

# Mail Export (07:30 + 12:30)
$r1 = schtasks /create /tn "MyApp Mail Export"      /tr $trMail /sc DAILY /st 07:30 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Mail Export 07:30 fehlgeschlagen: $r1" }
$r2 = schtasks /create /tn "MyApp Mail Export 1230"  /tr $trMail /sc DAILY /st 12:30 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Mail Export 12:30 fehlgeschlagen: $r2" }
if ($ok) { Write-OK "Mail Export registriert (07:30 + 12:30)" }

# Sync Prep (17:00)
$r = schtasks /create /tn "MyApp Sync Prep" /tr $trSync /sc DAILY /st 17:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -eq 0) { Write-OK "Sync Prep registriert (17:00)" } else { Write-Fail "Sync Prep fehlgeschlagen: $r" }

# Kalender Export (06:00 + 12:00)
$r1 = schtasks /create /tn "MyApp Kalender Export"      /tr $trCal /sc DAILY /st 06:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Kalender Export 06:00 fehlgeschlagen: $r1" }
$r2 = schtasks /create /tn "MyApp Kalender Export 1200"  /tr $trCal /sc DAILY /st 12:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Kalender Export 12:00 fehlgeschlagen: $r2" }
if ($ok) { Write-OK "Kalender Export registriert (06:00 + 12:00)" }

# Tagesplanung (18:00)
$r = schtasks /create /tn "MyApp Tagesplanung" /tr $trPlan /sc DAILY /st 18:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -eq 0) { Write-OK "Tagesplanung registriert (18:00)" } else { Write-Fail "Tagesplanung fehlgeschlagen: $r" }

# Jira Sync (08:00 + 13:00)
$r1 = schtasks /create /tn "MyApp Jira Sync"      /tr $trJira /sc DAILY /st 08:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Jira Sync 08:00 fehlgeschlagen: $r1" }
$r2 = schtasks /create /tn "MyApp Jira Sync 1300"  /tr $trJira /sc DAILY /st 13:00 /ru $currentUser /it /f 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Jira Sync 13:00 fehlgeschlagen: $r2" }
if ($ok) { Write-OK "Jira Sync registriert (08:00 + 13:00)" }

# ── 9. Zusammenfassung ───────────────────────────────────────────────────────

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Setup abgeschlossen!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Registrierte Tasks:" -ForegroundColor White
Write-Host "  MyApp Write Server       - bei Anmeldung, laeuft dauerhaft" -ForegroundColor Gray
Write-Host "  MyApp Live Server        - bei Anmeldung, laeuft dauerhaft" -ForegroundColor Gray
Write-Host "  MyApp Dashboard          - bei Anmeldung (15s Delay), Chrome App" -ForegroundColor Gray
Write-Host "  MyApp Mail Export        - 07:30 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Mail Export 1230   - 12:30 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Sync Prep          - 17:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Kalender Export    - 06:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Kalender Export 1200 - 12:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Tagesplanung       - 18:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Jira Sync          - 08:00 taeglich" -ForegroundColor Gray
Write-Host "  MyApp Jira Sync 1300     - 13:00 taeglich" -ForegroundColor Gray
Write-Host ""
Write-Host "Autostart:" -ForegroundColor White
Write-Host "  Shortcut in shell:startup - startet Dashboard bei Windows-Anmeldung" -ForegroundColor Gray
Write-Host "  start-dashboard.bat       - Doppelklick zum manuellen Starten" -ForegroundColor Gray
Write-Host ""
Write-Host "Nach Neustart startet alles automatisch." -ForegroundColor Yellow
Write-Host "Manuell starten: Doppelklick auf start-dashboard.bat" -ForegroundColor Yellow
Write-Host ""
