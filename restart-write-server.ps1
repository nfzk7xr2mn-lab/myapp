$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port   = 9001

# Stop existing node process on port 9001
$proc = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue |
        Select-Object -Unique
if ($proc) {
    Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
    Write-Host "Write server gestoppt (PID $proc)" -ForegroundColor Yellow
    Start-Sleep -Milliseconds 500
}

# Start write server
Start-Process "node" -ArgumentList "`"$appDir\write-server.js`"" `
    -WorkingDirectory $appDir `
    -WindowStyle Minimized

Write-Host "Write server gestartet: http://127.0.0.1:$port" -ForegroundColor Green
