# Export today's Outlook emails as JSON file
# Runs automatically via Task Scheduler alongside export_outlook_today.ps1

. "$PSScriptRoot\secrets.ps1"

$outputDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$today     = (Get-Date).Date
$tomorrow  = $today.AddDays(1)
# Start of current work week (Monday)
$dayOfWeek = [int](Get-Date).DayOfWeek
$daysToMon = if ($dayOfWeek -eq 0) { 6 } else { $dayOfWeek - 1 }
$weekStart = $today.AddDays(-$daysToMon)
$filter    = "[ReceivedTime] >= '{0}' AND [ReceivedTime] < '{1}'" -f `
    $weekStart.ToString("MM/dd/yyyy HH:mm"), `
    $tomorrow.ToString("MM/dd/yyyy HH:mm")

# ── Connect to Outlook ────────────────────────────────────────────────────
$outlook = New-Object -ComObject Outlook.Application
$inbox   = $outlook.Session.GetDefaultFolder(6)  # 6 = olFolderInbox

# Collect all items from inbox and all subfolders recursively
function Get-FolderItems($folder, $filter) {
    $results = @()
    try { $results += $folder.Items.Restrict($filter) } catch {}
    foreach ($sub in $folder.Folders) {
        $results += Get-FolderItems $sub $filter
    }
    return $results
}

$items = Get-FolderItems $inbox $filter

$excludeSenders = @('itsm', 'sharepoint', 'do.not.reply+hrwf@sap.com')

$mails = @()
foreach ($mail in $items) {
    try {
        if ($mail.Class -ne 43) { continue }  # 43 = olMail
        $fromLower = ($mail.SenderName + ' ' + $mail.SenderEmailAddress).ToLower()
        if ($excludeSenders | Where-Object { $fromLower -like "*$_*" }) { continue }
        $toField  = $mail.To  -replace '\s+', ''
        $ccField  = $mail.CC  -replace '\s+', ''
        $toLower  = $toField.ToLower()
        $ccLower  = $ccField.ToLower()
        $iAmInTo  = ($MyAddresses + $MyDisplayNames) | Where-Object { $toLower -like "*$_*" }
        $iAmInCC  = ($MyAddresses + $MyDisplayNames) | Where-Object { $ccLower -like "*$_*" }
        $toCount  = if ($toField) { ($toField -split ';').Count } else { 0 }

        $isChef = $ChefNames | Where-Object { $fromLower -like "*$_*" }

        # prio: chef=from manager, direct=only me in To, action=me in To with others, cc=only CC, fyi=not addressed
        $prio = if ($isChef)                                { 'chef' }
                elseif ($iAmInTo -and $toCount -eq 1)       { 'direct' }
                elseif ($iAmInTo)                           { 'action' }
                elseif ($iAmInCC)                           { 'cc' }
                else                                        { 'fyi' }

        $bodyTrimmed = ($mail.Body -replace '\r?\n+', ' ').Trim()
        $mails += [PSCustomObject]@{
            date    = $mail.ReceivedTime.ToString("dd.MM.")
            time    = $mail.ReceivedTime.ToString("HH:mm")
            from    = $mail.SenderName
            to      = $mail.To
            cc      = $mail.CC
            prio    = $prio
            subject = $mail.Subject
            body    = $bodyTrimmed.Substring(0, [Math]::Min(300, $bodyTrimmed.Length))
        }
    } catch {
        Write-Warning "Skipping mail: $_"
    }
}

# Sort by time descending (newest first)
$mails = $mails | Sort-Object time -Descending

$filePath = Join-Path $outputDir "mails_heute.json"
$json = $mails | ConvertTo-Json -Depth 3
if ($null -eq $json -or $json -eq '') { $json = '[]' }
elseif ($json.TrimStart()[0] -ne '[') { $json = "[$json]" }
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($filePath, $json, $utf8NoBom)

$count = $mails.Count
Write-Host "Exported $count mails to: $filePath" -ForegroundColor Green
