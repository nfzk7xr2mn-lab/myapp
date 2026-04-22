# Export current week's Outlook emails as JSON file

. "$PSScriptRoot\secrets.ps1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $scriptDir "data"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

if (Test-Path "C:\Temp\myapp-modal.lock") {
    Write-Host "Modal offen - Export uebersprungen." -ForegroundColor Yellow
    exit
}

# Write config.json from secrets so script.js can load myAddresses without committing them
$configPath = Join-Path $outputDir "config.json"
$configObj  = @{ myAddresses = $MyAddresses } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($configPath, $configObj, [System.Text.UTF8Encoding]::new($false))

$today     = (Get-Date).Date
$tomorrow  = $today.AddDays(1)
$dayOfWeek = [int](Get-Date).DayOfWeek   # 0=Sun, 1=Mon .. 6=Sat
$daysToMon = if ($dayOfWeek -eq 0) { 6 } else { $dayOfWeek - 1 }
$weekStart = $today.AddDays(-$daysToMon)
$filter    = "[ReceivedTime] >= '" + $weekStart.ToString("MM/dd/yyyy HH:mm") + "' AND [ReceivedTime] < '" + $tomorrow.ToString("MM/dd/yyyy HH:mm") + "'"

$auftragKeywords = @('bitte', 'please', 'action required', 'action item', 'koenntest du', 'kannst du',
                     'wuerdest du', 'ich bitte', 'erledige', 'pruefe', 'ueberpruefe', 'schaue',
                     'deadline', 'frist', 'bis wann', 'bis montag', 'bis freitag', 'bis ende',
                     'auftrag', 'aufgabe', 'task', 'todo', 'to-do', 'follow-up', 'followup')

function Test-IstAuftrag($subject, $body) {
    $text = ("$subject $body").ToLower()
    foreach ($kw in $auftragKeywords) {
        if ($text -like "*$kw*") { return $true }
    }
    return $false
}

function ConvertTo-ShortName($full) {
    if (-not $full) { return '' }
    $trimmed = $full.Trim()
    if ($trimmed -match '^DL\s' -or $trimmed -match '^SAP\s' -or $trimmed -match '^Cloud\s' -or $trimmed -match '\(external' -or $trimmed -match '[_\d]') { return '' }
    if ($trimmed.Contains(',')) {
        $parts = $trimmed -split ',' | ForEach-Object { $_.Trim() }
        $last = $parts[0]; $first = $parts[1]
        if ($first) { return "$first $($last[0].ToString().ToUpper())." }
        return ''
    }
    $parts = $trimmed -split '\s+'
    if ($parts.Count -le 1) { return '' }
    $first = $parts[0]
    $lastInitial = $parts[$parts.Count - 1][0].ToString().ToUpper()
    return "$first $lastInitial."
}

