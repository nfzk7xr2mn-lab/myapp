# Start both live-server and write-server for the dashboard
# Run this script once; both servers keep running in separate windows

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port   = 9001

# Stop processes on port 9001 and 5500 only (not all node processes)
foreach ($p in @(9001, 5500)) {
    $procs = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
             Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue |
             Where-Object { $_ -gt 0 } | Select-Object -Unique
    foreach ($procId in $procs) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "Prozess auf Port $p gestoppt (PID $procId)" -ForegroundColor Yellow
    }
}
Start-Sleep -Milliseconds 1000

# Write server (Node.js, port 9001)
Start-Process "node" -ArgumentList "`"$appDir\write-server.js`"" `
    -WorkingDirectory $appDir `
    -WindowStyle Minimized

# Live server (port 5500) – assumes live-server is installed globally
Start-Process "cmd" -ArgumentList "/c npx live-server --port=5500 --no-browser --ignore=`"data,knowledge`" `"$appDir`"" `
    -WorkingDirectory $appDir `
    -WindowStyle Minimized

Write-Host "Servers gestartet:" -ForegroundColor Green
Write-Host "  App:          http://127.0.0.1:5500" -ForegroundColor Cyan
Write-Host "  Write server: http://127.0.0.1:9001" -ForegroundColor Cyan

Start-Sleep -Milliseconds 2000
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chrome) {
    Start-Process $chrome -ArgumentList "--app=http://127.0.0.1:5500 --window-size=1280,64 --window-position=0,736"
    Write-Host "  Chrome App gestartet" -ForegroundColor Cyan
} else {
    Write-Host "  Chrome nicht gefunden - bitte manuell oeffnen: http://127.0.0.1:5500" -ForegroundColor Yellow
}
