# ServiceNow API connectivity test (Phase 1)
# Prerequisites: Be logged into sap.service-now.com in Chrome
# Run: powershell -ExecutionPolicy Bypass -File test_servicenow.ps1

Add-Type -AssemblyName System.Security

$baseUrl   = "https://sap.service-now.com/api/now/table/incident"
$domain    = "service-now.com"
$chromePath = "$env:LOCALAPPDATA\Google\Chrome\User Data"

Write-Host "=== ServiceNow Cookie Extraction Test ===" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Copy Chrome cookie DB (Chrome locks it while running) ---
Write-Host "[1] Copying Chrome cookie database..." -ForegroundColor Yellow

$cookieDb = "$chromePath\Default\Network\Cookies"
if (-not (Test-Path $cookieDb)) {
    # Try Profile 1 if Default doesn't exist
    $cookieDb = "$chromePath\Profile 1\Network\Cookies"
}
if (-not (Test-Path $cookieDb)) {
    Write-Host "    FAILED: Chrome cookie DB not found at expected paths" -ForegroundColor Red
    Write-Host "    Checked: $chromePath\Default\Network\Cookies" -ForegroundColor Red
    Write-Host "    Checked: $chromePath\Profile 1\Network\Cookies" -ForegroundColor Red
    exit 1
}

$tempDb = "$env:TEMP\chrome_cookies_snow_test.db"
try {
    Copy-Item -Path $cookieDb -Destination $tempDb -Force -ErrorAction Stop
    Write-Host "    OK - copied to $tempDb" -ForegroundColor Green
} catch {
    Write-Host "    FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# --- Step 2: Read Chrome master key for cookie decryption ---
Write-Host "[2] Reading Chrome encryption master key..." -ForegroundColor Yellow

$localStatePath = "$chromePath\Local State"
if (-not (Test-Path $localStatePath)) {
    Write-Host "    FAILED: Local State not found" -ForegroundColor Red
    exit 1
}
$localState = Get-Content $localStatePath -Raw | ConvertFrom-Json
$encKeyB64  = $localState.os_crypt.encrypted_key
if (-not $encKeyB64) {
    Write-Host "    FAILED: encrypted_key not found in Local State" -ForegroundColor Red
    exit 1
}

$encKeyBytes = [Convert]::FromBase64String($encKeyB64)
# Strip "DPAPI" prefix (first 5 bytes)
$encKeyBytes = $encKeyBytes[5..($encKeyBytes.Length - 1)]

try {
    $masterKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $encKeyBytes, $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    Write-Host "    OK - master key decrypted ($($masterKey.Length) bytes)" -ForegroundColor Green
} catch {
    Write-Host "    FAILED: DPAPI decryption failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "    This may be Chrome v127+ App-Bound Encryption." -ForegroundColor Yellow
    Write-Host "    -> Fallback: manual cookie paste (see below)" -ForegroundColor Yellow
    $masterKey = $null
}

# --- Step 3: Query cookies from SQLite ---
Write-Host "[3] Reading cookies from SQLite..." -ForegroundColor Yellow

# Use System.Data.SQLite or ADO.NET with SQLite
# PowerShell 5.1 doesn't have built-in SQLite, so we use a .NET approach
# Try loading SQLite assembly from common locations
$sqliteDll = $null
$searchPaths = @(
    "$env:ProgramFiles\System.Data.SQLite\bin\System.Data.SQLite.dll",
    "$env:ProgramFiles(x86)\System.Data.SQLite\bin\System.Data.SQLite.dll",
    "$PSScriptRoot\System.Data.SQLite.dll"
)
foreach ($p in $searchPaths) {
    if (Test-Path $p) { $sqliteDll = $p; break }
}

# Alternative: use node.js to read SQLite (more reliable)
Write-Host "    Using Node.js to read SQLite..." -ForegroundColor Yellow

$nodeScript = @"
const fs = require('fs');
const path = require('path');

// Try to use better-sqlite3, fall back to manual parsing hint
let Database;
try {
    Database = require('better-sqlite3');
} catch(e) {
    // Try from global node_modules
    try {
        const globalPath = require('child_process').execSync('npm root -g', {encoding:'utf8'}).trim();
        Database = require(path.join(globalPath, 'better-sqlite3'));
    } catch(e2) {
        console.log(JSON.stringify({error: 'better-sqlite3 not installed. Run: npm install -g better-sqlite3'}));
        process.exit(1);
    }
}

const dbPath = process.argv[2];
const domain = process.argv[3];

try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(
        "SELECT name, encrypted_value, host_key, path, expires_utc, is_httponly, is_secure " +
        "FROM cookies WHERE host_key LIKE ? ORDER BY name"
    ).all('%' + domain + '%');
    db.close();
    console.log(JSON.stringify(rows));
} catch(e) {
    console.log(JSON.stringify({error: e.message}));
}
"@

