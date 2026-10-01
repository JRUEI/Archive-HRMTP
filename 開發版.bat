@echo off
rem Double-click: start the local dev site (with editing tools) and open it in the browser.
rem To stop: close the minimized "harumatope dev" window on the taskbar.
cd /d "%~dp0"

netstat -ano | findstr ":3000 " | findstr LISTENING >nul && goto open

start "harumatope dev" /min cmd /k npm run dev

:wait
curl -s -o nul http://localhost:3000 && goto open
timeout /t 1 /nobreak >nul
goto wait

:open
start "" http://localhost:3000
