# sync_jira.ps1 -- Fetch Jira issues via SAP MCP proxy
# Writes data/jira.json. Triggered by Task Scheduler + on-demand via write-server.
# Uses OAuth refresh-token flow to get a fresh access token, then calls
# the MCP JSON-RPC endpoint (jira_search) to fetch open issues.

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8        = New-Object System.Text.UTF8Encoding $false
$outFile     = Join-Path $scriptDir "data\jira.json"
$statusFile  = Join-Path $scriptDir "data\jira_status.json"

function Write-JiraStatus($obj) {
    $j = $obj | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($statusFile, $j, $utf8)
}

# Skip if modal is open
if (Test-Path "C:\Temp\myapp-modal.lock") { exit 0 }

# ── Config ────────────────────────────────────────────────────────────────────

$ClientId       = "PSNIs0bYQwTCyQ1YBSxsyKrrQjuyM8r7"
$TokenEndpoint  = "https://mcp.jira.tools.sap/token"
$McpEndpoint    = "https://mcp.jira.tools.sap/mcp"
$RefreshFile    = Join-Path $env:USERPROFILE ".claude\sap-jira-refresh-token.sh"
$JiraUser       = "d025095"

# ── 1. Get fresh access token via refresh token ──────────────────────────────

if (-not (Test-Path $RefreshFile)) {
    Write-Host "Refresh token file not found: $RefreshFile"
    Write-JiraStatus @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "No refresh token. Run Setup first." }
    exit 1
}

$refreshToken = (Get-Content $RefreshFile -Raw).Trim()
if (-not $refreshToken) {
    Write-Host "Refresh token file is empty."
    Write-JiraStatus @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "Refresh token empty. Run Setup." }
    exit 1
}

try {
    $tokenBody = "grant_type=refresh_token&refresh_token=$refreshToken&client_id=$ClientId"
    $tokenResp = Invoke-RestMethod -Uri $TokenEndpoint -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body $tokenBody -TimeoutSec 15
} catch {
    Write-Host "Token refresh failed: $_"
    Write-JiraStatus @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "Token expired. Run Setup." }
    exit 1
}

$accessToken = $tokenResp.access_token
$newRefresh  = $tokenResp.refresh_token

if (-not $accessToken) {
    Write-Host "No access token received."
    Write-JiraStatus @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "No access token. Run Setup." }
    exit 1
}

# Save new refresh token for next run
if ($newRefresh) {
    [System.IO.File]::WriteAllText($RefreshFile, $newRefresh, $utf8)
}

# ── 2. Call MCP jira_search via JSON-RPC ─────────────────────────────────────

$jql = "assignee = $JiraUser AND resolution = Unresolved ORDER BY updated DESC"
$mcpBody = @{
    jsonrpc = "2.0"
    id      = 1
    method  = "tools/call"
    params  = @{
        name      = "jira_search"
        arguments = @{
            jql    = $jql
            fields = "summary,status,priority,issuetype,project,duedate,updated,fixVersions"
            limit  = 50
        }
    }
} | ConvertTo-Json -Depth 5

$mcpHeaders = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

