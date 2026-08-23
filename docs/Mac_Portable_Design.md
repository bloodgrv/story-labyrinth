# Mac Portable Build — Design

**Status:** Design locked 2026-08-22 (Lean defaults). **Not built** until promoted.  
**Product:** Story Labyrinth (`storylabyrinth`) — same tier as the **Windows portable** (no Docker, no installer, browser UI + local server).  
**Canonical code today:** `scripts/build-portable.mjs`, `scripts/portable-assets/`, `scripts/portable-updater/`, `server/routes/update.ts`, Settings → Updates.  
**Related:** `DECISIONS.md` “Windows Portable Build…” (2026-08-21/22); Docker remains a separate path (`Dockerfile`, multi-arch Linux).

---

## 1. Job

Ship a **Mac single-machine portable** that matches the Windows portable *product shape*:

- Double-click (or clear one-step) start  
- Bundled Node runtime + production deps + built app + baked embedding cache  
- User data in a sibling `data/` folder (move the whole install folder → data moves)  
- In-app **Settings → Updates** (owner) that side-by-side installs a new `versions/<x.y.z>/` and rolls back on failed boot  
- **No** Docker, **no** Homebrew requirement for end users, **no** `.app` / Electron / Tauri / notarization in v1  

This is packaging + platform branches on the existing portable stack — **not** an app rewrite.

---

## 2. Non-goals (v1)

| Out | Why |
|-----|-----|
| Electron / Tauri / native `.app` shell | Web+server posture already locked; tray/Dock polish is a later product shell |
| Apple code-sign + notarization | Gatekeeper friction acceptable for freeware zip tier; document Right-click → Open / `xattr` |
| Mac App Store | Sandbox + local server + API keys are a different product |
| Cross-building darwin natives on Windows only | `better-sqlite3`, `sqlite-vec`, `canvas`, `onnxruntime-node` need a real darwin install |
| Universal binary in one zip | Two zips (arm64 / x64) is simpler and matches Node’s own publish layout |
| Changing Docker / Unraid paths | Already work on Apple Silicon via Linux arm64 images under Docker Desktop |
| Autostart / LaunchAgent / menu bar | Same deferral as Windows portable |
| Loopback-only bind by default | Keep parity with Win/Docker (all interfaces); document LAN exposure in Mac README |

---

## 3. Locked decisions (Lean)

### 3.1 Product parity with Windows

| Axis | Lock |
|------|------|
| Runtime model | Local **Node server** + system **browser** (`open http://localhost:$PORT`) |
| Layout | Same conceptual tree as Win portable (names below) |
| Data | `data/story-labyrinth.db` (+ WAL companions) next to launcher; never inside `versions/` |
| Env | `NODE_ENV=production`, `PORTABLE_BUILD=1`, `PORT` (default `3000`), `DATABASE_PATH` absolute under install root |
| Console | Terminal window stays open while server runs (`.command` / Terminal.app) — same “close window = stop” contract as the `.bat` |
| Auth / AI setup | Unchanged app behavior (first-run register, Settings providers) |

### 3.2 On-disk layout (install root)

```
Story-Labyrinth-portable-mac-arm64/   # folder name free; zip top-level entries matter
  Start Story Labyrinth.command      # executable bit set
  README.txt
  current-version.txt                # one line: x.y.z
  data/
    .keep                            # ensure empty dir survives zip tools
    story-labyrinth.db               # created on first boot
  updater/                           # copy of scripts/portable-updater (dependency-free)
  versions/
    <x.y.z>/
      node/                          # official Node darwin tarball extract
        bin/node
        ...
      app/
        package.json
        package-lock.json
        patches/
        dist/
        .embedding-model-cache/
        node_modules/                # npm ci --omit=dev ON DARWIN with bundled node on PATH
        updater-src/                 # shipped for self-update of root updater/
```

**Invariant (shared with Windows, keep absolute):** updater **never** writes into an existing `versions/<old>/`. Only create `versions/<new>/`, then flip `current-version.txt`. Failed download/extract leaves the running version untouched; failed boot after pointer flip rolls pointer back and respawns old.

