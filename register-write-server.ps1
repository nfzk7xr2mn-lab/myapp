# Register write-server.js as a Task Scheduler task (runs at logon, stays running)

$appDir  = "C:\Users\D025095\myapp\myapp"
$node    = (Get-Command node -ErrorAction Stop).Source

$action  = New-ScheduledTaskAction `
    -Execute $node `
    -Argument "`"$appDir\write-server.js`"" `
    -WorkingDirectory $appDir

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName   "MyApp Write Server" `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -RunLevel   Highest `
    -Force

# Start immediately without waiting for next logon
Start-ScheduledTask -TaskName "MyApp Write Server"

Write-Host "Write server task registered and started." -ForegroundColor Green
