# generate_quote.ps1 - Generate a daily quote from classical German literature via LLM
# Usage: generate_quote.ps1 [-force]

param([switch]$force)

. "$PSScriptRoot\secrets.ps1"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir  = Join-Path $scriptDir "knowledge"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

$quotePath = Join-Path $outputDir "quotes.json"
$today     = (Get-Date).ToString("yyyy-MM-dd")

if (-not $force -and (Test-Path $quotePath)) {
    try {
        $existing = Get-Content $quotePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existing.date -eq $today) {
            Write-Host "Zitat fuer heute bereits vorhanden - uebersprungen." -ForegroundColor Yellow
            exit
        }
    } catch {}
}

$body = [ordered]@{
    model      = "anthropic--claude-sonnet-latest"
    max_tokens = 256
    messages   = @(
        [ordered]@{
            role    = "user"
            content = "Gib mir ein kurzes, inspirierendes Zitat aus klassischer deutscher Literatur. Autoren wie Goethe, Schiller, Hesse, Rilke, Kafka, Thomas Mann, Fontane, Lessing, Brecht, Nietzsche, Buechner, Keller, Heine, Novalis, Hoelderlin. Waehle ein anderes Zitat als gestern. Antwort NUR als JSON-Objekt: {""text"":""..."",""author"":""..."",""work"":""...""}. Kein Markdown, keine Erklaerung, kein Codeblock."
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

$ts = [int64](([datetime]::UtcNow - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds)
$result = [ordered]@{
    date   = $today
    text   = $parsed.text
    author = $parsed.author
    work   = $parsed.work
    ts     = $ts
}
$json = $result | ConvertTo-Json -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($quotePath, $json, $utf8NoBom)
Write-Host "Zitat geschrieben: $($parsed.text) -- $($parsed.author)" -ForegroundColor Green