### 3.3 Architectures & artifact names

| Priority | Platform id | Node dist | Fresh-install zip | Update payload zip |
|----------|-------------|-----------|-------------------|--------------------|
| **P0** | `mac-arm64` | `node-v{N}-darwin-arm64.tar.gz` | `Story-Labyrinth-portable-mac-arm64.zip` | `Story-Labyrinth-portable-mac-arm64-update.zip` |
| P1 (if demanded) | `mac-x64` | `node-v{N}-darwin-x64.tar.gz` | `…-mac-x64.zip` | `…-mac-x64-update.zip` |
| (existing) | `win-x64` | win-x64 zip | `…-win-x64.zip` | `…-win-x64-update.zip` |

- **Node version:** same pin as Windows builder (`NODE_RUNTIME_VERSION` in `build-portable.mjs` — single constant for all platforms).  
- **Default Mac ship target:** **Apple Silicon only** until someone needs Intel.  
- **No Rosetta-as-product:** do not ship arm64 and tell Intel users to “use Rosetta on the zip”; ship `mac-x64` if/when needed.

### 3.4 Two zip kinds (install vs update) — shared portable fix

Windows updater (`update-runner.mjs`) sanity-checks:

- `versions/<target>/node/node.exe`  
- `versions/<target>/app/dist/server/server/index.js`  

…after extracting the **release asset directly into** `versions/<target>/`.

The current Windows builder zips the **entire install root** (`Start.bat`, `data/`, nested `versions/…`). That shape is correct for **humans** and wrong for **updater extract-as-version-dir** unless a second payload exists.

**Lock for Mac and remediate on Windows in the same epic:**

| Artifact | Contents | Consumer |
|----------|----------|----------|
| **Fresh-install zip** | Full install root (launcher, README, `current-version.txt`, empty `data/`, `updater/`, `versions/<ver>/{node,app}`) | Humans, README, GitHub “download portable” |
| **Update zip** | **Only** the interior of `versions/<ver>/` — top-level entries `node/` and `app/` | `POST /api/update/start` → `update-runner.mjs` |

Both zips are produced by one build invocation per platform. GitHub Release attaches **both**.  
`server/routes/update.ts` selects the **update** asset name for the running platform (not the fresh-install name).

If GitHub’s asset `digest` field is missing on either, `assetAvailable` stays false (existing behavior).

### 3.5 Launcher (Mac)

**File:** `scripts/portable-assets/Start Story Labyrinth.command`

- `cd` to script directory (portable root)  
- Read `current-version.txt` (trim CR/LF)  
- Export env vars as in §3.1  
- Background: `sleep` then `open "http://localhost:$PORT"` (macOS `open`)  
- `exec` `"$ROOT/versions/$VER/node/bin/node" "$ROOT/versions/$VER/app/dist/server/server/index.js"`  
- On non-zero exit, leave Terminal open with a message (parity with `pause` on Windows — e.g. `read -r` or `exit` code echo; prefer a short “press Enter to close” so errors are readable)

**Executable bit:** build must `chmod +x` the `.command` and `versions/*/node/bin/node` before zipping; zip format must preserve mode bits (`ditto -c -k --keepParent` or `zip -ry` on macOS CI — **do not** use a Windows zip tool for the Mac artifact).

**Gatekeeper (docs only, v1):** README section:

1. If macOS blocks the app: Right-click → Open once, or  
2. `xattr -dr com.apple.quarantine "/path/to/Story Labyrinth folder"`

No signing pipeline in MP* slices.

### 3.6 Builder

**Extend** `scripts/build-portable.mjs` (do not fork a second unrelated script forever). CLI:

```text
node scripts/build-portable.mjs [--platform=win-x64|mac-arm64|mac-x64] [--skip-build] [--out=<dir>]
```

