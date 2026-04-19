# Registers export_outlook_mails.ps1 as a scheduled task
# Runs every 5 minutes, only when user is logged in (required for Outlook COM access)

$appDir = "C:\Users\D025095\myapp\myapp"
$ps     = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$script = "$appDir\export_outlook_mails.ps1"

$action  = New-ScheduledTaskAction `
    -Execute $ps `
    -Argument "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $appDir

$trigger  = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once `
    -At (Get-Date).Date

$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName  "MyApp Mail Export" `
    -Action    $action `
    -Trigger   $trigger `
    -Principal $principal `
    -Settings  $settings `
    -Force

Write-Host "Task 'MyApp Mail Export' registriert." -ForegroundColor Green
Write-Host "Laeuft alle 5 Minuten, nur wenn du angemeldet bist." -ForegroundColor Cyan
