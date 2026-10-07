@echo off
setlocal
title WeatherCG Desktop - dev
cd /d "%~dp0"
REM ==========================================================
REM  WeatherCG desktop (dev build, no installer)
REM  - Opens the LATEST ..\index.html in an app window
REM  - Starts the WNS helper automatically (KMA fetch / MXF / MOV / AE)
REM  - After editing code: press Ctrl+R in the app window to reload
REM ==========================================================
where node >nul 2>nul
if errorlevel 1 goto :nonode
if not exist "node_modules\electron\dist\electron.exe" goto :install
goto :run

:install
echo [1/2] First run: installing Electron, about 1-2 minutes...
call npm install --no-audit --no-fund
if errorlevel 1 goto :npmfail
REM some npm versions skip electron's postinstall - download the binary directly
if not exist "node_modules\electron\dist\electron.exe" node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" goto :npmfail

:run
echo [2/2] Starting WeatherCG desktop...
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:nonode
echo [ERR] Node.js not found. Install Node.js LTS first: https://nodejs.org
pause
exit /b 1

:npmfail
echo [ERR] npm install failed. Check the internet connection and run again.
pause
exit /b 1