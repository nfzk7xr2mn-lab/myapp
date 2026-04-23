# setup_jira.ps1 -- Refresh or re-authenticate Jira OAuth token, then sync
# Called from Dashboard "Setup" button via write-server.
# 1. Tries refresh-token grant (silent, no user action)
# 2. Falls back to full PKCE flow (opens browser for SSO login)
# 3. On success: saves tokens, runs sync_jira.ps1, writes jira_status.json
# Writes data/jira_status.json with progress updates for frontend polling.

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$outFile    = Join-Path $scriptDir "data\jira_status.json"
$utf8       = New-Object System.Text.UTF8Encoding $false

$ClientId      = "PSNIs0bYQwTCyQ1YBSxsyKrrQjuyM8r7"
$TokenEndpoint = "https://mcp.jira.tools.sap/token"
$AuthEndpoint  = "https://mcp.jira.tools.sap/authorize"
$RedirectUri   = "http://localhost:41562/callback"
$Scope         = "openid profile email mcp"
$RefreshFile   = Join-Path $env:USERPROFILE ".claude\sap-jira-refresh-token.sh"
$NodeExe       = "C:\Program Files\nodejs\node.exe"

function Write-Status($obj) {
    $json = $obj | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($outFile, $json, $utf8)
}

# ── 1. Try refresh token ────────────────────────────────────────────────────

Write-Status @{ status = "refreshing"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

$refreshToken = ""
if (Test-Path $RefreshFile) {
    $refreshToken = (Get-Content $RefreshFile -Raw).Trim()
}

if ($refreshToken) {
    Write-Host "Trying refresh token..."
    try {
        $body = "grant_type=refresh_token&refresh_token=$refreshToken&client_id=$ClientId"
        $resp = Invoke-RestMethod -Uri $TokenEndpoint -Method Post `
            -ContentType "application/x-www-form-urlencoded" `
            -Body $body -TimeoutSec 15

        if ($resp.access_token) {
            Write-Host "Refresh OK."
            if ($resp.refresh_token) {
                [System.IO.File]::WriteAllText($RefreshFile, $resp.refresh_token, $utf8)
            }
            # Run sync with fresh token already saved
            & "$scriptDir\sync_jira.ps1"
            exit 0
        }
    } catch {
        Write-Host "Refresh failed: $_"
    }
}

# ── 2. Full PKCE flow ───────────────────────────────────────────────────────

Write-Host "Starting PKCE flow..."

# Generate PKCE challenge via Node.js (no openssl dependency)
$pkceJson = & $NodeExe -e @"
const crypto = require('crypto');
const v = crypto.randomBytes(32).toString('base64url');
const c = crypto.createHash('sha256').update(v).digest('base64url');
const s = crypto.randomBytes(16).toString('hex');
console.log(JSON.stringify({verifier:v, challenge:c, state:s}));
"@

$pkce = $pkceJson | ConvertFrom-Json
$codeVerifier  = $pkce.verifier
$codeChallenge = $pkce.challenge
$state         = $pkce.state

$encodedScope = [uri]::EscapeDataString($Scope)
$authUrl = "${AuthEndpoint}?response_type=code&client_id=${ClientId}&redirect_uri=${RedirectUri}&scope=${encodedScope}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256"

# Write status so frontend can show "please login"
Write-Status @{
    status = "login_required"
    ts     = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    url    = $authUrl
}

# Open browser
Start-Process $authUrl

# Start Node.js callback listener (3 min timeout)
Write-Host "Waiting for browser callback on port 41562..."

$callbackFile = [System.IO.Path]::GetTempFileName()

$listenerCode = @"
const http = require('http');
const fs = require('fs');
const expectedState = process.argv[2];
const outFile = process.argv[3];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:41562');
  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const st = url.searchParams.get('state');
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('<html><body><h2>Login erfolgreich. Du kannst diesen Tab schliessen.</h2></body></html>');
    fs.writeFileSync(outFile, JSON.stringify({code: code, state: st}));
    server.close();
  } else {
    res.writeHead(404); res.end('Not found');
  }
});
server.listen(41562, () => { process.stderr.write('Listening...\\n'); });
setTimeout(() => {
  fs.writeFileSync(outFile, JSON.stringify({error: 'timeout'}));
  server.close();
  process.exit(1);
}, 180000);
"@

$listenerFile = [System.IO.Path]::GetTempFileName() + ".js"
[System.IO.File]::WriteAllText($listenerFile, $listenerCode, $utf8)

try {
    & $NodeExe $listenerFile $state $callbackFile 2>&1 | Out-Null
} catch {
    Write-Host "Listener error: $_"
}

# Read callback result
if (-not (Test-Path $callbackFile)) {
    Write-Status @{ status = "timeout"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    exit 1
}

$callbackRaw = Get-Content $callbackFile -Raw
Remove-Item $callbackFile -ErrorAction SilentlyContinue
Remove-Item $listenerFile -ErrorAction SilentlyContinue

$callback = $callbackRaw | ConvertFrom-Json

if ($callback.error -eq "timeout") {
    Write-Host "Timeout waiting for callback."
    Write-Status @{ status = "timeout"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    exit 1
}

if ($callback.state -ne $state) {
    Write-Host "State mismatch."
    Write-Status @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "State mismatch" }
    exit 1
}

$code = $callback.code
if (-not $code) {
    Write-Host "No code received."
    Write-Status @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "No code received" }
    exit 1
}

# ── 3. Exchange code for tokens ──────────────────────────────────────────────

Write-Host "Exchanging code for token..."
Write-Status @{ status = "exchanging"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

try {
    $tokenBody = "grant_type=authorization_code&code=${code}&client_id=${ClientId}&redirect_uri=${RedirectUri}&code_verifier=${codeVerifier}"
    $tokenResp = Invoke-RestMethod -Uri $TokenEndpoint -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body $tokenBody -TimeoutSec 15
} catch {
    Write-Host "Token exchange failed: $_"
    Write-Status @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "Token exchange failed" }
    exit 1
}

if (-not $tokenResp.access_token) {
    Write-Host "No access token in response."
    Write-Status @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "No access token" }
    exit 1
}

# Save refresh token
if ($tokenResp.refresh_token) {
    [System.IO.File]::WriteAllText($RefreshFile, $tokenResp.refresh_token, $utf8)
    Write-Host "Refresh token saved."
}

# ── 4. Run sync ──────────────────────────────────────────────────────────────

Write-Host "Running sync..."
& "$scriptDir\sync_jira.ps1"

Write-Host "Setup complete."
