# Export current week's Outlook emails as JSON file

. "$PSScriptRoot\secrets.ps1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $scriptDir "Daten"
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

$filePath = Join-Path $outputDir "mails_heute.json"
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
} finally {
    if ($outlook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null }
}