$outlook  = New-Object -ComObject Outlook.Application
try {
$inbox    = $outlook.Session.GetDefaultFolder(6)  # 6 = olFolderInbox
$sentBox  = $outlook.Session.GetDefaultFolder(5)  # 5 = olFolderSentMail

$sentFilter = "[SentOn] >= '" + $weekStart.ToString("MM/dd/yyyy HH:mm") + "' AND [SentOn] < '" + $tomorrow.ToString("MM/dd/yyyy HH:mm") + "'"

$sentItems = @()
try {
    $sentRestricted = $sentBox.Items.Restrict($sentFilter)
    foreach ($item in $sentRestricted) {
        try { if ($item.Class -eq 43) { $sentItems += $item } } catch {}
    }
} catch { Write-Warning "Gesendete Elemente nicht lesbar: $_" }

function Get-FolderItems($folder) {
    $results = @()
    try {
        $restricted = $folder.Items.Restrict($filter)
        foreach ($item in $restricted) {
            try { if ($item.Class -eq 43) { $results += $item } } catch {}
        }
    } catch {}
    foreach ($sub in $folder.Folders) {
        $results += Get-FolderItems $sub
    }
    return $results
}

$receivedItems = Get-FolderItems $inbox

$excludeSenders = if ($ExcludeSenders) { $ExcludeSenders } else { @('itsm', 'sharepoint') }

$mails = @()

# Empfangene Mails
foreach ($mail in $receivedItems) {
    try {
        if ($mail.Class -ne 43) { continue }
        $fromLower = ($mail.SenderName + ' ' + $mail.SenderEmailAddress).ToLower()
        if ($excludeSenders | Where-Object { $fromLower -like "*$_*" }) { continue }
        $toField  = $mail.To  -replace '\s+', ''
        $ccField  = $mail.CC  -replace '\s+', ''
        $toLower  = $toField.ToLower()
        $ccLower  = $ccField.ToLower()
        $iAmInTo  = ($MyAddresses + $MyDisplayNames) | Where-Object { $toLower -like "*$_*" }
        $iAmInCC  = ($MyAddresses + $MyDisplayNames) | Where-Object { $ccLower -like "*$_*" }
        $toCount  = if ($toField) { ($toField -split ';').Count } else { 0 }
        $isChef   = $ChefNames | Where-Object { $fromLower -like "*$_*" }

        $prio = if ($isChef)                          { 'chef' }
                elseif ($iAmInTo -and $toCount -eq 1) { 'direct' }
                elseif ($iAmInTo)                     { 'action' }
                elseif ($iAmInCC)                     { 'cc' }
                else                                  { 'fyi' }

        $bodyTrimmed = ($mail.Body -replace '\r?\n+', ' ').Trim()
        $bodyShort   = $bodyTrimmed.Substring(0, [Math]::Min(300, $bodyTrimmed.Length))
        $mails += [PSCustomObject]@{
            date    = $mail.ReceivedTime.ToString("dd.MM.")
            time    = $mail.ReceivedTime.ToString("HH:mm")
            typ     = 'empfangen'
            from    = $mail.SenderName
            to      = $mail.To
            cc      = $mail.CC
            prio    = $prio
            auftrag = (Test-IstAuftrag $mail.Subject $bodyShort)
            subject = $mail.Subject
            body    = $bodyShort
        }
    } catch {
        Write-Warning "Skipping received mail: $_"
    }
}

# Gesendete Mails
foreach ($mail in $sentItems) {
    try {
        if ($mail.Class -ne 43) { continue }
        $bodyTrimmed = ($mail.Body -replace '\r?\n+', ' ').Trim()
        $bodyShort   = $bodyTrimmed.Substring(0, [Math]::Min(300, $bodyTrimmed.Length))
        $mails += [PSCustomObject]@{
            date    = $mail.SentOn.ToString("dd.MM.")
            time    = $mail.SentOn.ToString("HH:mm")
            typ     = 'gesendet'
            from    = $mail.SenderName
            to      = $mail.To
            cc      = $mail.CC
            prio    = 'sent'
            auftrag = (Test-IstAuftrag $mail.Subject $bodyShort)
            subject = $mail.Subject
            body    = $bodyShort
        }
    } catch {
        Write-Warning "Skipping sent mail: $_"
    }
}

$mails = $mails | Sort-Object time -Descending

$filePath = Join-Path $outputDir "mails_today.json"
$json = $mails | ConvertTo-Json -Depth 3
if ($null -eq $json -or $json -eq '') { $json = '[]' }
elseif ($json.TrimStart()[0] -ne '[') { $json = "[$json]" }

$existingContent = if (Test-Path $filePath) { Get-Content $filePath -Raw } else { '' }
$existingCount   = if ($existingContent -match '^\s*\[') { ($existingContent | ConvertFrom-Json).Count } else { 0 }

if ($mails.Count -gt 0 -or $existingCount -eq 0) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($filePath, $json, $utf8NoBom)
} else {
    Write-Warning "Export ergab 0 Mails - bestehende Datei ($existingCount Mails) wird nicht ueberschrieben."
}

$count = $mails.Count
Write-Host "Exported $count mails to: $filePath" -ForegroundColor Green

