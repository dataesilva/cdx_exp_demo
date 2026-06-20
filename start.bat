@echo off
REM CD3 launcher for Windows. Double-click to run. Installs dependencies,
REM builds, then starts the HTTPS server the Quest 3 connects to over Wi-Fi.
cd /d "%~dp0"

echo ==> Installing dependencies (first run can take a few minutes)...
call npm install || (echo npm install failed - is Node.js installed? https://nodejs.org & pause & exit /b 1)

echo ==> Building...
call npm run build || (echo build failed & pause & exit /b 1)

echo ==> Starting server.
echo ==> Open the https://^<Network^> URL printed below in the Quest 3 browser.
echo ==> If Windows Firewall prompts, click "Allow access". Close this window to stop.
call npm run preview
pause