$nodeScriptFile = "$env:TEMP\read_chrome_cookies.js"
$nodeScript | Out-File -FilePath $nodeScriptFile -Encoding utf8 -Force

$nodeResult = & node $nodeScriptFile $tempDb $domain 2>&1
$cookieRows = $null
try {
    $cookieRows = $nodeResult | ConvertFrom-Json
} catch {
    Write-Host "    FAILED to parse Node output: $nodeResult" -ForegroundColor Red
    Write-Host ""
    Write-Host "    If better-sqlite3 is missing, install it:" -ForegroundColor Yellow
    Write-Host "    npm install -g better-sqlite3" -ForegroundColor White
    Write-Host ""
    # Fall through to manual cookie paste
}

if ($cookieRows -and $cookieRows.error) {
    Write-Host "    FAILED: $($cookieRows.error)" -ForegroundColor Red
    $cookieRows = $null
}

$cookieString = ""

if ($cookieRows -and $cookieRows.Count -gt 0) {
    Write-Host "    Found $($cookieRows.Count) cookie(s) for *$domain*" -ForegroundColor Green
    Write-Host ""

    # --- Step 4: Decrypt cookie values ---
    Write-Host "[4] Decrypting cookie values..." -ForegroundColor Yellow

    $decryptedCookies = @{}

    foreach ($row in $cookieRows) {
        $name = $row.name
        $encBytes = [byte[]]@()

        # encrypted_value comes as JSON object with "data" array from better-sqlite3 Buffer
        if ($row.encrypted_value -and $row.encrypted_value.data) {
            $encBytes = [byte[]]$row.encrypted_value.data
        } elseif ($row.encrypted_value -is [string] -and $row.encrypted_value.Length -gt 0) {
            try { $encBytes = [Convert]::FromBase64String($row.encrypted_value) } catch {}
        }

        if ($encBytes.Length -eq 0) {
            Write-Host "    $name = (empty)" -ForegroundColor DarkGray
            continue
        }

        # Chrome v80+ AES-256-GCM: starts with "v10" or "v11" (3-byte prefix)
        $prefix = [System.Text.Encoding]::ASCII.GetString($encBytes[0..2])

        if ($prefix -eq "v10" -or $prefix -eq "v11") {
            if (-not $masterKey) {
                Write-Host "    $name = (encrypted, no master key)" -ForegroundColor Red
                continue
            }
            # Nonce: bytes 3..14 (12 bytes), Ciphertext+Tag: bytes 15..end
            $nonce      = $encBytes[3..14]
            $ciphertext = $encBytes[15..($encBytes.Length - 1)]

            try {
                # Use .NET AesGcm (requires .NET Core / PS 7+) or BouncyCastle
                # For PS 5.1, we use a Node.js helper
                $decryptNodeScript = @"
const crypto = require('crypto');
const key = Buffer.from(process.argv[2], 'hex');
const nonce = Buffer.from(process.argv[3], 'hex');
const enc = Buffer.from(process.argv[4], 'hex');
// Last 16 bytes are the GCM auth tag
const tag = enc.slice(enc.length - 16);
const ct  = enc.slice(0, enc.length - 16);
try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    process.stdout.write(dec.toString('utf8'));
} catch(e) {
    process.stderr.write('DECRYPT_FAIL: ' + e.message);
    process.exit(1);
}
"@
                $decNodeFile = "$env:TEMP\decrypt_cookie.js"
                $decryptNodeScript | Out-File -FilePath $decNodeFile -Encoding utf8 -Force

                $keyHex   = ($masterKey | ForEach-Object { '{0:x2}' -f $_ }) -join ''
                $nonceHex = ($nonce | ForEach-Object { '{0:x2}' -f $_ }) -join ''
                $encHex   = ($ciphertext | ForEach-Object { '{0:x2}' -f $_ }) -join ''

                $decValue = & node $decNodeFile $keyHex $nonceHex $encHex 2>&1
                if ($LASTEXITCODE -eq 0 -and $decValue) {
                    $decryptedCookies[$name] = $decValue
                    $preview = if ($decValue.Length -gt 40) { $decValue.Substring(0,40) + "..." } else { $decValue }
                    Write-Host "    $name = $preview (host: $($row.host_key))" -ForegroundColor Green
                } else {
                    Write-Host "    $name = DECRYPT FAILED: $decValue" -ForegroundColor Red
                }
            } catch {
                Write-Host "    $name = DECRYPT ERROR: $($_.Exception.Message)" -ForegroundColor Red
            }
        } else {
            # Old-style DPAPI encryption (pre-v80)
            try {
                $decBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
                    $encBytes, $null,
                    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
                )
                $val = [System.Text.Encoding]::UTF8.GetString($decBytes)
                $decryptedCookies[$name] = $val
                $preview = if ($val.Length -gt 40) { $val.Substring(0,40) + "..." } else { $val }
                Write-Host "    $name = $preview" -ForegroundColor Green
            } catch {
                Write-Host "    $name = DPAPI FAILED" -ForegroundColor Red
            }
        }
    }

    if ($decryptedCookies.Count -gt 0) {
        # Build cookie header string
        $cookieParts = @()
        foreach ($kv in $decryptedCookies.GetEnumerator()) {
            $cookieParts += "$($kv.Key)=$($kv.Value)"
        }
        $cookieString = $cookieParts -join "; "
        Write-Host ""
        Write-Host "    Cookie header built with $($decryptedCookies.Count) cookie(s)" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "    No cookies could be decrypted." -ForegroundColor Red
    }
} else {
    Write-Host "    No cookies found or SQLite read failed." -ForegroundColor Red
}

