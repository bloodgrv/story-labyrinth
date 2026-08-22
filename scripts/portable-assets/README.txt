Story Labyrinth — Windows Portable Build
==========================================

This is a self-contained build: it bundles its own Node.js runtime and all
dependencies, so no separate Node/Docker install is required.

To run:
  1. Double-click "Start Story Labyrinth.bat"
  2. Wait for the console window to say the server is listening — your
     browser will open automatically to http://localhost:3000
  3. First run: you'll be asked to create an account (this app is
     password-protected, single account).

To stop:
  Close the console window. The server stops immediately.

Your data:
  Everything you create lives in the "data" folder next to this README —
  move or back up the whole top-level folder and your data moves with it.
  Updating (see below) never touches this folder.

Updating:
  Settings -> Updates (owner account only) checks GitHub for a newer
  release and, if you confirm, downloads and installs it automatically —
  the app restarts itself as part of the update. Each version lives in
  its own folder under "versions\", so a failed or interrupted update
  never damages your current install; if the new version doesn't start
  cleanly, it rolls back to the one you were already running. Older
  version folders are kept on disk (not auto-deleted) — safe to delete
  by hand from "versions\" once you're confident on a newer one.

Notes:
  - The server listens on all network interfaces by default (same as the
    Docker image's default posture) — reachable from other devices on your
    LAN at http://<this-pc's-LAN-IP>:3000. If you don't want that, you're
    on your own machine only anyway unless something else routes to it.
  - No installer, Windows service, or tray icon — this is a portable/
    single-machine build. The console window must stay open while running.
  - AI provider setup (OpenAI/OpenRouter/DeepSeek/Gemini/Grok, or a local
    OpenAI-compatible endpoint like LM Studio) happens inside the app,
    under Settings.

Full source, Docker image, and documentation:
  https://github.com/bloodgrv/story-labyrinth