$logFile = Join-Path $outputDir "export_mail.log"
$ts      = [int64]([System.DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $count Mails exportiert" | Add-Content $logFile -Encoding UTF8
@{ ts = $ts; count = $count } | ConvertTo-Json -Compress |
    Set-Content (Join-Path $outputDir "mail_sync_status.json") -Encoding UTF8

# ── Contact extraction ─────────────────────────────────────────────────
$ci = [System.Globalization.CultureInfo]::GetCultureInfo('de-DE')
$kwNum = $ci.Calendar.GetWeekOfYear($weekStart, [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [System.DayOfWeek]::Monday)
$weekId = "$($today.Year)-W$kwNum"

$myShortNames = @()
foreach ($dn in $MyDisplayNames) { $sn = ConvertTo-ShortName $dn; if ($sn) { $myShortNames += $sn.ToLower() } }

$contactMap = @{}
$fullNameMap = @{}

foreach ($m in $mails) {
    $dateStr = $m.date
    if ($m.typ -eq 'empfangen') {
        $sn = ConvertTo-ShortName $m.from
        if ($sn -and ($myShortNames -notcontains $sn.ToLower())) {
            if (-not $contactMap[$sn]) { $contactMap[$sn] = @{ mailFreq = 0; meetFreq = 0; first = $dateStr; last = $dateStr } }
            $contactMap[$sn].mailFreq++
            $contactMap[$sn].last = $dateStr
            if (-not $fullNameMap[$sn]) { $fullNameMap[$sn] = $m.from }
        }
    }
    elseif ($m.typ -eq 'gesendet' -and $m.to) {
        foreach ($rcpt in ($m.to -split ';')) {
            $sn = ConvertTo-ShortName $rcpt.Trim()
            if ($sn -and ($myShortNames -notcontains $sn.ToLower())) {
                if (-not $contactMap[$sn]) { $contactMap[$sn] = @{ mailFreq = 0; meetFreq = 0; first = $dateStr; last = $dateStr } }
                $contactMap[$sn].mailFreq++
                $contactMap[$sn].last = $dateStr
                if (-not $fullNameMap[$sn]) { $fullNameMap[$sn] = $rcpt.Trim() }
            }
        }
    }
}

# Parse ATTENDEE from ICS files of current week
foreach ($dayOff in 0..([Math]::Min(4, ($today - $weekStart).Days + 1))) {
    $icsDay  = $weekStart.AddDays($dayOff)
    $icsFile = Join-Path $outputDir ("calendar_" + $icsDay.ToString("yyyyMMdd") + ".ics")
    if (-not (Test-Path $icsFile)) { continue }
    $icsText = Get-Content $icsFile -Raw -Encoding UTF8
    $cnMatches = [regex]::Matches($icsText, 'ATTENDEE;[^:]*CN=([^:;]+)')
    $icsDayStr = $icsDay.ToString("dd.MM.")
    foreach ($cm in $cnMatches) {
        $rawName = $cm.Groups[1].Value -replace '\\,', ',' -replace '\\;', ';'
        $sn = ConvertTo-ShortName $rawName
        if ($sn -and ($myShortNames -notcontains $sn.ToLower())) {
            if (-not $contactMap[$sn]) { $contactMap[$sn] = @{ mailFreq = 0; meetFreq = 0; first = $icsDayStr; last = $icsDayStr } }
            $contactMap[$sn].meetFreq++
            if ($icsDayStr -lt $contactMap[$sn].first) { $contactMap[$sn].first = $icsDayStr }
            if ($icsDayStr -gt $contactMap[$sn].last)  { $contactMap[$sn].last  = $icsDayStr }
            if (-not $fullNameMap[$sn]) { $fullNameMap[$sn] = $rawName }
        }
    }
}

# Resolve Department from Outlook for contacts without rolle
$deptCache = @{}
function Resolve-Contact($displayName) {
    if (-not $displayName) { return @{ dept = ''; resolvedName = '' } }
    if ($deptCache.ContainsKey($displayName)) { return $deptCache[$displayName] }
    $result = @{ dept = ''; resolvedName = '' }
    try {
        $recip = $outlook.Session.CreateRecipient($displayName)
        $recip.Resolve() | Out-Null
        if ($recip.Resolved) {
            $eu = $recip.AddressEntry.GetExchangeUser()
            if ($eu) {
                if ($eu.Department) { $result.dept = $eu.Department }
                if ($eu.Name) { $result.resolvedName = $eu.Name }
            }
        }
    } catch {}
    $deptCache[$displayName] = $result
    return $result
}

# Merge with existing contacts.json
$contactsFile = Join-Path $outputDir "contacts.json"
$existing = @()
if (Test-Path $contactsFile) {
    try { $existing = Get-Content $contactsFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $existing = @() }
}

$merged = @()
$handled = @{}

foreach ($sn in $contactMap.Keys) {
    $c = $contactMap[$sn]
    $old = $existing | Where-Object { $_.name -eq $sn } | Select-Object -First 1
    $rolle = ''
    $oldMailFreq = 0; $oldMeetFreq = 0; $oldFirst = $c.first; $oldWeekId = ''
    if ($old) {
        $rolle = if ($old.rolle) { $old.rolle } else { '' }
        $oldWeekId = if ($old._weekId) { $old._weekId } else { '' }
        $oldFirst = if ($old.first) { $old.first } else { $c.first }
        if ($oldWeekId -eq $weekId) {
            $oldMailFreq = 0; $oldMeetFreq = 0
        } else {
            $oldMailFreq = if ($old.mailFreq) { $old.mailFreq } else { 0 }
            $oldMeetFreq = if ($old.meetFreq) { $old.meetFreq } else { 0 }
        }
    }
    if (-not $rolle -or $rolle -eq 'Mitarbeiter') {
        $lookupName = if ($fullNameMap[$sn]) { $fullNameMap[$sn] } else { $sn }
        $resolved = Resolve-Contact $lookupName
        if ($resolved.dept) {
            $rolle = if ($rolle) { "$rolle, $($resolved.dept)" } else { $resolved.dept }
        }
        if ($resolved.resolvedName -and -not $fullNameMap[$sn]) { $fullNameMap[$sn] = $resolved.resolvedName }
    }
    $mf = $oldMailFreq + $c.mailFreq
    $tf = $oldMeetFreq + $c.meetFreq
    $first = if ($oldFirst -and $oldFirst -lt $c.first) { $oldFirst } else { $c.first }
    $last  = if ($old -and $old.last -and $old.last -gt $c.last) { $old.last } else { $c.last }
    $merged += [PSCustomObject]@{
        name     = $sn
        rolle    = $rolle
        first    = $first
        last     = $last
        mailFreq = $mf
        meetFreq = $tf
        freq     = $mf + $tf
        _weekId  = $weekId
    }
    $handled[$sn] = $true
}

# Keep existing contacts not seen this week (preserve historical data)
foreach ($old in $existing) {
    if (-not $handled[$old.name]) {
        $oldRolle = if ($old.rolle) { $old.rolle } else { '' }
        if (-not $oldRolle -or $oldRolle -eq 'Mitarbeiter') {
            $lookupName = if ($fullNameMap[$old.name]) { $fullNameMap[$old.name] } else { $old.name }
            $resolved = Resolve-Contact $lookupName
            if ($resolved.dept) {
                $oldRolle = if ($oldRolle) { "$oldRolle, $($resolved.dept)" } else { $resolved.dept }
            }
            if ($resolved.resolvedName -and -not $fullNameMap[$old.name]) { $fullNameMap[$old.name] = $resolved.resolvedName }
        }
        $merged += [PSCustomObject]@{
            name     = $old.name
            rolle    = $oldRolle
            first    = if ($old.first) { $old.first } else { '' }
            last     = if ($old.last)  { $old.last }  else { '' }
            mailFreq = if ($old.mailFreq) { $old.mailFreq } else { 0 }
            meetFreq = if ($old.meetFreq) { $old.meetFreq } else { 0 }
            freq     = if ($old.freq)  { $old.freq }  else { 0 }
            _weekId  = if ($old._weekId) { $old._weekId } else { '' }
        }
    }
}

$merged = $merged | Sort-Object freq -Descending

# Re-read contacts.json to preserve roles edited in the UI during export
# Only override if the role in the file changed since our initial read ($existing)
$initialRoles = @{}
foreach ($ex in $existing) { if ($ex.name) { $initialRoles[$ex.name] = if ($ex.rolle) { $ex.rolle } else { '' } } }
if (Test-Path $contactsFile) {
    try {
        $freshData = Get-Content $contactsFile -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($fc in $freshData) {
            $init = if ($initialRoles.ContainsKey($fc.name)) { $initialRoles[$fc.name] } else { '' }
            $now  = if ($fc.rolle) { $fc.rolle } else { '' }
            if ($now -ne $init) {
                $match = $merged | Where-Object { $_.name -eq $fc.name } | Select-Object -First 1
                if ($match) { $match.rolle = $now }
            }
        }
    } catch {}
}

$contactsJson = $merged | ConvertTo-Json -Depth 3
if ($null -eq $contactsJson -or $contactsJson -eq '') { $contactsJson = '[]' }
elseif ($contactsJson.TrimStart()[0] -ne '[') { $contactsJson = "[$contactsJson]" }
[System.IO.File]::WriteAllText($contactsFile, $contactsJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "Exported $($merged.Count) contacts to: $contactsFile" -ForegroundColor Green
} finally {
    if ($outlook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null }
}