# --- Step 5: Manual cookie fallback ---
if (-not $cookieString) {
    Write-Host ""
    Write-Host "=== Manual Cookie Fallback ===" -ForegroundColor Cyan
    Write-Host "1. Open Chrome -> sap.service-now.com (make sure you're logged in)" -ForegroundColor White
    Write-Host "2. Press F12 -> Application tab -> Cookies -> sap.service-now.com" -ForegroundColor White
    Write-Host "3. Copy the full cookie string (or at least JSESSIONID / glide_user_session)" -ForegroundColor White
    Write-Host ""
    $cookieString = Read-Host "Paste cookie value here (format: name=value; name2=value2)"
    if (-not $cookieString) {
        Write-Host "No cookie provided. Exiting." -ForegroundColor Red
        exit 1
    }
}

# --- Step 6: Test API call ---
Write-Host ""
Write-Host "[5] Testing ServiceNow Table API..." -ForegroundColor Yellow

$fields = "number,short_description,state,priority,category,assigned_to,opened_at,sys_updated_on,sys_id"
$query  = "active=true^assigned_to=javascript:gs.getUserID()"
$url    = "$baseUrl`?sysparm_query=$query&sysparm_fields=$fields&sysparm_limit=5&sysparm_display_value=true"

Write-Host "    URL: $url" -ForegroundColor DarkGray

try {
    $headers = @{
        "Cookie" = $cookieString
        "Accept" = "application/json"
    }
    $response = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 15

    if ($response.result) {
        Write-Host "    SUCCESS - Got $($response.result.Count) incident(s)" -ForegroundColor Green
        Write-Host ""
        foreach ($inc in $response.result) {
            $state = $inc.state
            $prio  = $inc.priority
            $desc  = if ($inc.short_description.Length -gt 60) { $inc.short_description.Substring(0,60) + "..." } else { $inc.short_description }
            Write-Host "    [$($inc.number)] $desc" -ForegroundColor White
            Write-Host "      State: $state | Priority: $prio | Category: $($inc.category)" -ForegroundColor DarkGray
            Write-Host "      Assigned: $($inc.assigned_to) | Opened: $($inc.opened_at)" -ForegroundColor DarkGray
            Write-Host "      sys_id: $($inc.sys_id)" -ForegroundColor DarkGray
            Write-Host ""
        }
    } else {
        Write-Host "    No results returned (or empty result set)" -ForegroundColor Yellow
        Write-Host "    Raw response:" -ForegroundColor DarkGray
        Write-Host ($response | ConvertTo-Json -Depth 3) -ForegroundColor DarkGray
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "    FAILED: HTTP $statusCode - $($_.Exception.Message)" -ForegroundColor Red
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Write-Host "    -> Cookie expired or invalid. Please re-login in browser." -ForegroundColor Yellow
    }
}

# Cleanup temp files
Remove-Item $tempDb -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\read_chrome_cookies.js" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\decrypt_cookie.js" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