try {
    $mcpRaw = Invoke-WebRequest -Uri $McpEndpoint -Method Post `
        -Headers $mcpHeaders -Body $mcpBody -TimeoutSec 30 -UseBasicParsing
} catch {
    Write-Host "MCP call failed: $_"
    Write-JiraStatus @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "MCP call failed" }
    exit 1
}

# Response is SSE format: "event: message\ndata: {...}"
$rawText = $mcpRaw.Content
$dataLine = ($rawText -split "`n" | Where-Object { $_ -match "^data: " }) -replace "^data: ", ""
$mcpResult = $dataLine | ConvertFrom-Json

if ($mcpResult.error) {
    Write-Host "MCP error: $($mcpResult.error.message)"
    Write-JiraStatus @{ status = "error"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = "MCP error" }
    exit 1
}

$resultText = $mcpResult.result.content[0].text
$searchResult = $resultText | ConvertFrom-Json

# ── 3. Map personal items to dashboard format ───────────────────────────

$items = @()
foreach ($issue in $searchResult.issues) {
    if ($issue.status.name -eq 'Done' -or $issue.status.name -eq 'Closed') { continue }
    $dueRaw = $issue.duedate
    $due = ""
    if ($dueRaw) {
        try {
            $d = [datetime]::ParseExact($dueRaw, "yyyy-MM-dd", $null)
            $due = $d.ToString("dd.MM.yyyy")
        } catch { $due = $dueRaw }
    }
    $updRaw = $issue.updated
    $upd = ""
    if ($updRaw) {
        try {
            $u = [datetime]::Parse($updRaw)
            $upd = $u.ToString("dd.MM.yyyy")
        } catch { $upd = "" }
    }
    $items += @{
        key      = $issue.key
        summary  = $issue.summary
        status   = $issue.status.name
        priority = $issue.priority.name
        type     = $issue.issue_type.name
        project  = $issue.project.key
        due      = $due
        updated  = $upd
        url      = "https://jira.tools.sap/browse/$($issue.key)"
    }
}

# ── 4. Load existing jira.json for category preservation ───────────────

$existing = @()
if (Test-Path $outFile) {
    try {
        $raw = Get-Content $outFile -Raw -Encoding UTF8
        $existing = $raw | ConvertFrom-Json
    } catch { $existing = @() }
}

$metaMap = @{}
foreach ($old in $existing) {
    if ($old.category) {
        $metaMap[$old.key] = @{ category = $old.category }
    }
}

# ── 5. SL Toolset: fetch open items with fixVersion from specific projects ─

$toolsetJql = "project in (CLMCONSUMABILITY, CLMOQHEC, HECSPCVAL) AND fixVersion is not EMPTY AND resolution = Unresolved ORDER BY updated DESC"
$toolsetBody = @{
    jsonrpc = "2.0"
    id      = 2
    method  = "tools/call"
    params  = @{
        name      = "jira_search"
        arguments = @{
            jql    = $toolsetJql
            fields = "summary,status,priority,issuetype,project,fixVersions,updated"
            limit  = 100
        }
    }
} | ConvertTo-Json -Depth 5

$toolsetItems = @()
try {
    $tsRaw = Invoke-WebRequest -Uri $McpEndpoint -Method Post `
        -Headers $mcpHeaders -Body $toolsetBody -TimeoutSec 30 -UseBasicParsing
    $tsDataLine = ($tsRaw.Content -split "`n" | Where-Object { $_ -match "^data: " }) -replace "^data: ", ""
    $tsResult = $tsDataLine | ConvertFrom-Json
    $tsText = $tsResult.result.content[0].text
    $tsSearch = $tsText | ConvertFrom-Json

    foreach ($issue in $tsSearch.issues) {
        $updRaw2 = $issue.updated
        $upd2 = ""
        if ($updRaw2) {
            try { $upd2 = ([datetime]::Parse($updRaw2)).ToString("dd.MM.yyyy") } catch { $upd2 = "" }
        }
        # Extract release numbers from fix_versions (e.g. "SL Toolset for Cloud 2604 (T2026.15)" -> "2604")
        $releases = @()
        if ($issue.fix_versions) {
            foreach ($fv in $issue.fix_versions) {
                if ($fv -match '(\d{4})') { $releases += $Matches[1] }
            }
        }
        if ($releases.Count -eq 0) { continue }
        # Derive category from project + release count
        $proj = $issue.project.key
        $cat = ''
        if ($proj -eq 'HECSPCVAL') { $cat = 'SLV' }
        elseif ($proj -eq 'CLMOQHEC' -and $releases.Count -gt 1) { $cat = 'RAMP' }
        elseif ($proj -eq 'CLMOQHEC') { $cat = 'REGR' }
        elseif ($proj -eq 'CLMCONSUMABILITY') { $cat = 'RAMP' }
        # Preserve manually set category from existing data
        $oldMeta = $metaMap[$issue.key]
        if ($oldMeta -and $oldMeta.category) { $cat = $oldMeta.category }
        $toolsetItems += @{
            key      = $issue.key
            summary  = $issue.summary
            status   = $issue.status.name
            priority = $issue.priority.name
            type     = $issue.issue_type.name
            project  = $proj
            updated  = $upd2
            url      = "https://jira.tools.sap/browse/$($issue.key)"
            releases = $releases
            category = $cat
        }
    }
    Write-Host "Toolset fetch: $($toolsetItems.Count) open issues from Jira"
} catch {
    Write-Host "Toolset query failed (non-fatal): $_"
}

# ── 6. Build final JSON manually (ConvertTo-Json array bug workaround) ──

$allItems = $items + $toolsetItems
$totalCount = $allItems.Count

Write-Host "Jira sync: $($items.Count) personal + $($toolsetItems.Count) toolset = $totalCount total"

$jsonParts = @()
foreach ($it in $allItems) {
    $parts = @()
    $parts += '    "key": "' + $it.key + '"'
    $parts += '    "summary": "' + ($it.summary -replace '\\', '\\\\' -replace '"', '\"') + '"'
    $parts += '    "status": "' + $it.status + '"'
    $parts += '    "priority": "' + $it.priority + '"'
    $parts += '    "type": "' + $it.type + '"'
    $parts += '    "project": "' + $it.project + '"'
    $parts += '    "updated": "' + $it.updated + '"'
    $parts += '    "url": "' + $it.url + '"'
    if ($it.due) { $parts += '    "due": "' + $it.due + '"' }
    if ($it.releases -and $it.releases.Count -gt 0) {
        $relJson = ($it.releases | ForEach-Object { '"' + $_ + '"' }) -join ', '
        $parts += '    "releases": [' + $relJson + ']'
    }
    if ($it.category) {
        $parts += '    "category": "' + $it.category + '"'
    }
    $jsonParts += "  {`n" + ($parts -join ",`n") + "`n  }"
}
$finalJson = "[`n" + ($jsonParts -join ",`n") + "`n]"

$utf8noBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outFile, $finalJson, $utf8noBom)

Write-JiraStatus @{ status = "ok"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); count = $totalCount }
Write-Host "Jira sync: $totalCount issues written to jira.json"
