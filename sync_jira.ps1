# sync_jira.ps1 -- Fetch Jira issues via SAP MCP proxy
# Writes data/jira.json. Triggered by Task Scheduler + on-demand via write-server.
# Uses OAuth refresh-token flow to get a fresh access token, then calls
# the MCP JSON-RPC endpoint (jira_search) to fetch open issues.

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8        = New-Object System.Text.UTF8Encoding $false
$outFile     = Join-Path $scriptDir "data\jira.json"
$toolsetFile = Join-Path $scriptDir "data\jira_toolset.json"
$statusFile  = Join-Path $scriptDir "data\jira_status.json"

function Write-JiraStatus($obj) {
    $j = $obj | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($statusFile, $j, $utf8)
}

function Escape-JsonString($s) {
    if (-not $s) { return '' }
    $s = $s -replace '\\', '\\\\'
    $s = $s -replace '"', '\"'
    $s = $s -replace "`r`n", '\n'
    $s = $s -replace "`r", '\n'
    $s = $s -replace "`n", '\n'
    $s = $s -replace "`t", '\t'
    $s = $s -replace '[\x00-\x1f]', ''
    return $s
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

$jql = "assignee = $JiraUser AND updated >= '2025-10-01' ORDER BY updated DESC"
$mcpBody = @{
    jsonrpc = "2.0"
    id      = 1
    method  = "tools/call"
    params  = @{
        name      = "jira_search"
        arguments = @{
            jql    = $jql
            fields = "summary,status,priority,issuetype,project,duedate,updated,fixVersions,labels"
            limit  = 50
        }
    }
} | ConvertTo-Json -Depth 5

$mcpHeaders = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

function Invoke-ToolsetQuery($jql, $queryId) {
    $tqArgs = @{
        jql    = $jql
        fields = "summary,status,priority,issuetype,project,fixVersions,updated,labels"
        limit  = 50
    }
    $tqBody = @{
        jsonrpc = "2.0"
        id      = $queryId
        method  = "tools/call"
        params  = @{
            name      = "jira_search"
            arguments = $tqArgs
        }
    } | ConvertTo-Json -Depth 5
    $tqRaw = Invoke-WebRequest -Uri $McpEndpoint -Method Post `
        -Headers $mcpHeaders -Body $tqBody -TimeoutSec 30 -UseBasicParsing
    $tqRawText = $tqRaw.Content
    $tqDataLine = ($tqRawText -split "`n" | Where-Object { $_ -match "^data: " }) -replace "^data: ", ""
    if (-not $tqDataLine) { return @{ issues = @(); total = 0 } }
    $tqResult = $tqDataLine | ConvertFrom-Json
    if ($tqResult.result.isError) {
        $tqErrText = $tqResult.result.content[0].text
        Write-Host "    MCP error: $tqErrText"
        return @{ issues = @(); total = 0 }
    }
    $tqText = $tqResult.result.content[0].text
    return ($tqText | ConvertFrom-Json)
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

$toolsetProjectKeys = @('CLMOQHEC', 'HECSPCVAL', 'CLMCONSUMABILITY')
$items = @()
foreach ($issue in $searchResult.issues) {
    $st = $issue.status.name
    $isClosed = ($st -eq 'Done' -or $st -eq 'Closed' -or $st -eq 'Completed' -or $st -eq 'Finished' -or $st -eq 'Cancelled' -or $st -eq 'Stopped' -or $st -eq 'Rejected' -or $st -eq 'Inactive')
    if ($isClosed -and $toolsetProjectKeys -notcontains $issue.project.key) { continue }
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
    $pCat = ''
    $pLabels = @()
    if ($issue.labels) { $pLabels = @($issue.labels) }
    if ($pLabels -contains 'Ramp-up') { $pCat = 'RAMP' }
    elseif ($pLabels -contains 'Regression') { $pCat = 'REGR' }
    $pReleases = @()
    if ($issue.fix_versions) {
        foreach ($fv in $issue.fix_versions) {
            if ($fv -match 'SL Toolset for Cloud' -and $fv -match '(\d{4})') { $pReleases += $Matches[1] }
        }
    }
    if ($pReleases.Count -eq 0 -and $issue.summary -match '\b(\d{4})\b') {
        $pReleases += $Matches[1]
    }
    $proj = $issue.project.key
    if (-not $pCat -and $proj -eq 'HECSPCVAL') { $pCat = 'SLV' }
    elseif (-not $pCat -and $proj -eq 'CLMOQHEC' -and $pReleases.Count -gt 1) { $pCat = 'RAMP' }
    elseif (-not $pCat -and $proj -eq 'CLMOQHEC') { $pCat = 'REGR' }
    elseif (-not $pCat -and $proj -eq 'CLMCONSUMABILITY') { $pCat = 'RAMP' }
    $item = @{
        key      = $issue.key
        summary  = $issue.summary
        status   = $issue.status.name
        priority = $issue.priority.name
        type     = $issue.issue_type.name
        project  = $proj
        due      = $due
        updated  = $upd
        url      = "https://jira.tools.sap/browse/$([Uri]::EscapeDataString($issue.key))"
        category = $pCat
        personal = $true
    }
    if ($pReleases.Count -gt 0) { $item.releases = $pReleases }
    $items += $item
}

# ── 3b. Fetch personal Toolset scope items (older ones cut off by 50-limit) ──

$personalSeen = @{}
foreach ($it in $items) { $personalSeen[$it.key] = $true }

$scopeWindows = @(
    @{ from = "2026-04-01"; label = "Scope Apr 2026+" },
    @{ from = "2026-03-01"; to = "2026-03-31"; label = "Scope Maerz 2026" },
    @{ from = "2026-02-01"; to = "2026-02-28"; label = "Scope Feb 2026" },
    @{ from = "2026-01-01"; to = "2026-01-31"; label = "Scope Jan 2026" },
    @{ from = "2025-12-01"; to = "2025-12-31"; label = "Scope Dez 2025" },
    @{ from = "2025-11-01"; to = "2025-11-30"; label = "Scope Nov 2025" },
    @{ from = "2025-10-01"; to = "2025-10-31"; label = "Scope Okt 2025" }
)
$scopeQId = 200
foreach ($sw in $scopeWindows) {
    $dateFilter = "updated >= '$($sw.from)'"
    if ($sw.to) { $dateFilter = "updated >= '$($sw.from)' AND updated <= '$($sw.to)'" }
    $scopeJql = "assignee = $JiraUser AND $dateFilter ORDER BY updated DESC"
    try {
        $scopeResult = Invoke-ToolsetQuery $scopeJql $scopeQId
        $scopeQId++
        $fetched = 0
        if ($scopeResult.issues) {
            foreach ($issue in $scopeResult.issues) {
                if ($personalSeen[$issue.key]) { continue }
                $personalSeen[$issue.key] = $true
                $fetched++
                $updRaw3 = $issue.updated
                $upd3 = ""
                if ($updRaw3) { try { $upd3 = ([datetime]::Parse($updRaw3)).ToString("dd.MM.yyyy") } catch { $upd3 = "" } }
                $sLabels = @()
                if ($issue.labels) { $sLabels = @($issue.labels) }
                $sCat = ''
                $sProj = $issue.project.key
                if ($sLabels -contains 'Ramp-up') { $sCat = 'RAMP' }
                elseif ($sLabels -contains 'Regression') { $sCat = 'REGR' }
                elseif ($sProj -eq 'HECSPCVAL') { $sCat = 'SLV' }
                elseif ($sProj -eq 'CLMOQHEC') { $sCat = 'REGR' }
                elseif ($sProj -eq 'CLMCONSUMABILITY') { $sCat = 'RAMP' }
                $sReleases = @()
                if ($issue.fix_versions) {
                    foreach ($fv in $issue.fix_versions) {
                        if ($fv -match 'SL Toolset for Cloud' -and $fv -match '(\d{4})') { $sReleases += $Matches[1] }
                    }
                }
                if ($sReleases.Count -eq 0 -and $issue.summary -match '\b(\d{4})\b') {
                    $sReleases += $Matches[1]
                }
                if ($sReleases.Count -eq 0 -and -not $sCat) { continue }
                $sItem = @{
                    key      = $issue.key
                    summary  = $issue.summary
                    status   = $issue.status.name
                    priority = $issue.priority.name
                    type     = $issue.issue_type.name
                    project  = $sProj
                    updated  = $upd3
                    url      = "https://jira.tools.sap/browse/$([Uri]::EscapeDataString($issue.key))"
                    category = $sCat
                    personal = $true
                }
                if ($sReleases.Count -gt 0) { $sItem.releases = $sReleases }
                $items += $sItem
            }
        }
        Write-Host "  $($sw.label): $fetched new items"
    } catch {
        Write-Host "  $($sw.label): query failed - $($_.Exception.Message)"
    }
}
Write-Host "Personal total: $($items.Count) items (incl. scope)"

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

# ── 5. SL Toolset: fetch items from specific projects (open + recently closed) ─
# MCP proxy has a 50-item server-side limit, so we paginate with startAt.

$toolsetJqlLabels = "project in (CLMCONSUMABILITY, CLMOQHEC, HECSPCVAL) AND fixVersion is EMPTY AND labels in (Regression, Ramp-up) AND updated >= '2025-10-01' ORDER BY updated DESC"

$toolsetItems = @()
try {
    $allIssues = @()
    $seen = @{}
    $qId = 2

    # Split by time to stay under 50-item MCP limit per query
    $timeWindows = @(
        @{ from = "2026-03-01"; label = "2026 Maerz+" },
        @{ from = "2026-01-01"; to = "2026-02-28"; label = "2026 Jan-Feb" },
        @{ from = "2025-10-01"; to = "2025-12-31"; label = "Q4/2025" }
    )
    foreach ($tw in $timeWindows) {
        $dateFilter = "updated >= '$($tw.from)'"
        if ($tw.to) { $dateFilter = "updated >= '$($tw.from)' AND updated <= '$($tw.to)'" }
        $jql = "project in (CLMCONSUMABILITY, CLMOQHEC, HECSPCVAL) AND fixVersion is not EMPTY AND $dateFilter ORDER BY updated DESC"
        try {
            $sr = Invoke-ToolsetQuery $jql $qId
            $qId++
            $fetched = 0
            if ($sr.issues) {
                foreach ($issue in $sr.issues) {
                    if (-not $seen[$issue.key]) { $seen[$issue.key] = $true; $allIssues += $issue; $fetched++ }
                }
            }
            Write-Host "  $($tw.label): $fetched items"
        } catch {
            Write-Host "  $($tw.label): query failed - $($_.Exception.Message)"
        }
    }

    # Label-only items (no fixVersion)
    try {
        $srL = Invoke-ToolsetQuery $toolsetJqlLabels $qId
        $countL = 0
        if ($srL.issues) {
            foreach ($issue in $srL.issues) {
                if (-not $seen[$issue.key]) { $seen[$issue.key] = $true; $allIssues += $issue; $countL++ }
            }
        }
        Write-Host "  Labels only: $countL items"
    } catch {
        Write-Host "  Labels query failed (non-fatal): $($_.Exception.Message)"
    }

    Write-Host "Toolset total: $($allIssues.Count) unique issues"

    $debugLog = Join-Path $scriptDir "data\jira_debug_fv.log"
    $debugLines = @()
    foreach ($issue in $allIssues) {
        $updRaw2 = $issue.updated
        $upd2 = ""
        if ($updRaw2) {
            try { $upd2 = ([datetime]::Parse($updRaw2)).ToString("dd.MM.yyyy") } catch { $upd2 = "" }
        }
        $fvAll = @()
        if ($issue.fix_versions) { $fvAll = @($issue.fix_versions) }
        $debugLines += "$($issue.key) | $($issue.status.name) | FV: $($fvAll -join ' ; ') | Labels: $($issue.labels -join ',')"
        # Extract release numbers from fix_versions (e.g. "D_SL Toolset for Cloud 2604 (T2026.15)" -> "2604")
        $releases = @()
        if ($issue.fix_versions) {
            foreach ($fv in $issue.fix_versions) {
                if ($fv -match 'SL Toolset for Cloud' -and $fv -match '(\d{4})') { $releases += $Matches[1] }
            }
        }
        # Fallback: extract 4-digit release from summary (e.g. "V2604" or "(2604)")
        if ($releases.Count -eq 0 -and $issue.summary -match '\b(\d{4})\b') {
            $releases += $Matches[1]
        }
        # Derive category from project + labels
        $proj = $issue.project.key
        $cat = ''
        $labels = @()
        if ($issue.labels) { $labels = @($issue.labels) }
        if ($proj -eq 'HECSPCVAL') { $cat = 'SLV' }
        elseif ($labels -contains 'Ramp-up') { $cat = 'RAMP' }
        elseif ($labels -contains 'Regression') { $cat = 'REGR' }
        elseif ($proj -eq 'CLMOQHEC' -and $releases.Count -gt 1) { $cat = 'RAMP' }
        elseif ($proj -eq 'CLMOQHEC') { $cat = 'REGR' }
        elseif ($proj -eq 'CLMCONSUMABILITY') { $cat = 'RAMP' }
        # Skip items with no release and no relevant category
        if ($releases.Count -eq 0 -and -not $cat) { continue }
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
            url      = "https://jira.tools.sap/browse/$([Uri]::EscapeDataString($issue.key))"
            releases = $releases
            category = $cat
        }
    }
    [System.IO.File]::WriteAllText($debugLog, ($debugLines -join "`r`n"), $utf8)
    Write-Host "Toolset fetch: $($toolsetItems.Count) open issues from Jira (debug log: $debugLog)"
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
    $parts += '    "key": "' + (Escape-JsonString $it.key) + '"'
    $parts += '    "summary": "' + (Escape-JsonString $it.summary) + '"'
    $parts += '    "status": "' + (Escape-JsonString $it.status) + '"'
    $parts += '    "priority": "' + (Escape-JsonString $it.priority) + '"'
    $parts += '    "type": "' + (Escape-JsonString $it.type) + '"'
    $parts += '    "project": "' + (Escape-JsonString $it.project) + '"'
    $parts += '    "updated": "' + (Escape-JsonString $it.updated) + '"'
    $parts += '    "url": "' + (Escape-JsonString $it.url) + '"'
    if ($it.due) { $parts += '    "due": "' + (Escape-JsonString $it.due) + '"' }
    if ($it.releases -and $it.releases.Count -gt 0) {
        $relJson = ($it.releases | ForEach-Object { '"' + (Escape-JsonString $_) + '"' }) -join ', '
        $parts += '    "releases": [' + $relJson + ']'
    }
    if ($it.category) {
        $parts += '    "category": "' + (Escape-JsonString $it.category) + '"'
    }
    if ($it.personal) {
        $parts += '    "personal": true'
    }
    $jsonParts += "  {`n" + ($parts -join ",`n") + "`n  }"
}
$finalJson = "[`n" + ($jsonParts -join ",`n") + "`n]"

$utf8noBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outFile, $finalJson, $utf8noBom)

