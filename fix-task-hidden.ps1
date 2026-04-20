# fix-task-hidden.ps1
# Setzt -WindowStyle Hidden fuer alle MyApp Scheduled Tasks

$taskNames = @('MyApp Mail Export', 'MyApp Mail Summary', 'MyApp Outlook Export', 'MyApp Outlook Mails')

foreach ($name in $taskNames) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host "  Nicht gefunden: $name" -ForegroundColor Yellow
        continue
    }
    $action = $task.Actions[0]
    if ($action.Arguments -notlike '*-WindowStyle Hidden*') {
        $action.Arguments = $action.Arguments -replace '-NonInteractive', '-NonInteractive -WindowStyle Hidden'
        Set-ScheduledTask -TaskName $name -Action $action | Out-Null
        Write-Host "  Aktualisiert: $name" -ForegroundColor Green
    } else {
        Write-Host "  Bereits Hidden: $name" -ForegroundColor Gray
    }
}
