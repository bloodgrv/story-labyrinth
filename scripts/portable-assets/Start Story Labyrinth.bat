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

REM An in-app update stops THIS window's server and starts the new version detached, with no window
REM of its own — so node exits here while the app is still running. Without this check the window
REM just drops to "Press any key", after having promised that closing it stops the server, and the
REM user is left believing they shut something down that is still up.
netstat -an | findstr /C:":%PORT% " | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo ------------------------------------------------------------------
    echo Story Labyrinth is STILL RUNNING on port %PORT%.
    echo.
    echo This window's copy has stopped, which normally means you updated
    echo from inside the app: the new version took over and runs in the
    echo background. Closing this window will NOT stop it.
    echo.
    echo   Use it:   http://localhost:%PORT%
    echo   Stop it:  http://localhost:%PORT%/_status  ("Shutdown server")
    echo ------------------------------------------------------------------
    echo.
)

pause