| Concern | Behavior |
|---------|----------|
| Default `--platform` | `win-x64` on Windows hosts; **fail closed** on darwin unless `--platform=mac-*` set (or default `mac-arm64` when `process.platform==='darwin' && arch==='arm64'`) |
| Node cache | `.portable-build-cache/node-v{N}-{platform}/` |
| Download | Official nodejs.org artifacts; extract with platform-native tools (`tar` on mac/linux, PowerShell on win) |
| `npm ci --omit=dev` | Always under **bundled** Node prepended to `PATH` (existing Win ABI fix — same rule on Mac) |
| Host OS gate | **`mac-*` builds refuse to run on non-darwin`** (clear error: use macOS runner / Mac). Win build may keep running on Windows only. |
| Smoke test | Same sequence as today: boot scratch DB, register, GET settings, assert JSON-array columns; kill process; use `bin/node` path on darwin |
| Outputs | Fresh-install zip **and** update zip named per §3.3; print `gh release upload` hints for both |
| npm script | `build:portable` stays; optional `build:portable:mac` → `node scripts/build-portable.mjs --platform=mac-arm64` |

**Dist compile:** `npm run build` (TS/Vite) is OS-agnostic and may run on the Mac builder. Do **not** copy `node_modules` from Windows into a Mac payload.

**Optional optimization (not required v1):** build `dist/` + embedding prefetch on Linux/Win CI as artifacts, Mac job only does runtime + `npm ci` + assemble — only if it saves real minutes; default is one-shot Mac job for simplicity.

### 3.7 Updater (shared portable)

Generalize Win-only paths:

| Spot | Today (Win) | Mac / multi |
|------|-------------|-------------|
| Node binary | `versions/v/node/node.exe` | `…/node/bin/node` on darwin; keep `.exe` on win |
| Extract | `powershell Expand-Archive` | darwin: `/usr/bin/unzip -q` into version dir; win: keep PowerShell |
| Spawn server | `node.exe` + env | same env; correct binary path |
| Kill old | `process.kill(pid)` | same (works on darwin); no taskkill required for v1 |
| Detached spawn | `detached: true`, `unref()` | same; verify updater outlives parent on macOS |
| Asset name | hardcoded `…-win-x64.zip` | **update** zip for platform (§3.3) |
| `update.ts` spawn node | `node.exe` under current version | platform node path helper |

**Platform detection for asset selection** (server, portable only):

```text
PORTABLE_PLATFORM env if set
else win32+x64 → win-x64
else darwin+arm64 → mac-arm64
else darwin+x64 → mac-x64
else → no asset / clear error on /start
```

Launcher and builder set `PORTABLE_PLATFORM=mac-arm64` (etc.) so a weird Node build cannot mis-detect. `/api/update/mode` may grow:

```json
{ "portable": true, "platform": "mac-arm64" }
```

Frontend can ignore `platform` in v1 (still only shows Updates when `portable`).

**Update zip extract layout:** after unzip, version dir must contain `node/` and `app/` immediately (no nested `versions/x.y.z/`).

### 3.8 CI

**Lock:** GitHub Actions `macos-14` (or newer arm64 macOS runner) workflow, e.g. `.github/workflows/portable-mac.yml`:

- Trigger: `workflow_dispatch` + optional tag `v*` (mirror whatever Win release process becomes)  
- Steps: checkout → setup nothing exotic if bundling Node ourselves → `node scripts/build-portable.mjs --platform=mac-arm64` (workflow may install a host Node only to run the builder script, or use a bootstrap node)  
- Upload both zip artifacts; on tag, `gh release upload` both  
- Fail job if smoke test fails  

Windows portable may stay local-build-on-dev-machine initially; **Mac is CI-first** because the primary SL dev host is Windows.

Optional later: Windows portable also on `windows-latest` for reproducibility.

### 3.9 README / user docs

Mac `README.txt` (from `scripts/portable-assets/`):

- Double-click `Start Story Labyrinth.command`  
- First run: account create  
- Data folder semantics  
- Updates via Settings (owner)  
- Gatekeeper / quarantine blurb  
- LAN bind note (parity with Win)  
- Link to GitHub / Docker alternative  

Root `README.md`: short “macOS portable” subsection pointing at release assets (when first shipped).

### 3.10 Brand / chrome

No special Mac branding. Use existing SL icons in docs only; dock icon N/A without `.app`.

---

## 4. Implementation slices

| ID | Slice | Done when |
|----|-------|-----------|
| **MP0** | **Portable platform matrix + update-payload split (shared)** | `build-portable.mjs` emits **fresh + update** zips for `win-x64`; `update.ts` + `update-runner.mjs` use `*-update.zip` and a single `nodeBinaryFor(versionDir)` helper; Win smoke + manual update path still sane. *Unblocks Mac and fixes Win updater/asset mismatch.* |
| **MP1** | **Mac builder path** | `--platform=mac-arm64` on a Mac host: download darwin Node, assemble layout, `npm ci` under bundled node, smoke test green, both zips produced; refuses to run on Windows. |
| **MP2** | **Launcher + Mac README assets** | `.command` + README; modes preserved in zip; manual double-click boot on a real Mac (or CI-equivalent file mode checks + smoke). |
| **MP3** | **Updater darwin branch** | extract via `unzip`; spawn/kill/`bin/node`; `PORTABLE_PLATFORM`; `/mode` includes platform; Settings Updates downloads **mac** update asset when running Mac portable. |
| **MP4** | **CI + release wiring** | `portable-mac` workflow on `macos-14`; artifacts on dispatch; tag upload instructions or automation; document in release checklist. |
| **MP5** | **Intel optional** | Only if requested: `mac-x64` twin of MP1–MP4. |

**Suggested build order:** MP0 → MP1 → MP2 → MP3 → MP4. Do not ship Mac fresh zip without MP0/MP3 if advertising in-app Updates.

**Promote rule:** user says build/implement Mac portable (or MP*) → Hermes or Claude implements in fork; design stays this doc.

---

## 5. Risks & pitfalls

| Risk | Mitigation |
|------|------------|
| Building Mac zip on Windows with wrong natives | Hard refuse non-darwin for `mac-*` |
| Zip tools dropping `+x` | Produce Mac zips only on macOS; verify `bin/node` executable in smoke |
| Gatekeeper scares users | README; no fake “signed” claims |
| `canvas` / sqlite-vec / onnx fail on darwin | Reuse Docker’s verify scripts in smoke or post-`npm ci` (`verify-sqlite-vec.mjs`, embedding verify if cheap enough) |
| Updater downloads full install zip into `versions/x` | MP0 two-asset model |
| Quarantine on nested `node` after update | Document; optional `xattr` clear in updater on darwin after extract (nice-to-have in MP3 if reproducible) |
| CI minutes / large artifacts (~embedding cache) | Accept size parity with Win; cache Node tarball in Actions cache |
| Confusing Docker arm64 with Mac portable | README: Docker ≠ double-click portable |

---

## 6. Acceptance (epic done)

- [ ] On Apple Silicon Mac: unzip **fresh** zip → double-click `.command` → browser opens → register → Settings works (including Local / embeddings path if exercised)  
- [ ] `data/` survives replacing only `versions/` / updates  
- [ ] Settings → Updates finds newer release when **mac-arm64-update** asset present with digest; applies; boots new version; old folder retained  
- [ ] Forced bad update payload rolls back pointer and old server answers health  
- [ ] Win portable still builds and Updates still work after MP0  
- [ ] Design + backlog + DECISIONS trail consistent  

---

## 7. Out of scope reminders

- Notarized `.app`, Sparkle, Homebrew cask (possible later wrappers around the same `versions/` tree)  
- Changing server listen defaults  
- Merging PAM / SN product scope  

---

*Locked Lean 2026-08-22: Mac portable = Windows portable twin; arm64 first; two zip kinds (fresh vs update); build on macOS/CI only; generalize updater/paths; no Electron/sign v1.*
