# Summarize today's mails via local Anthropic proxy
# Runs every minute via Task Scheduler; regenerates summary for current calendar week

. "$PSScriptRoot\secrets.ps1"

$outputDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mailsFile  = Join-Path $outputDir "mails_heute.json"

# Calendar week number
$kw = Get-Date -UFormat "%V"
$summaryFile = Join-Path $outputDir "summary_KW$kw.json"

# Read mails
$mails = Get-Content $mailsFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $mails) {
    $ts = [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds)
    "{`"summary`":`"Keine Mails gefunden.`",`"ts`":$ts}" | Set-Content $summaryFile -Encoding UTF8
    exit
}

function Get-ShortName($full) {
    if (-not $full) { return '' }
    $trimmed = $full.Trim()
    # DL/group: starts with "DL " or contains _ or digits → show as-is
    if ($trimmed -match '^DL\s' -or $trimmed -match '[_\d]') { return $trimmed }
    # "Nachname, Vorname" format
    if ($trimmed -match '^([^,]+),\s*(.+)$') {
        $last  = $Matches[1].Trim()
        $first = $Matches[2].Trim().Split(' ')[0]
        return "$first $($last[0].ToString().ToUpper())."
    }
    # "Vorname Nachname" format
    $parts = $trimmed -split '\s+'
    if ($parts.Count -eq 1) { return $parts[0] }
    $first = $parts[0]
    $lastInitial = $parts[-1][0].ToString().ToUpper()
    return "$first $lastInitial."
}

$mailText = ($mails | ForEach-Object {
    $name = Get-ShortName $_.from
    "[$($_.date) $($_.time)] Von: $name | Betreff: $($_.subject)"
}) -join "`n"

$body = [ordered]@{
    model      = "anthropic--claude-sonnet-latest"
    max_tokens = 1024
    messages   = @(
        [ordered]@{
            role    = "user"
            content = "Fasse die folgenden Mails der Arbeitswoche kurz zusammen. Gruppiere nach Thema, hebe wichtige Action Items hervor. Antworte auf Deutsch, kompakt. Schreibe Personennamen immer kursiv im Markdown-Format (*Name*).`n`n$mailText"
        }
    )
}
$bodyJson = $body | ConvertTo-Json -Depth 5 -Compress

$response = Invoke-RestMethod `
    -Uri $ProxyUri `
    -Method POST `
    -Headers @{
        "x-api-key"         = $ApiKey
        "anthropic-version" = "2023-06-01"
        "Content-Type"      = "application/json; charset=utf-8"
    } `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson))

# Debug: log full response if content is missing
if (-not $response.content -or -not $response.content[0].text) {
    $debugFile = Join-Path $outputDir "summary_debug.json"
    $response | ConvertTo-Json -Depth 10 | Set-Content $debugFile -Encoding UTF8
    Write-Warning "Unexpected response - see $debugFile"
    exit
}

$summary = $response.content[0].text
$ts = [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($summaryFile, (@{summary=$summary; ts=$ts} | ConvertTo-Json), $utf8NoBom)
Write-Host "Summary written to $summaryFile"
