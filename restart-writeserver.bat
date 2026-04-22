@echo off
taskkill /f /im node.exe 2>nul
timeout /t 1 /nobreak >nul
start /min "" node "C:\Users\D025095\myapp\myapp\write-server.js"
start /min "" cmd /c "npx live-server --port=5500 --no-browser --ignore=data,knowledge C:\Users\D025095\myapp\myapp"
echo Server gestartet.
