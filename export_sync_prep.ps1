# export_sync_prep.ps1
# Checks tomorrow's calendar for 1:1 sync appointments with team members.
# For each match, exports the last 2 weeks of emails to/from that person
# as data/KW{n}-{Vorname}.json

. "$PSScriptRoot\secrets.ps1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $scriptDir "data"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

# Chef + alle Mitarbeiter als Suchpool
$SyncPersonen = @($Mitarbeiter) + @(@{ name = $ChefName; email = $ChefEmail })

$outlook  = New-Object -ComObject Outlook.Application
try {
$calendar = $outlook.Session.GetDefaultFolder(9)  # olFolderCalendar
$inbox    = $outlook.Session.GetDefaultFolder(6)  # olFolderInbox
$sentBox  = $outlook.Session.GetDefaultFolder(5)  # olFolderSentMail

$today       = (Get-Date).Date
$tomorrow    = $today.AddDays(1)
$twoWeeksAgo = $today.AddDays(-14)

# ── Helper: KW number ────────────────────────────────────────────────────────
function Get-KW($date) {
    $ci = [System.Globalization.CultureInfo]::GetCultureInfo('de-DE')
    return $ci.Calendar.GetWeekOfYear($date, [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [System.DayOfWeek]::Monday)
}

# ── Load tomorrow's calendar events ─────────────────────────────────────────
$items = $calendar.Items
$items.Sort("[Start]")
$items.IncludeRecurrences = $true
$calFilter = "[Start] >= '{0}' AND [Start] < '{1}'" -f `
    $tomorrow.ToString("MM/dd/yyyy HH:mm"), `
    $tomorrow.AddDays(1).ToString("MM/dd/yyyy HH:mm")
$tomorrowItems = $items.Restrict($calFilter)

# ── Find which persons have a sync tomorrow ──────────────────────────────────
$gefunden = @()
foreach ($appt in $tomorrowItems) {
    try {
        $summary = $appt.Subject.ToLower()
        Write-Host "  Termin: $($appt.Subject)" -ForegroundColor DarkGray
        foreach ($ma in $SyncPersonen) {
            $nameParts = ($ma.name -split '[,\s]+') | Where-Object { $_.Length -gt 2 }
            $match = [bool]($nameParts | Where-Object { $summary -match "\b$([regex]::Escape($_.ToLower()))\b" })
            if ($match -and ($gefunden | Where-Object { $_.email -eq $ma.email }).Count -eq 0) {
                $gefunden += $ma
                Write-Host "  Sync gefunden: $($ma.name)" -ForegroundColor Cyan
            }
        }
    } catch { Write-Host "  Fehler bei Termin: $_" -ForegroundColor Red }
}

if ($gefunden.Count -eq 0) {
    Write-Host "Keine Sync-Termine gefunden fuer morgen." -ForegroundColor Yellow
    exit
}

# Eigene Person aus Sync-Liste entfernen
$gefunden = $gefunden | Where-Object { -not ($MyAddresses -contains $_.email) }

# ── Helper: load mails from folder + subfolders ──────────────────────────────
function Get-FolderMails($folder, $filterStr) {
    $results = @()
    try {
        $restricted = $folder.Items.Restrict($filterStr)
        foreach ($item in $restricted) {
            try { if ($item.Class -eq 43) { $results += $item } } catch {}
        }
    } catch {}
    foreach ($sub in $folder.Folders) {
        $results += Get-FolderMails $sub $filterStr
    }
    return $results
}

$fromUtc = $twoWeeksAgo.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
$toUtc   = $tomorrow.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
$dateFilter = "@SQL=""urn:schemas:httpmail:datereceived"" >= '$fromUtc' AND ""urn:schemas:httpmail:datereceived"" < '$toUtc'"
$sentFilter = "@SQL=""urn:schemas:httpmail:date"" >= '$fromUtc' AND ""urn:schemas:httpmail:date"" < '$toUtc'"

$kw = Get-KW $tomorrow

Write-Host "Lade Inbox-Mails der letzten 2 Wochen..." -ForegroundColor Gray
$allInbox = Get-FolderMails $inbox $dateFilter
Write-Host "  $($allInbox.Count) empfangen" -ForegroundColor Gray

Write-Host "Lade gesendete Mails der letzten 2 Wochen..." -ForegroundColor Gray
$allSent = Get-FolderMails $sentBox $sentFilter
Write-Host "  $($allSent.Count) gesendet" -ForegroundColor Gray

# ── Export mails per person ──────────────────────────────────────────────────
foreach ($ma in $gefunden) {
    $emailLower = $ma.email.ToLower()
    $nameParts  = ($ma.name -split '[, ]+') | Where-Object { $_.Length -gt 2 }
    $vorname    = ($ma.name -split '[, ]+') | Where-Object { $_ -cmatch '^[A-Z]' } | Select-Object -Last 1

    $mails = @()

    foreach ($mail in $allInbox) {
        try {
            $fromLower = ($mail.SenderEmailAddress + ' ' + $mail.SenderName).ToLower()
            $isFrom = ($fromLower -like "*$emailLower*") -or
                      [bool]($nameParts | Where-Object { $fromLower -match "\b$([regex]::Escape($_.ToLower()))\b" })
            if (-not $isFrom) { continue }
            $bodyTrimmed = ($mail.Body -replace '\r?\n+', ' ').Trim()
            $mails += [PSCustomObject]@{
                date    = $mail.ReceivedTime.ToString("dd.MM.yyyy")
                time    = $mail.ReceivedTime.ToString("HH:mm")
                typ     = 'empfangen'
                from    = $mail.SenderName
                to      = $mail.To
                subject = $mail.Subject
                body    = $bodyTrimmed.Substring(0, [Math]::Min(500, $bodyTrimmed.Length))
            }
        } catch { Write-Host "    Fehler Inbox: $_" -ForegroundColor Red }
    }

    foreach ($mail in $allSent) {
        try {
            $toLower = $mail.To.ToLower()
            $ccLower = $mail.CC.ToLower()
            $isInTo = ($toLower -like "*$emailLower*") -or
                      [bool]($nameParts | Where-Object { $toLower -match "\b$([regex]::Escape($_.ToLower()))\b" })
            $isInCc = ($ccLower -like "*$emailLower*") -or
                      [bool]($nameParts | Where-Object { $ccLower -match "\b$([regex]::Escape($_.ToLower()))\b" })
            if (-not $isInTo) { continue }
            $bodyTrimmed = ($mail.Body -replace '\r?\n+', ' ').Trim()
            $mails += [PSCustomObject]@{
                date    = $mail.SentOn.ToString("dd.MM.yyyy")
                time    = $mail.SentOn.ToString("HH:mm")
                typ     = 'gesendet'
                from    = $mail.SenderName
                to      = $mail.To
                subject = $mail.Subject
                body    = $bodyTrimmed.Substring(0, [Math]::Min(500, $bodyTrimmed.Length))
            }
        } catch { Write-Host "    Fehler Sent: $_" -ForegroundColor Red }
    }

    $mails = @($mails | Sort-Object date, time)

    $json = $mails | ConvertTo-Json -Depth 3
    if ($null -eq $json -or $json -eq '') { $json = '[]' }
    elseif ($json.TrimStart()[0] -ne '[') { $json = "[$json]" }

    $fileName = "KW{0}-{1}.json" -f $kw, $vorname
    $filePath = Join-Path $outputDir $fileName
    [System.IO.File]::WriteAllText($filePath, $json, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Exported $($mails.Count) mails -> $fileName" -ForegroundColor Green
}

# ── Write sync_files.json ────────────────────────────────────────────────────
$syncEntries = $gefunden | ForEach-Object {
    $vorname = ($_.name -split '[, ]+') | Where-Object { $_ -cmatch '^[A-Z]' } | Select-Object -Last 1
    @{ name = $_.name; file = ("KW{0}-{1}.json" -f $kw, $vorname); date = $tomorrow.ToString("yyyyMMdd") }
}
$syncJson = $syncEntries | ConvertTo-Json -Depth 2
if ($null -eq $syncJson -or $syncJson -eq '') { $syncJson = '[]' }
elseif ($syncJson.TrimStart()[0] -ne '[') { $syncJson = "[$syncJson]" }
[System.IO.File]::WriteAllText((Join-Path $outputDir "sync_files.json"), $syncJson, (New-Object System.Text.UTF8Encoding $false))
Write-Host "sync_files.json geschrieben ($($gefunden.Count) Eintraege)" -ForegroundColor Green
} finally {
    if ($outlook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null }
}
