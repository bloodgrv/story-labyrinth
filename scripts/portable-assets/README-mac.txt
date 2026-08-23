Story Labyrinth — macOS Portable Build
==========================================

This is a self-contained build: it bundles its own Node.js runtime and all
dependencies, so no separate Node/Docker/Homebrew install is required.

To run:
  1. Double-click "Start Story Labyrinth.command"
  2. If macOS blocks it the first time ("cannot be opened because it is
     from an unidentified developer" or similar), see "First-run security
     prompt" below — this is expected for an unsigned freeware build, not
     a sign anything is wrong.
  3. Wait for the Terminal window to say the server is listening — your
     browser will open automatically to http://localhost:3000
  4. First run: you'll be asked to create an account (this app is
     password-protected, single account).

First-run security prompt (Gatekeeper):
  macOS blocks running a downloaded, unsigned .command script by default.
  Either:
    a) Right-click (or Control-click) "Start Story Labyrinth.command" ->
       Open -> Open, the first time only, or
    b) Run this once in Terminal, replacing the path with wherever you
       unzipped this folder:
         xattr -dr com.apple.quarantine "/path/to/Story Labyrinth folder"
  This build is not code-signed or notarized (freeware, no Apple
  Developer account) — Gatekeeper's warning is expected, not a red flag
  specific to this download. Full source is on GitHub if you want to
  verify what you're running (link below).

To stop:
  Close the Terminal window, or press Ctrl+C inside it. The server stops
  immediately.

Your data:
  Everything you create lives in the "data" folder next to this README —
  move or back up the whole top-level folder and your data moves with it.
  Updating (see below) never touches this folder.

Updating:
  Settings -> Updates (owner account only) checks GitHub for a newer
  release and, if you confirm, downloads and installs it automatically —
  the app restarts itself as part of the update. Each version lives in
  its own folder under "versions/", so a failed or interrupted update
  never damages your current install; if the new version doesn't start
  cleanly, it rolls back to the one you were already running. Older
  version folders are kept on disk (not auto-deleted) — safe to delete
  by hand from "versions/" once you're confident on a newer one.

Notes:
  - The server listens on all network interfaces by default (same as the
    Docker image's and Windows portable's default posture) — reachable
    from other devices on your LAN at http://<this-Mac's-LAN-IP>:3000.
    If you don't want that, you're on your own machine only anyway
    unless something else routes to it.
  - No installer, .app bundle, or menu-bar app — this is a portable/
    single-machine build. The Terminal window must stay open while
    running.
  - AI provider setup (OpenAI/OpenRouter/DeepSeek/Gemini/Grok, or a local
    OpenAI-compatible endpoint like LM Studio) happens inside the app,
    under Settings.

Full source, Docker image (also runs fine on Apple Silicon via Docker
Desktop, a separate path from this portable build), and documentation:
  https://github.com/bloodgrv/story-labyrinth
