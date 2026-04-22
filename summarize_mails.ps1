# Summarize today's mails via local Anthropic proxy
# Triggered on demand via write-server POST /run-summarize

. "$PSScriptRoot\secrets.ps1"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir  = Join-Path $scriptDir "data"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

if (Test-Path "C:\Temp\myapp-modal.lock") {
    Write-Host "Modal offen - Zusammenfassung uebersprungen." -ForegroundColor Yellow
    exit
}

$mailsFile   = Join-Path $outputDir "mails_today.json"
$kw          = Get-Date -UFormat "%V"
$summaryFile = Join-Path $outputDir "summary_KW$kw.json"

$mails = Get-Content $mailsFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $mails) {
    $ts = [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds)
    "{`"summary`":`"Keine Mails gefunden.`",`"ts`":$ts}" | Set-Content $summaryFile -Encoding UTF8
    exit
}

function Get-ShortName($full) {
    if (-not $full) { return '' }
    $trimmed = $full.Trim()
    if ($trimmed -match '^DL\s' -or $trimmed -match '[_\d]') { return $trimmed }
    if ($trimmed -match '^([^,]+),\s*(.+)$') {
        $last  = $Matches[1].Trim()
        $first = $Matches[2].Trim().Split(' ')[0]
        return "$first $($last[0].ToString().ToUpper())."
    }
    $parts = $trimmed -split '\s+'
    if ($parts.Count -eq 1) { return $parts[0] }
    return "$($parts[0]) $($parts[-1][0].ToString().ToUpper())."
}

$mailText = ($mails | ForEach-Object {
    $name     = Get-ShortName $_.from
    $richtung = if ($_.typ -eq 'gesendet') { "GESENDET AN: $(Get-ShortName ($_.to -split ';')[0])" } else { "VON: $name" }
    $auftrag  = if ($_.auftrag) { ' [AUFTRAG]' } else { '' }
    "[$($_.date) $($_.time)] $richtung | $($_.subject)$auftrag"
}) -join "`n"

$body = [ordered]@{
    model      = "anthropic--claude-sonnet-latest"
    max_tokens = 2048
    messages   = @(
        [ordered]@{
            role    = "user"
            content = "Fasse die Mails dieser Arbeitswoche zusammen. GESENDET-Mails sind meine eigenen gesendeten Nachrichten - beruecksichtige sie gleichwertig. [AUFTRAG]-Mails enthalten Aufgaben. Gruppiere nach Thema. Liste am Ende offene Auftraege separat. Deutsch, kompakt. Personennamen kursiv (*Name*).`n`n$mailText"
        }
    )
}
$bodyJson = $body | ConvertTo-Json -Depth 5 -Compress

$response = Invoke-RestMethod `
    -Uri $ProxyUri `
    -Method POST `
    -TimeoutSec 120 `
    -Headers @{
        "x-api-key"         = $ApiKey
        "anthropic-version" = "2023-06-01"
        "Content-Type"      = "application/json; charset=utf-8"
    } `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson))

if (-not $response.content -or -not $response.content[0].text) {
    $debugFile = Join-Path $outputDir "summary_debug.json"
    $response | ConvertTo-Json -Depth 10 | Set-Content $debugFile -Encoding UTF8
    Write-Warning "Unexpected response - see $debugFile"
    exit
}

$summary   = $response.content[0].text
$ts        = [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($summaryFile, (@{summary=$summary; ts=$ts} | ConvertTo-Json), $utf8NoBom)
Write-Host "Summary written to $summaryFile"
