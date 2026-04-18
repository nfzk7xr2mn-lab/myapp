# Start both live-server and write-server for the dashboard
# Run this script once; both servers keep running in separate windows

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Write server (Node.js, port 9001)
Start-Process "node" -ArgumentList "`"$appDir\write-server.js`"" `
    -WorkingDirectory $appDir `
    -WindowStyle Minimized

# Live server (port 5500) – assumes live-server is installed globally
Start-Process "cmd" -ArgumentList "/c npx live-server --port=5500 --no-browser `"$appDir`"" `
    -WorkingDirectory $appDir `
    -WindowStyle Minimized

Write-Host "Servers started:" -ForegroundColor Green
Write-Host "  App:          http://127.0.0.1:5500" -ForegroundColor Cyan
Write-Host "  Write server: http://127.0.0.1:9001" -ForegroundColor Cyan
