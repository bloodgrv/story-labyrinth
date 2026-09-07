#!/bin/bash
# Story Labyrinth macOS portable launcher. Mirrors "Start Story Labyrinth.bat"'s contract:
# double-click to run, close this Terminal window (or Ctrl+C) to stop the server.
set -u
cd "$(dirname "$0")"

CURRENT_VERSION="$(tr -d '\r\n' < current-version.txt)"

export NODE_ENV=production
export PORTABLE_BUILD=1
export PORT="${PORT:-3000}"
export DATABASE_PATH="$(pwd)/data/story-labyrinth.db"

# Derived, not hardcoded, so the same launcher script works unchanged on both mac-arm64 and
# mac-x64 zips (matches docs/Mac_Portable_Design.md §3.7's PORTABLE_PLATFORM detection).
if [ "$(uname -m)" = "arm64" ]; then
    export PORTABLE_PLATFORM=mac-arm64
else
    export PORTABLE_PLATFORM=mac-x64
fi

echo "Starting Story Labyrinth v${CURRENT_VERSION}..."
echo "Data folder: $(pwd)/data"
echo ""
echo "Once it says the server is listening, your browser will open automatically."
echo "Closing this window (or pressing Ctrl+C) stops the server."
echo ""

( sleep 2; open "http://localhost:${PORT}" ) &

"./versions/${CURRENT_VERSION}/node/bin/node" "./versions/${CURRENT_VERSION}/app/dist/server/server/index.js"
STATUS=$?

# An in-app update stops THIS window's server and starts the new version detached, with no window of
# its own — so node exits here while the app is still running (and with a non-zero status, since it
# was signalled, which the error branch below would otherwise report as a crash). Check the port
# before blaming anything: closing this window does NOT stop the replacement.
still_running=false
if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && still_running=true
elif command -v curl >/dev/null 2>&1; then
    # -s (not -sS): a refused connection is the normal "it really did stop" case, and curl's own
    # error text printed here would read as a fault rather than the expected outcome.
    curl -fs -o /dev/null --max-time 2 "http://localhost:${PORT}/api/health" 2>/dev/null && still_running=true
fi

if [ "$still_running" = true ]; then
    echo ""
    echo "------------------------------------------------------------------"
    echo "Story Labyrinth is STILL RUNNING on port ${PORT}."
    echo ""
    echo "This window's copy has stopped, which normally means you updated"
    echo "from inside the app: the new version took over and runs in the"
    echo "background. Closing this window will NOT stop it."
    echo ""
    echo "  Use it:   http://localhost:${PORT}"
    echo "  Stop it:  http://localhost:${PORT}/_status  (\"Shutdown server\")"
    echo "------------------------------------------------------------------"
elif [ "$STATUS" -ne 0 ]; then
    echo ""
    echo "Story Labyrinth exited with an error (code $STATUS). See the output above for details."
fi

echo ""
read -r -p "Press Enter to close this window..." _