# ── 7. Write jira_toolset.json (toolset items only, complete rewrite) ──

if ($toolsetItems.Count -gt 0) {
    $tsParts = @()
    foreach ($it in $toolsetItems) {
        $parts = @()
        $parts += '    "key": "' + (Escape-JsonString $it.key) + '"'
        $parts += '    "summary": "' + (Escape-JsonString $it.summary) + '"'
        $parts += '    "status": "' + (Escape-JsonString $it.status) + '"'
        $parts += '    "priority": "' + (Escape-JsonString $it.priority) + '"'
        $parts += '    "type": "' + (Escape-JsonString $it.type) + '"'
        $parts += '    "project": "' + (Escape-JsonString $it.project) + '"'
        $parts += '    "updated": "' + (Escape-JsonString $it.updated) + '"'
        $parts += '    "url": "' + (Escape-JsonString $it.url) + '"'
        if ($it.releases -and $it.releases.Count -gt 0) {
            $relJson = ($it.releases | ForEach-Object { '"' + (Escape-JsonString $_) + '"' }) -join ', '
            $parts += '    "releases": [' + $relJson + ']'
        }
        if ($it.category) {
            $parts += '    "category": "' + (Escape-JsonString $it.category) + '"'
        }
        $tsParts += "  {`n" + ($parts -join ",`n") + "`n  }"
    }
    $tsJson = "[`n" + ($tsParts -join ",`n") + "`n]"
    [System.IO.File]::WriteAllText($toolsetFile, $tsJson, $utf8noBom)
    Write-Host "Toolset file written: $($toolsetItems.Count) items"
}

Write-JiraStatus @{ status = "ok"; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); count = $totalCount }
Write-Host "Jira sync: $totalCount issues written to jira.json"
