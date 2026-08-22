@echo off
setlocal
cd /d "%~dp0"

set /p CURRENT_VERSION=<current-version.txt

set NODE_ENV=production
set PORTABLE_BUILD=1
set PORT=3000
set DATABASE_PATH=%~dp0data\story-labyrinth.db

echo Starting Story Labyrinth v%CURRENT_VERSION%...
echo Data folder: %~dp0data
echo.
echo Once it says the server is listening, your browser will open automatically.
echo Closing this window stops the server.
echo.

start "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:%PORT%"

"%~dp0versions\%CURRENT_VERSION%\node\node.exe" "%~dp0versions\%CURRENT_VERSION%\app\dist\server\server\index.js"

pause
