# start.ps1 -- Smart launcher: checks what's needed, only starts/fixes what's missing
# Doppelklick auf start.bat oder: powershell -ExecutionPolicy Bypass -File start.ps1

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8   = New-Object System.Text.UTF8Encoding $false

# Ensure System32 and Node.js are in PATH
$sysPaths = @("$env:SystemRoot\System32", "C:\Windows\System32", "C:\Program Files\nodejs")
foreach ($sp in $sysPaths) {
    if ((Test-Path $sp) -and ($env:PATH -notlike "*$sp*")) {
        $env:PATH = "$sp;$env:PATH"
    }
}

$ClientId      = "PSNIs0bYQwTCyQ1YBSxsyKrrQjuyM8r7"
$TokenEndpoint = "https://mcp.jira.tools.sap/token"
$RefreshFile   = Join-Path $env:USERPROFILE ".claude\sap-jira-refresh-token.sh"

Write-Host ""
Write-Host "=== myapp Start ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Stale listener auf 41562 killen ──────────────────────────────────────
$stale = Get-NetTCPConnection -LocalPort 41562 -ErrorAction SilentlyContinue |
         Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue |
         Where-Object { $_ -gt 0 } | Select-Object -Unique
foreach ($procId in $stale) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "  Port 41562: stale Listener $procId gestoppt" -ForegroundColor Yellow
}

# ── 2. Write-Server (Port 9001) ────────────────────────────────────────────
$ws = Get-NetTCPConnection -LocalPort 9001 -State Listen -ErrorAction SilentlyContinue
if ($ws) {
    Write-Host "  Write-Server   ... laeuft bereits" -ForegroundColor Green
} else {
    Start-Process "node" -ArgumentList "`"$appDir\write-server.js`"" `
        -WorkingDirectory $appDir -WindowStyle Minimized
    Write-Host "  Write-Server   ... gestartet" -ForegroundColor Green
}

# ── 3. Live-Server (Port 5500) ─────────────────────────────────────────────
$ls = Get-NetTCPConnection -LocalPort 5500 -State Listen -ErrorAction SilentlyContinue
if ($ls) {
    Write-Host "  Live-Server    ... laeuft bereits" -ForegroundColor Green
} else {
    Start-Process "cmd" -ArgumentList "/c npx live-server --port=5500 --no-browser --ignore=`"data,knowledge`" `"$appDir`"" `
        -WorkingDirectory $appDir -WindowStyle Minimized
    Write-Host "  Live-Server    ... gestartet" -ForegroundColor Green
}

Start-Sleep -Milliseconds 1200

# ── 4. Jira Token pruefen ──────────────────────────────────────────────────
$refreshToken = ""
if (Test-Path $RefreshFile) {
    $raw = Get-Content $RefreshFile -Raw
    if ($raw) { $refreshToken = $raw.Trim() }
}

$tokenOk = $false

if ($refreshToken) {
    Write-Host ""
    Write-Host "  Jira Token     ... wird geprueft" -ForegroundColor Gray -NoNewline
    try {
        $body = "grant_type=refresh_token&refresh_token=$refreshToken&client_id=$ClientId"
        $resp = Invoke-RestMethod -Uri $TokenEndpoint -Method Post `
            -ContentType "application/x-www-form-urlencoded" `
            -Body $body -TimeoutSec 10
        if ($resp.access_token) {
            $tokenOk = $true
            if ($resp.refresh_token) {
                [System.IO.File]::WriteAllText($RefreshFile, $resp.refresh_token, $utf8)
            }
            Write-Host "`r  Jira Token     ... gueltig                " -ForegroundColor Green
        }
    } catch {
        Write-Host "`r  Jira Token     ... abgelaufen             " -ForegroundColor Red
    }
}

if (-not $tokenOk) {
    if (-not $refreshToken) {
        Write-Host "  Jira Token     ... nicht vorhanden" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  -> Starte Jira Login (Browser oeffnet sich)..." -ForegroundColor Yellow
    Write-Host ""
    & "$appDir\setup_jira.ps1"
    # Pruefen ob Setup erfolgreich war
    $raw2 = $null
    if (Test-Path $RefreshFile) { $raw2 = Get-Content $RefreshFile -Raw }
    if ($raw2 -and $raw2.Trim()) {
        $tokenOk = $true
        Write-Host "  Jira Token     ... gespeichert" -ForegroundColor Green
    } else {
        Write-Host "  Jira Token     ... FEHLGESCHLAGEN" -ForegroundColor Red
    }
}

# ── 5. Jira Sync (wenn Token ok) ───────────────────────────────────────────
if ($tokenOk) {
    Write-Host "  Jira Sync      ... laeuft" -ForegroundColor Gray -NoNewline
    & "$appDir\sync_jira.ps1"
    $statusFile = Join-Path $appDir "data\jira_status.json"
    if (Test-Path $statusFile) {
        try {
            $st = Get-Content $statusFile -Raw | ConvertFrom-Json
            if ($st.status -eq 'ok') {
                Write-Host "`r  Jira Sync      ... $($st.count) Items geladen       " -ForegroundColor Green
            } else {
                Write-Host "`r  Jira Sync      ... Fehler: $($st.message)           " -ForegroundColor Red
            }
        } catch {
            Write-Host "`r  Jira Sync      ... Status unbekannt        " -ForegroundColor Yellow
        }
    }
}

# ── 6. Chrome App-Fenster ──────────────────────────────────────────────────
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$appRunning = Get-Process chrome -ErrorAction SilentlyContinue |
              Where-Object { $_.MainWindowTitle -match '127\.0\.0\.1:5500|Dein Tag' }
if ($appRunning) {
    Write-Host "  Chrome App     ... laeuft bereits" -ForegroundColor Green
} elseif (Test-Path $chrome) {
    Start-Process $chrome -ArgumentList "--app=http://127.0.0.1:5500 --window-size=1280,64 --window-position=0,736"
    Write-Host "  Chrome App     ... gestartet" -ForegroundColor Green
} else {
    Write-Host "  Chrome         ... nicht gefunden, bitte manuell oeffnen: http://127.0.0.1:5500" -ForegroundColor Yellow
}

# ── Zusammenfassung ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Fertig ===" -ForegroundColor Cyan
Write-Host ""
