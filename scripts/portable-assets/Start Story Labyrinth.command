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

if [ "$STATUS" -ne 0 ]; then
    echo ""
    echo "Story Labyrinth exited with an error (code $STATUS). See the output above for details."
fi

echo ""
read -r -p "Press Enter to close this window..." _
