Add-Content -Path "C:\Users\D025095\myapp\myapp\Daten\plan.log" -Value "PS START $(Get-Date)"
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\Users\D025095\myapp\myapp" }
$outputDir = Join-Path $scriptDir "Daten"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }
if (Test-Path "C:\Temp\myapp-modal.lock") { exit }
. "$scriptDir\secrets.ps1"

function Get-NextWorkday($from) {
    $next = $from.AddDays(1)
    while ($next.DayOfWeek -eq 'Saturday' -or $next.DayOfWeek -eq 'Sunday') {
        $next = $next.AddDays(1)
    }
    return $next
}

$ci         = [System.Globalization.CultureInfo]::GetCultureInfo('de-DE')
$today      = (Get-Date).Date
$nextDay    = Get-NextWorkday $today
$nextYMD    = $nextDay.ToString("yyyyMMdd")
$nextKW     = $ci.Calendar.GetWeekOfYear($nextDay, [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [System.DayOfWeek]::Monday)
$nextWDay   = $ci.DateTimeFormat.GetAbbreviatedDayName($nextDay.DayOfWeek).Substring(0,2).ToUpper()
$notizTitel = "Planung KW$nextKW-$nextWDay"

$icsFile = Join-Path $outputDir "termine_$nextYMD.ics"
$termine = @()
if (Test-Path $icsFile) {
    $icsText = Get-Content $icsFile -Raw -Encoding UTF8
    $events  = [System.Text.RegularExpressions.Regex]::Matches($icsText, '(?s)BEGIN:VEVENT(.*?)END:VEVENT')
    foreach ($ev in $events) {
        $block    = $ev.Groups[1].Value
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

$mailsFile = Join-Path $outputDir "mails_heute.json"
$mailLines = @()
if (Test-Path $mailsFile) {
    $mails    = Get-Content $mailsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $todayStr = $today.ToString("dd.MM.")
    foreach ($m in $mails) {
        if ($m.date -ne $todayStr) { continue }
        if ($m.prio -eq 'fyi') { continue }
        $richtung = if ($m.typ -eq 'gesendet') { "GESENDET" } else { "VON: $($m.from -replace ',.*','')" }
        $auftrag  = if ($m.auftrag) { ' [AUFTRAG]' } else { '' }
        $mailLines += "[$($m.time)] $richtung | $($m.subject)$auftrag"
    }
}

$nextDayFull = $nextDay.ToString("dddd, dd.MM.", $ci)
$terminBlock = if ($termine.Count -gt 0) { "TERMINE $($nextDayFull):`n" + ($termine -join "`n") } else { "Keine Termine fuer $nextDayFull." }
$mailBlock   = if ($mailLines.Count -gt 0) { "HEUTIGE MAILS (relevant):`n" + ($mailLines -join "`n") } else { "Keine relevanten Mails heute." }

$prompt = @"
Du bist ein persoenlicher Assistent. Bewerte kurz, wie gut morgen ($nextDayFull) geplant ist.

FORMAT -- exakt so:
Jeder Punkt beginnt mit einem Emoji, dann Doppelpunkt, dann ein kurzer Satz. Kein Markdown, kein Fettdruck, keine Ueberschriften.
Maximal 5 Zeilen, maximal 120 Woerter. Deutsch, direkt.

Beispiel:
⏱ Taktdichte: Von 9 bis 16 Uhr back-to-back, kein Puffer einplanen.
🍽 Mittagspause: Frei ab 12:00, realistisch.
🎯 Vorbereitung: Der 14:00-Termin braucht Zahlen aus dem letzten Review.
✅ Gut: Morgen frueh ist Zeit fuer fokussiertes Arbeiten.
📬 Auftraege: Antwort auf Mail X noch offen.

Inhalt (nur was wirklich relevant ist):
- Taktdichte und Puffer
- Welcher Termin braucht Vorbereitung
- Mittagspause realistisch?
- Was ist gut geplant
- Offene Mail-Auftraege

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
    Write-Warning "API-Aufruf fehlgeschlagen: $_"
    exit 1
}

if (-not $response.content -or -not $response.content[0].text) { exit 1 }

$notizText   = $response.content[0].text
$notizenFile = Join-Path $outputDir "notizen.json"
$notizen     = if (Test-Path $notizenFile) { Get-Content $notizenFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
$notizen     = @($notizen | Where-Object { $_.titel -ne $notizTitel })
$neueNotiz   = [PSCustomObject]@{
    titel = $notizTitel
    datum = $today.ToString("dd.MM.")
    ts    = [int64]([System.DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    text  = $notizText
}
$notizen = @($neueNotiz) + $notizen

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($notizenFile, ($notizen | ConvertTo-Json -Depth 3), $utf8NoBom)

Write-Output "Planungsnotiz '$notizTitel' geschrieben."
