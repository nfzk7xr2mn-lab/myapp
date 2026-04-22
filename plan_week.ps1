Add-Content -Path "C:\Users\D025095\myapp\myapp\data\plan.log" -Value "PS START $(Get-Date)"
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\Users\D025095\myapp\myapp" }
$outputDir = Join-Path $scriptDir "data"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }
if (Test-Path "C:\Temp\myapp-modal.lock") { exit }
. "$scriptDir\secrets.ps1"

$ci    = [System.Globalization.CultureInfo]::GetCultureInfo('de-DE')
$today = (Get-Date).Date
$dayCodes = @("MO","DI","MI","DO","FR")

# Monday of current week
$dow    = [int]$today.DayOfWeek
$offset = if ($dow -eq 0) { -6 } else { 1 - $dow }
$monday = $today.AddDays($offset)
$kw     = $ci.Calendar.GetWeekOfYear($monday, [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [System.DayOfWeek]::Monday)

# Load all mails once (filtering happens per day inside loop)
$mailsFile = Join-Path $outputDir "mails_today.json"
$allMails  = @()
if (Test-Path $mailsFile) {
    $allMails = Get-Content $mailsFile -Raw -Encoding UTF8 | ConvertFrom-Json
}

# Load notizen once
$notizenFile = Join-Path $outputDir "notes.json"
$notizen = if (Test-Path $notizenFile) { Get-Content $notizenFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
$tsNow   = [int64]([System.DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())

# Loop over MO-FR
foreach ($i in 0..4) {
    $day       = $monday.AddDays($i)
    $dayCode   = $dayCodes[$i]
    $dayYMD    = $day.ToString("yyyyMMdd")
    $dayFull   = $day.ToString("dddd, dd.MM.", $ci)
    $notizTitel = "Planung KW$kw-$dayCode"

    # Parse ICS for this day
    $icsFile = Join-Path $outputDir "calendar_$dayYMD.ics"
    $termine = @()
    if (Test-Path $icsFile) {
        $icsText = Get-Content $icsFile -Raw -Encoding UTF8
        $events  = [System.Text.RegularExpressions.Regex]::Matches($icsText, '(?s)BEGIN:VEVENT(.*?)END:VEVENT')
        foreach ($ev in $events) {
            $block = $ev.Groups[1].Value
            if ($block -match 'TRANSP:TRANSPARENT') { continue }
            $summary  = if ($block -match 'SUMMARY:(.+)') { $Matches[1].Trim() } else { '(kein Titel)' }
            $tentativ = $block -match 'X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE'
            $optional = $block -match 'X-MYAPP-ROLE:OPT-PARTICIPANT'
            if ($block -match 'DTSTART;VALUE=DATE:') {
                $termine += "[Ganztag] $summary$(if($tentativ){' (tentativ)'})$(if($optional){' (optional)'})"
            } elseif ($block -match 'DTSTART:(\d{8}T\d{6}Z?)') {
                $dtRaw = $Matches[1]
                try {
                    $dtUtc = [datetime]::ParseExact($dtRaw, 'yyyyMMddTHHmmssZ', $null, 'AdjustToUniversal')
                    $tStr  = $dtUtc.ToLocalTime().ToString("HH:mm")
                } catch { $tStr = '?' }
                $termine += "[$tStr] $summary$(if($tentativ){' (tentativ)'})$(if($optional){' (optional)'})"
            }
        }
        $termine = $termine | Sort-Object
    }

    $terminBlock = if ($termine.Count -gt 0) { "TERMINE $($dayFull):`n" + ($termine -join "`n") } else { "Keine Termine fuer $dayFull." }

    # Filter mails: only include mails received BEFORE $day (what you knew the evening before)
    $dayDateStr = $day.ToString("dd.MM.")
    $mailLines = @()
    foreach ($m in $allMails) {
        if ($m.prio -eq 'fyi') { continue }
        # parse mail date "dd.MM." -> compare with $day
        $mDateStr = $m.date
        if (-not $mDateStr) { continue }
        try {
            $mDate = [datetime]::ParseExact($mDateStr, 'dd.MM.', $ci)
            $mDate = $mDate.AddYears($today.Year - $mDate.Year)
        } catch { continue }
        if ($mDate -ge $day) { continue }
        $richtung = if ($m.typ -eq 'gesendet') { "GESENDET" } else { "VON: $($m.from -replace ',.*','')" }
        $auftrag  = if ($m.auftrag) { ' [AUFTRAG]' } else { '' }
        $mailLines += "[$($m.date) $($m.time)] $richtung | $($m.subject)$auftrag"
    }
    $mailBlock = if ($mailLines.Count -gt 0) { "BEKANNTE MAILS (vor $dayDateStr):`n" + ($mailLines -join "`n") } else { "Keine relevanten Mails vor $dayDateStr bekannt." }

    $prompt = @"
Du bist ein persoenlicher Assistent. Bewerte kurz, wie gut der Tag ($dayFull) geplant ist.

WICHTIG: Die Mails unten sind nur solche, die VOR diesem Tag eingegangen sind.
Du bewertest den Tag mit dem Wissen vom Vorabend -- nicht mit Wissen, das erst spaeter kam.

FORMAT -- exakt so:
Jeder Punkt beginnt mit einem Emoji, dann Doppelpunkt, dann ein kurzer Satz. Kein Markdown, kein Fettdruck, keine Ueberschriften.
Maximal 5 Zeilen, maximal 120 Woerter. Deutsch, direkt.

Beispiel:
Taktdichte: Von 9 bis 16 Uhr back-to-back, kein Puffer einplanen.
Mittagspause: Frei ab 12:00, realistisch.
Vorbereitung: Der 14:00-Termin braucht Zahlen aus dem letzten Review.
Gut: Morgen frueh ist Zeit fuer fokussiertes Arbeiten.
Auftraege: Antwort auf Mail X noch offen.

Inhalt (nur was wirklich relevant ist):
- Taktdichte und Puffer
- Welcher Termin braucht Vorbereitung
- Mittagspause realistisch?
- Was ist gut geplant
- Offene Mail-Auftraege (nur wenn VOR diesem Tag eingegangen)

$terminBlock

$mailBlock
"@

    $bodyObj  = [ordered]@{ model = "anthropic--claude-sonnet-latest"; max_tokens = 1024; messages = @([ordered]@{ role = "user"; content = $prompt }) }
    $bodyJson = $bodyObj | ConvertTo-Json -Depth 5 -Compress

    try {
        $response = Invoke-RestMethod -Uri $ProxyUri -Method POST -TimeoutSec 60 `
            -Headers @{ "x-api-key" = $ApiKey; "anthropic-version" = "2023-06-01"; "Content-Type" = "application/json; charset=utf-8" } `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson))
    } catch {
        Write-Warning "API-Aufruf fehlgeschlagen fuer $dayCode : $_"
        continue
    }

    if (-not $response.content -or -not $response.content[0].text) { continue }

    $notizText = $response.content[0].text
    $notizen   = @($notizen | Where-Object { $_.titel -ne $notizTitel })
    $neueNotiz = [PSCustomObject]@{
        titel = $notizTitel
        datum = $today.ToString("dd.MM.")
        ts    = $tsNow
        text  = $notizText
    }
    $notizen = @($neueNotiz) + $notizen

    Write-Output "Planungsnotiz '$notizTitel' geschrieben."
}

# Write notes.json once at the end
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($notizenFile, ($notizen | ConvertTo-Json -Depth 3), $utf8NoBom)

Write-Output "Alle Planungsnotizen fuer KW$kw geschrieben."
