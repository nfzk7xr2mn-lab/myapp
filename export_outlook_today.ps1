# Export today's Outlook calendar events as ICS file
# Place this script anywhere and run it before opening the dashboard.
# The ICS file is saved to the same folder as this script.

$outputDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$today     = Get-Date

# ── Connect to Outlook ────────────────────────────────────────────────────
$outlook  = New-Object -ComObject Outlook.Application
$calendar = $outlook.Session.GetDefaultFolder(9)  # 9 = olFolderCalendar

# ── Get today's appointments ──────────────────────────────────────────────
$start = $today.Date
$end   = $start.AddDays(1)

$items = $calendar.Items
$items.IncludeRecurrences = $true
$items.Sort("[Start]")
$filter = "[Start] >= '{0}' AND [Start] < '{1}'" -f `
    $start.ToString("MM/dd/yyyy HH:mm"), `
    $end.ToString("MM/dd/yyyy HH:mm")

$todayItems = $items.Restrict($filter)

# ── Build ICS ─────────────────────────────────────────────────────────────
function To-ICSDate($dt) {
    # Convert local time to UTC and format as ICS UTC string
    $utc = $dt.ToUniversalTime()
    return $utc.ToString("yyyyMMdd'T'HHmmss'Z'")
}

function Escape-ICS($text) {
    return $text -replace '\\', '\\\\' -replace ';', '\;' -replace ',', '\,' -replace "`n", '\n'
}

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("BEGIN:VCALENDAR")
[void]$sb.AppendLine("VERSION:2.0")
[void]$sb.AppendLine("PRODID:-//MyApp Dashboard//DE")
[void]$sb.AppendLine("CALSCALE:GREGORIAN")

foreach ($item in $todayItems) {
    try {
        $dtStart = To-ICSDate $item.Start
        $dtEnd   = To-ICSDate $item.End
        $summary = Escape-ICS $item.Subject
        $uid     = [System.Guid]::NewGuid().ToString()

        [void]$sb.AppendLine("BEGIN:VEVENT")
        [void]$sb.AppendLine("DTSTART:$dtStart")
        [void]$sb.AppendLine("DTEND:$dtEnd")
        [void]$sb.AppendLine("SUMMARY:$summary")
        [void]$sb.AppendLine("UID:$uid")
        [void]$sb.AppendLine("END:VEVENT")
    } catch {
        Write-Warning "Skipping item: $_"
    }
}

[void]$sb.AppendLine("END:VCALENDAR")

# ── Save file ─────────────────────────────────────────────────────────────
$dateStr      = $today.ToString("yyyyMMdd")
$filePathDate = Join-Path $outputDir "termine_$dateStr.ics"

[System.IO.File]::WriteAllText($filePathDate, $sb.ToString(), [System.Text.Encoding]::UTF8)

$count = ($todayItems | Measure-Object).Count
Write-Host "Exported $count events to: $filePathDate" -ForegroundColor Green
