---
name: run-storylabyrinth
description: Build, run, and drive Story Labyrinth (Express + Vite full-stack app). Use when asked to start the app, run the dev server, take a screenshot of its UI, log in, or interact with the running app.
---

Story Labyrinth is a full-stack web app: an Express/tsx API server (port 3001)
and a Vite/React client (port 5173), started together via `npm run dev`. It's
password-protected behind a single-account login. Drive it with the
`mcp__Claude_Browser__*` tools (this harness's native browser-automation
MCP) — no `chromium-cli` needed, it isn't installed here.

## Prerequisites

Node 25.9 (`node -v`), npm 11 — whatever the environment already has is fine,
no version pin observed. Windows/PowerShell environment; no `apt-get` step —
all deps (including native modules like `better-sqlite3`, `sqlite-vec`,
`onnxruntime-node`) install via plain `npm install` with no extra system
packages needed in this environment.

## Setup

```bash
npm install
```

`postinstall` runs `patch-package` automatically. No `.env` file is required
for dev — the app runs with defaults out of the box (verified: fresh
`npm run dev` served a working login/account-creation screen with no env
config present).

## Build

Not needed for dev. (`npm run build` exists for production but wasn't
exercised here — dev mode is the agent path.)

## Run (agent path)

**Prefer the split launch, not the combined `"dev"` entry.** The combined
entry (`npm run dev` = `concurrently` over `dev:server` — `tsx watch
server/index.ts` — and `dev:client` — `vite`) has a known flake in this
environment: the Vite client comes up fine but the Express child under
`tsx watch` sometimes never boots — zero output, not even its first
`console.log` — and every `/api/*` call fails with ECONNREFUSED via the
Vite proxy (surfaces to the browser as a generic 500). It's a
process/tooling artifact, not a code bug, and it isn't reliably
detectable without watching for the missing server log lines. Confirmed
reproducible; see Gotchas.

Launch server and client as two separate `.claude/launch.json` entries
instead — `server-only` (plain non-watch `tsx server/index.ts`, boots
reliably in ~15-20s) and `client-only` (`vite`), both against the same
dev DB:

```
mcp__Claude_Browser__preview_start { "name": "server-only" }
mcp__Claude_Browser__preview_start { "name": "client-only" }
```

`client-only`'s result gives you the `tabId` to drive — the server has no
UI of its own. Wait ~10-20s after the server call before treating a 500
as a real bug (first non-watch `tsx` boot takes a beat); if `/api/*`
calls are still failing after that, check `preview_logs` on the
`server-only` serverId for an actual stack trace before assuming it's
just slow.

If you only need the combined `"dev"` entry for some reason (e.g. it's
what a script or CI step already assumes), you can still launch it the
same way:

```
mcp__Claude_Browser__preview_start { "name": "dev" }
```

This starts both processes and opens a browser tab at `http://localhost:5173`
for you — the result includes a `tabId`; use that (not a fresh `navigate`
call, see Gotchas) with `computer` / `read_page` / `read_console_messages`.
Watch for the server flake above before trusting it came up clean.

Vite is ready in ~1.4s; the page may show a brief loading spinner first.
Wait ~2s, then screenshot:

```
mcp__Claude_Browser__computer { "action": "screenshot", "tabId": "<tabId>" }
```

You'll land on one of two screens depending on whether the dev SQLite DB
already has an account:

- **"Create Your Account"** — fresh DB, one-time setup form (Username /
  Password / Confirm Password → "Create Account").
- **"Log In"** — DB already has an account. Use the saved dev credentials
  (see the project's memory / `dev_test_account.md` — not repeated here
  since this file may be committed).

Verified full flow this session: `preview_start` → screenshot (loading) →
screenshot (login form) → `read_page` (filter: interactive) to get field
refs → `form_input` username/password → `computer` click the submit
button ref → screenshot shows the "Your Stories" dashboard with real
story data, and `read_console_messages { onlyErrors: true }` came back
clean.

| step | tool call |
|---|---|
| launch | `preview_start { name: "dev" }` |
| inspect fields | `read_page { tabId, filter: "interactive" }` → returns `ref_N` for username/password/submit |
| fill | `form_input { ref, value, tabId }` per field |
| submit | `computer { action: "left_click", ref: <submit-ref>, tabId }` |
| verify | `computer { action: "screenshot", tabId }` and `read_console_messages { tabId, onlyErrors: true }` |

To stop, use `preview_stop` with the `serverId` from `preview_start`'s
result (or `preview_list` if you lost it — note server-side, `dev`'s two
child processes can show up there as separate `server-only`/`client-only`
entries; that's fine, they share the one dev DB).

## Run (human path)

```bash
npm run dev   # → server on :3001, client on :5173. Ctrl-C to stop both.
```

## Test

```bash
npm run test
```

(Vitest — not exercised in this session beyond confirming the script exists.)

---

## Gotchas

- **`tsx watch` under `concurrently` (the combined `"dev"` launch) sometimes
  never brings the Express half up.** Vite starts and logs normally, but
  the server child produces zero output and `/api/*` requests fail with
  ECONNREFUSED via the proxy (shows up in the browser as a generic 500 —
  e.g. `/api/auth/status` and `/api/auth/register` both 500ing on an
  otherwise-correct account-creation submit). Not fixable by waiting
  longer or retrying the request. **Fix:** stop it (`preview_stop` on
  that serverId) and relaunch with `server-only` + `client-only` as two
  separate `preview_start` calls instead — this is now the default
  recommendation above, not just a fallback.
- **Don't call `navigate` right after `preview_start`.** `preview_start`
  already opens and points a tab at the dev URL; an immediate
  `navigate { url: "http://localhost:5173" }` on the same tab was denied/failed
  in this session. Just screenshot the `tabId` you already have.
- **First screenshot can catch a loading spinner**, not the real page —
  Vite's first compile + the app's own splash take a couple seconds. Wait
  ~2s and re-screenshot rather than trusting the first frame.
- **The app is password-gated with exactly one account.** There's no
  registration flow beyond the very first "Create Your Account" screen —
  if a DB already has an account, you must know its credentials (see the
  project's memory / `dev_test_account.md` for the standing dev login) or
  you're stuck at the login screen.
- **`preview_list` can report the "dev" launch as two separate process
  entries** (`server-only` / `client-only`) even though you launched it
  once as `"dev"` — both point at the same running processes and DB, this
  isn't a duplicate launch.
