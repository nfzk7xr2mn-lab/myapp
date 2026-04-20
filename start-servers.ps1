# Start both live-server and write-server for the dashboard
# Run this script once; both servers keep running in separate windows

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port   = 9001

# Stop existing servers on port 9001 and 5500
foreach ($p in @(9001, 5500)) {
    $proc = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue |
            Select-Object -Unique
    if ($proc) {
        Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
        Write-Host "Alter Prozess auf Port $p gestoppt (PID $proc)" -ForegroundColor Yellow
    }
}
Start-Sleep -Milliseconds 700

# Write server (Node.js, port 9001)
Start-Process "node" -ArgumentList "`"$appDir\write-server.js`"" `
    -WorkingDirectory $appDir `
    -WindowStyle Minimized

# Live server (port 5500) – assumes live-server is installed globally
Start-Process "cmd" -ArgumentList "/c npx live-server --port=5500 --no-browser --ignore=`"Daten,Wissen`" `"$appDir`"" `
    -WorkingDirectory $appDir `
    -WindowStyle Minimized

Write-Host "Servers gestartet:" -ForegroundColor Green
Write-Host "  App:          http://127.0.0.1:5500" -ForegroundColor Cyan
Write-Host "  Write server: http://127.0.0.1:9001" -ForegroundColor Cyan
