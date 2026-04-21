# Export today's and tomorrow's Outlook calendar events as ICS files

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $scriptDir "Daten"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

if (Test-Path "C:\Temp\myapp-modal.lock") {
    Write-Host "Modal offen - Export uebersprungen." -ForegroundColor Yellow
    exit
}

$outlook  = New-Object -ComObject Outlook.Application
try {
$calendar = $outlook.Session.GetDefaultFolder(9)

function To-ICSDate($dt) {
    $utc = $dt.ToUniversalTime()
    return $utc.ToString("yyyyMMdd'T'HHmmss'Z'")
}

function Escape-ICS($text) {
    return $text -replace '\\', '\\\\' -replace ';', '\;' -replace ',', '\,' -replace "`n", '\n'
}

function Export-DayICS($day) {
    $start = $day.Date
    $end   = $start.AddDays(1)

    $items = $calendar.Items
    $items.IncludeRecurrences = $true
    $items.Sort("[Start]")
    $filter = "[Start] >= '" + $start.ToString("MM/dd/yyyy HH:mm") + "' AND [Start] < '" + $end.ToString("MM/dd/yyyy HH:mm") + "'"
    $dayItems = $items.Restrict($filter)

    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine("BEGIN:VCALENDAR")
    [void]$sb.AppendLine("VERSION:2.0")
    [void]$sb.AppendLine("PRODID:-//MyApp Dashboard//DE")
    [void]$sb.AppendLine("CALSCALE:GREGORIAN")

    foreach ($item in $dayItems) {
        try {
            $summary = Escape-ICS $item.Subject
            $uid     = [System.Guid]::NewGuid().ToString()

            [void]$sb.AppendLine("BEGIN:VEVENT")
            if ($item.AllDayEvent) {
                [void]$sb.AppendLine("DTSTART;VALUE=DATE:" + $item.Start.ToString("yyyyMMdd"))
                [void]$sb.AppendLine("DTEND;VALUE=DATE:"   + $item.End.ToString("yyyyMMdd"))
            } else {
                [void]$sb.AppendLine("DTSTART:" + (To-ICSDate $item.Start))
                [void]$sb.AppendLine("DTEND:"   + (To-ICSDate $item.End))
            }
            [void]$sb.AppendLine("SUMMARY:$summary")
            [void]$sb.AppendLine("UID:$uid")
            # BusyStatus: 0=Free, 1=Tentative, 2=Busy, 3=OOF, 4=WorkingElsewhere
            if ($item.BusyStatus -eq 0) { [void]$sb.AppendLine("TRANSP:TRANSPARENT") }
            if ($item.BusyStatus -eq 1) { [void]$sb.AppendLine("X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE") }
            # ResponseStatus: 0=None,1=Organized,2=Tentative,3=Accepted,4=Declined,5=NotResponded
            # MeetingStatus: 0=NonMeeting,1=Meeting,3=Received,5=Cancelled,7=ReceivedCancelled
            try {
                if ($item.MeetingStatus -gt 0) {
                    $role = if ($item.IsConflict -eq $false -and $item.OptionalAttendees -match [regex]::Escape($outlook.Session.CurrentUser.Name)) {
                        "OPT-PARTICIPANT"
                    } else { "REQ-PARTICIPANT" }
                    [void]$sb.AppendLine("X-MYAPP-ROLE:$role")
                }
            } catch {}
            [void]$sb.AppendLine("END:VEVENT")
        } catch {
            Write-Warning "Skipping item: $_"
        }
    }

    [void]$sb.AppendLine("END:VCALENDAR")

    $dateStr  = $day.ToString("yyyyMMdd")
    $filePath = Join-Path $outputDir "termine_$dateStr.ics"
    [System.IO.File]::WriteAllText($filePath, $sb.ToString(), [System.Text.Encoding]::UTF8)

    $count = ($dayItems | Measure-Object).Count
    Write-Host "Exported $count events to: $filePath" -ForegroundColor Green
}

$today = Get-Date
Export-DayICS $today
Export-DayICS $today.AddDays(1)
} finally {
    if ($outlook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null }
}
