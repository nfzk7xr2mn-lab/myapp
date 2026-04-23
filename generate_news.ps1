# generate_news.ps1 - Fetch good news from squirrel-news.net and summarize via LLM
# Usage: generate_news.ps1 [-force]

param([switch]$force)

. "$PSScriptRoot\secrets.ps1"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir  = Join-Path $scriptDir "knowledge"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

$newsPath = Join-Path $outputDir "news.json"
$today    = (Get-Date).ToString("yyyy-MM-dd")

if (-not $force -and (Test-Path $newsPath)) {
    try {
        $existing = Get-Content $newsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existing.date -eq $today) {
            Write-Host "News fuer heute bereits vorhanden - uebersprungen." -ForegroundColor Yellow
            exit
        }
    } catch {}
}

# 1. Scrape squirrel-news.net
Write-Host "Fetching squirrel-news.net..." -ForegroundColor Cyan
try {
    $html = (Invoke-WebRequest -Uri "https://squirrel-news.net/de/" -TimeoutSec 30 -UseBasicParsing).Content
} catch {
    Write-Warning "Squirrel News abruf fehlgeschlagen: $_"
    exit 1
}

# Extract text between <h2>, <h3>, <p> tags (headlines + teasers)
$headlines = [regex]::Matches($html, '<h[23][^>]*>(.*?)</h[23]>', 'Singleline') |
    ForEach-Object { $_.Groups[1].Value -replace '<[^>]+>','' -replace '&amp;','&' -replace '&nbsp;',' ' -replace '\s+',' ' } |
    Where-Object { $_.Trim().Length -gt 10 } |
    Select-Object -First 30

if (-not $headlines -or $headlines.Count -eq 0) {
    Write-Warning "Keine Schlagzeilen gefunden."
    exit 1
}

$headlineText = ($headlines | ForEach-Object { "- $_" }) -join "`n"
Write-Host "Gefunden: $($headlines.Count) Schlagzeilen" -ForegroundColor Green

# 2. Summarize via Claude API
$prompt = @"
Hier sind aktuelle Good-News-Schlagzeilen von squirrel-news.net:

$headlineText

Fasse diese zu 3-5 kurzen, positiven Bullets zusammen. Jedes Bullet: ein passendes Emoji + Doppelpunkt + ein Satz (max 15 Woerter). Antwort NUR als JSON-Array von Strings, z.B. ["item1","item2"]. Kein Markdown, keine Erklaerung, kein Codeblock.
"@

$body = [ordered]@{
    model      = "anthropic--claude-sonnet-latest"
    max_tokens = 512
    messages   = @(
        [ordered]@{
            role    = "user"
            content = $prompt
        }
    )
}
$bodyJson = $body | ConvertTo-Json -Depth 5 -Compress

try {
    $response = Invoke-RestMethod `
        -Uri $ProxyUri `
        -Method POST `
        -TimeoutSec 60 `
        -Headers @{
            "x-api-key"         = $ApiKey
            "anthropic-version" = "2023-06-01"
            "Content-Type"      = "application/json; charset=utf-8"
        } `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson))
} catch {
    Write-Warning "API-Aufruf fehlgeschlagen: $_"
    exit 1
}

if (-not $response.content -or -not $response.content[0].text) {
    Write-Warning "Unerwartete Antwort"
    exit 1
}

$raw = $response.content[0].text.Trim()
$raw = $raw -replace '^\s*```json\s*', '' -replace '\s*```\s*$', ''

try {
    $parsed = $raw | ConvertFrom-Json
} catch {
    Write-Warning "JSON-Parse fehlgeschlagen: $raw"
    exit 1
}

if ($parsed -isnot [System.Array]) {
    Write-Warning "Erwartetes Array, erhalten: $raw"
    exit 1
}

$ts = [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds)
$itemsJson = ($parsed | ForEach-Object { '"' + ($_ -replace '\\','\\' -replace '"','\"') + '"' }) -join ','
$json = '{"date":"' + $today + '","items":[' + $itemsJson + '],"ts":' + $ts + '}'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($newsPath, $json, $utf8NoBom)
Write-Host "News geschrieben: $($parsed.Count) Items" -ForegroundColor Green
