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

REM Run the server under a renamed copy of the Node binary, so it is identifiable in Task Manager
REM rather than being one anonymous node.exe among however many others a machine is running.
REM
REM Made here (once per version) instead of shipped: a zip stores a hard link as a full second copy,
REM which would add ~32 MB to every download for the sake of a filename. mklink /H needs no admin
REM rights and costs no disk space. If it can't be made — FAT32 stick, read-only install folder, an
REM older version folder — we simply run node.exe as before. This is a label, and a label must never
REM stop the app from starting.
set "NODE_EXE=%~dp0versions\%CURRENT_VERSION%\node\node.exe"
set "SERVER_EXE=%~dp0versions\%CURRENT_VERSION%\node\story-labyrinth-server.exe"
if not exist "%SERVER_EXE%" mklink /H "%SERVER_EXE%" "%NODE_EXE%" >nul 2>&1
if not exist "%SERVER_EXE%" set "SERVER_EXE=%NODE_EXE%"

"%SERVER_EXE%" "%~dp0versions\%CURRENT_VERSION%\app\dist\server\server\index.js"

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
