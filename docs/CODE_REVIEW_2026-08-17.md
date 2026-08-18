# Story Labyrinth — Code Review Findings

| | |
|---|---|
| **Date** | 2026-08-17 |
| **Scope** | Whole-fork static review (read-only) — security, correctness, architecture, client risk, tests/ops |
| **Repo** | `E:\StoryNexus-Fork` · package `storylabyrinth@0.8.16` · git ~219 ahead of origin |
| **Stack** | Express 5 · better-sqlite3 · Drizzle · React 19 · Vite · Lexical 0.48 · sqlite-vec |
| **Scale** | ~796 TS/TSX app files · `src/` ~6.1MB · `server/` ~12MB · 76 SQL migrations · `schema.ts` ~1.6k LOC |
| **Method** | Live source inspection + targeted greps + parallel domain reviews. **No code was changed.** |
| **Not this doc** | Product design grill, UX T8 polish, Glass Orchard journey QA (see `docs/2026-08-15_Glass_Orchard_QA_Pass.md` — many of those bugs already fixed B13–B21) |

**Threat model assumed:** personal / LAN / Tailscale tool with optional multi-user roles (`owner` | `editor` | `viewer`). Not a public multi-tenant SaaS. Severity is scored against *that* model — public internet exposure would raise several Mediums to High/Critical.

---

## Executive summary

Story Labyrinth is a **mature, heavily intentional fork**: real propose→accept doctrine in code, serial in-process jobs with crash recovery, hybrid RAG, and unusually thorough design/decision records. Auth fundamentals (httpOnly cookie, hashed session tokens, scrypt passwords, login lockout, viewer mutation block, owner gates on spend/admin) are **solid for a private deployment**.

The main technical debt is not “missing features” — it is **concentration of risk and complexity**:

1. **Generic CRUD mass-assignment** (`server/lib/crud.ts`) trusts `req.body` on many core tables.
2. **Upload path helpers** join DB-stored filenames without basename/jail checks — dangerous if a column is ever client-writable.
3. **Research `fetchPage`** is an unauthenticated (session-only) SSRF primitive to any `http(s)` URL, including RFC1918/link-local.
4. **Codex approve TOCTOU** — non-atomic pending→apply→resolve vs memory’s transactional approve.
5. **Dual story-scan pipelines** — legacy fire-and-forget IIFE still live beside durable `agentJobs`.
6. **No automated test suite** in package scripts — regression safety is manual + Glass Orchard–style dogfood.
7. **God components/services** (`ChatInterface.tsx` ~2k LOC, `chatContextService.ts` ~1.4k LOC) concentrate continuity bugs.

Nothing found looks like an active backdoor or hardcoded production secret in source. Highest ROI next work is **hardening trust boundaries + approve/job correctness**, not more product surface.

**Addendum:** Server architecture deep-dive (async subagent, 2026-08-18) verified and merged as **C1–C2**, **H4–H7**, **M10–M13**.  
**Addendum 2:** Client/UI deep-dive merged as **C3–C4**, **H8–H11**, **M14–M16**.  
**Addendum 3:** Security deep-dive merged as **H12–H15**, **M17–M20**, **L15–L18** (several items refine H2/H3).

---

## Strengths (keep these)

| Area | Evidence |
|------|----------|
| Session design | `server/middleware/auth.ts` — httpOnly, `sameSite: "lax"`, optional `COOKIE_SECURE`; raw cookie parse without extra deps |
| Password / sessions | `passwordService.ts` scrypt N=2^17 + timingSafeEqual; session tokens hashed SHA-256 before store (`authService.ts`) |
| Login abuse | In-memory lockout after 5 failures / 15 min |
| Role gates | Global `requireAuth` + `blockViewerMutations`; `requireOwner` on `/api/ai`, `/api/admin`, `/api/agent/jobs`, `/api/users`, `/_status` |
| Job runner | Serial tick, crash recovery, cadence enqueue, graceful stop wait (`jobRunner.ts`) — matches CLAUDE “one container one SQLite” |
| Story scan resume (B4) | Progress + `scanId` written before chapter loop; batch resume is contiguous |
| Enqueue dedup | Atomic `sqlite.transaction` in `agentJobsRepository.enqueue` |
| Memory approve | Properly transactional (`activatePendingAndSupersede`) — **gold standard** for Codex to copy |
| RAG index primitives | Chunk delete+replace in one tx; embedding fail-soft → FTS-only |
| Codex secrets | **Never** applied from AI proposals (`approvePendingChange` forces entry’s own secrets) |
| MultiView B11 | Remount `key={chapterId}` + `chapter-load` / `hasSeenLoad` save gate |
| Image writes | Lorebook/map saves use **server-generated UUID filenames** + mime allowlists + magic-byte sniff for AI images |
| Markdown chat | `MarkdownRenderer.tsx` uses `rehypeRaw` **with** `rehypeSanitize`; external links `rel="noopener noreferrer"`; **no** `dangerouslySetInnerHTML` in `src/` |
| SQL baseline | Drizzle + bound parameters; no classic string-built SQLi found in review |
| Continuity doctrine | Propose/accept trays, auto-accept default OFF, dual-gate notes — consistently implemented, not just docs |
| Decision culture | `DECISIONS.md` / backlog size — load-bearing choices are reconstructable |
| Build gate | `npm run build` = client tsc + server tsc + vite; oxlint present |
| Chapter prose unmount | `saveContent.flush()` on unmount (fixed known cancel-on-unmount loss) |
| Error boundaries | Root + chat rails + editor with resetKeys |

---

## Findings

Severity key: **C**ritical · **H**igh · **M**edium · **L**ow · **I**nfo  
Effort: S/M/L for a fix if you later promote one.

---

### Critical / High

#### C1 — Codex pending approve is not atomic (TOCTOU)

| | |
|---|---|
| **Where** | `server/services/codexService.ts` `approvePendingChange` (~225–279); `codexRepository.resolvePendingChange` |
| **Risk** | Flow is check `status === "pending"` → mutate live entry → create snapshot → resolve status **without** a single transaction or `UPDATE … WHERE status='pending'`. Concurrent double-approve (double-click, two tabs, auto-accept race) can apply twice and/or double-snapshot. |
| **Evidence** | Verified live: no conditional update on resolve; contrast `agentMemoriesRepository.activatePendingAndSupersede` which is transactional. Comment claims “Idempotent on the snapshot side” but that is not the same as single-apply. |
| **Recommendation** | One transaction: claim row with `UPDATE … SET status='approved' WHERE id=? AND status='pending'` (0 rows → abort); then apply fields + snapshot. Mirror memory path. Same class on graph-edge / timeline-pin approve (lower frequency — M11). |
| **Effort** | M |

#### C2 — Legacy fire-and-forget story scan still live beside durable jobs

| | |
|---|---|
| **Where** | `POST /api/rag/scan/story/:storyId` → `scanStory()` IIFE (`routes/rag.ts` ~162–170; `ragScanner.ts`) |
| **Risk** | No `agentJobs` row, no crash recovery, can race the job-path `rag_scan_story` against the same story. Two pipelines to maintain; UI/history can diverge. |
| **Recommendation** | Retire or hard-redirect legacy route to `enqueue({ jobType: "rag_scan_story" })`. One path only. |
| **Effort** | S–M |

#### C3 — MultiView: same chapter in two panes → last-write-wins data loss

| | |
|---|---|
| **Where** | `splitPaneInTree` defaults new pane to **same chapter**; each pane mounts own Lexical + `SaveChapterContentPlugin`; `activeChapterEditorStore` is **one slot per chapterId** (last mount wins); chapter PUT is full-content LWW (no etag) |
| **Risk** | Edits in pane A overwritten by pane B’s debounced save or unmount `flush()`. Prose Accept/auto-insert targets the last-mounted editor for that chapter — may be the “wrong” pane. B11 fixed *cross-chapter* wipe; **same-chapter dual-open** remains. |
| **Recommendation** | Policy: refuse dual-open of same chapter, **or** single writer lock per chapterId, **or** content generation token / etag CAS on PUT. Fix store to key by paneId+chapterId if dual-open stays. |
| **Effort** | M |

#### C4 — Chat messages: lost-update race (append vs full-array replace)

| | |
|---|---|
| **Where** | Server `appendMessage` RMW (`chatService.ts`); client edit/delete/regenerate `PATCH { messages }` full replace (`ChatInterface.persistMessages`); no revision/CAS; edit/delete not gated on `isGenerating` |
| **Risk** | Concurrent stream-append + edit/truncate can drop a just-appended turn or resurrect a deleted tail. Two tabs on same chat amplify. |
| **Recommendation** | Per-chat mutation serial lock; message-array version / CAS on replace; block edit/delete/regenerate while generating. |
| **Effort** | M |

#### H1 — Mass assignment on generic CRUD (and several custom PUTs)

| | |
|---|---|
| **Where** | `server/lib/crud.ts` POST/PUT; e.g. chapters, notes, outline, beats, folders, stories, prompts; lorebook custom PUT still `set(updates)` from full body |
| **Risk** | Authenticated **editor** can send arbitrary column values the UI never exposes: spoof timestamps, flip flags, point FKs wrong, set `imageFilename`, overwrite large JSON blobs, etc. |
| **Evidence** | `createCrudRouter` comment: *“this route already trusts req.body (no schema validation on this generic path).”* Lorebook PUT: `const { id, createdAt, ...updates } = req.body` then `db.update(table).set(updates)`. |
| **Why it matters** | Role model is owner/editor/viewer, not single-user-only. Editor is a trusted collaborator in product terms, but the API does not enforce field allowlists — any XSS or stolen editor session becomes full DB-shaped write access to those tables. |
| **Recommendation** | Per-route Zod (or shared allowlist) for create/update; never pass raw body into `.set()`. Strip/forbid filesystem-path columns (`imageFilename`, thumbnail fields) on generic PUT. |
| **Effort** | L (many routes) — start with lorebook + chapters + notes |

#### H2 — Path traversal class bug in upload path helpers (latent → active if H1 / admin import)

| | |
|---|---|
| **Where** | `lorebookImageStorage.ts` / `storyMapThumbnailStorage.ts` path joins; `GET .../image` `sendFile`; **admin DB import** spreads lorebook rows including `imageFilename` with no validation (`admin.ts` importTable) |
| **Risk** | Saves force UUID names, but import (and H1 mass-assignment) can set `imageFilename` to `../../…`. Then read/delete leave the uploads jail. |
| **Recommendation** | Allowlist `^[0-9a-f-]{36}\.(jpg|png|webp|gif)$`; `basename` + resolve-under-root assert; null/strip image filenames on import unless file exists under uploads. |
| **Effort** | S |

#### H3 — SSRF via Research page fetch (+ EPUB remote images)

| | |
|---|---|
| **Where** | `webSearchService.fetchPage`; also `epubGenerator` / Lexical→EPUB HTML remote `img src` fetched by `epub-gen-memory` at export time |
| **Risk** | Authenticated editor can force server GET to internal/metadata URLs (Research context or plant chapter image then export EPUB). Response text (Research) or side-effect fetch (EPUB). |
| **Recommendation** | Shared SSRF-safe fetcher: DNS + deny private/link-local/metadata/CGNAT; re-check redirects; Research only. EPUB: allow `data:`/already-localized images only — block remote `src`. |
| **Effort** | M |

---

### Medium

#### M1 — No automated tests in the product package

| | |
|---|---|
| **Where** | `package.json` scripts: build/lint/format/db only — **no** `test` script; no first-party `*.test.ts` outside `node_modules` |
| **Risk** | Continuity-critical paths (CRUD, chat fence parse, job resume, sheet sync, export) regress silently. Past incidents (MultiView content wipe B11, story DELETE 500 B7, chat truncate during MB3 verify) are exactly the class unit/integration tests catch. |
| **Recommendation** | Minimal suite first: pure functions (`sortPins`, fence parsers, path jail, SSRF URL checks, password verify) + a few better-sqlite3 integration tests for jobs claim/resume and lorebook update allowlists. |
| **Effort** | M to start; ongoing |

#### M2 — Error messages leak internal details to clients

| | |
|---|---|
| **Where** | `server/index.ts` error middleware; `crud.ts` asyncHandler; many routes `details: error.message` |
| **Risk** | Stack/driver messages can expose paths, SQL fragments, or library internals to any authenticated client. |
| **Recommendation** | Log full error server-side; client gets stable codes + short message. Keep `details` for owner-only debug if needed. |
| **Effort** | M |

#### M3 — Large trusted body limits (DoS / memory)

| | |
|---|---|
| **Where** | `server/index.ts` `express.json({ limit: "50mb" })`; admin multer 100MB |
| **Risk** | Authenticated editor can force large heap allocations repeatedly. Fine on a desktop with one user; painful if LAN-exposed with multiple clients. |
| **Recommendation** | Tier limits: small JSON default; larger only on known chapter/import routes. |
| **Effort** | S |

#### M4 — LLM spend surfaces available to editors (by design — document & optional tighten)

| | |
|---|---|
| **Where** | `/api/humanizer`, `/api/auto-humanizer`, chats generation, grammar, TTS, image gen paths — editor-level after global auth; jobs/admin remain owner |
| **Risk** | A compromised editor session burns API quota / local GPU time. Jobs correctly owner-gated. |
| **Recommendation** | Product call: keep as-is for collab trust, or add per-feature owner-only / daily caps. At minimum document in DEPLOYMENT. |
| **Effort** | S (docs) / M (caps) |

#### M5 — Admin full DB export includes AI credentials

| | |
|---|---|
| **Where** | `server/routes/admin.ts` export selects `aiSettings` (keys live in schema) |
| **Risk** | Owner-only — correct gate — but export files are high-value secrets. Easy to mishandle backups. |
| **Recommendation** | Redact keys in export by default; optional `--include-secrets` or separate credentials export; warn in UI. |
| **Effort** | S |

#### M6 — `/_status/restart` does not restart

| | |
|---|---|
| **Where** | `server/index.ts` — both shutdown and restart call `shutdown()` only |
| **Risk** | Operational footgun: UI implies restart; process exits and stays down unless an outer supervisor (Docker restart policy, systemd) brings it back. |
| **Recommendation** | Rename to “Stop” or implement real spawn/exit-for-supervisor contract; document compose `restart:` policy. |
| **Effort** | S |

#### M7 — Stored HTML in Notes / scribbles (multi-user XSS surface)

| | |
|---|---|
| **Where** | `react-simple-wysiwyg` on notes, chapter scribble, lorebook scribble |
| **Risk** | HTML is stored and re-rendered in contentEditable. Sanitization depends on the editor library, not an explicit server-side HTML policy. Cross-user (editor→viewer) XSS is plausible if someone pastes crafted HTML. Chat markdown path is better (rehype-sanitize). |
| **Recommendation** | Sanitize on save (DOMPurify/sanitize-html allowlist) server-side; same on read if legacy dirty data exists. |
| **Effort** | M |

#### M8 — God-file concentration (correctness risk, not a CVE)

| | |
|---|---|
| **Where** | `src/features/chat/components/ChatInterface.tsx` (~2054 LOC); `server/services/chatContextService.ts` (~1390 LOC) |
| **Risk** | Fence parsing, auto-accept, shuttle, humanize, context toggles, and apply paths share one component/service — high coupling, hard review, easy regressions (Glass Orchard already found routing/streaming issues hereabouts). |
| **Recommendation** | Extract: fence handlers map, accept pipelines, context toggle panel, send pipeline. No behavior change. |
| **Effort** | L (incremental) |

#### M9 — Residual Feature Routing gap (chat send path)

| | |
|---|---|
| **Where** | Documented in backlog B13 fix notes / DECISIONS — model **id** override wired; **custom apiKey/apiUrl per-feature** still may not drive live chat send the way `buildClientForFeature` does for jobs |
| **Risk** | Confusing “works in jobs, wrong credentials in chat” when per-feature endpoints differ. |
| **Recommendation** | Unify chat send client construction on `buildClientForFeature(promptType)` end-to-end; add a regression test when tests exist. |
| **Effort** | M |

#### H4 — Story scan treats per-chapter failures as success

| | |
|---|---|
| **Where** | `server/services/jobs/ragScanJobs.ts` ~84–103 (same pattern in legacy `scanStory` IIFE) |
| **Risk** | Chapter errors are caught, logged, and **swallowed**; `processed` still advances; job/`ragScans` complete as full success with partial/empty issues. User sees “done” while continuity gaps were never scanned. |
| **Recommendation** | Track fail count; mark `failed` or `completed_with_errors`; surface failed chapter IDs in progress/result. Don’t report 100% processed when chapters error. |
| **Effort** | S–M |

#### H5 — No stuck-job heartbeat while process is alive

| | |
|---|---|
| **Where** | `jobRunner.ts` — recovery only via boot `recoverCrashedJobs` |
| **Risk** | Hung await (provider deadlock, never-resolving stream) leaves `status='running'` forever until process restart. Serial queue is blocked. |
| **Recommendation** | Lease/heartbeat: touch `lastAttemptAt` on interval; reaper requeues stale `running` jobs; optionally refuse shutdown while `currentJobId` set beyond soft wait. |
| **Effort** | M |

#### H6 — Chapter index-on-write is client-debounced only

| | |
|---|---|
| **Where** | Chapter content `PUT` does not index; editor debounces `ragApi.indexChapter` (~8s). Compile/restore paths do call `indexChapter` server-side. |
| **Risk** | Closed tab before debounce, non-editor writers, or failed client reindex → stale chapter RAG until ~15m `reconcile_index`. |
| **Recommendation** | Server-side index after successful chapter content write (or short server debounce); keep client call as optional accelerator only. |
| **Effort** | S–M |

#### H7 — Graceful stop can abandon in-flight jobs

| | |
|---|---|
| **Where** | `jobRunner.stop()` waits ≤10s then returns; `index.ts` shutdown exits after |
| **Risk** | Long scan/review mid-flight becomes `running` orphan until next boot recovery (which may requeue or fail depending on attempts). |
| **Recommendation** | Longer wait for known long job types, or block exit while `currentJobId` set; document supervisor behavior. |
| **Effort** | S |

#### M10 — Dual-write `ragScans` ↔ `agentJobs` is best-effort

| | |
|---|---|
| **Where** | `ragScanJobs.ts` progress dual-write; design calls this short-term migration path |
| **Risk** | Mid-crash divergence; resume heuristics mitigate but orphan/stale rows possible. Already tracked as P1.1 dual-write retirement. |
| **Recommendation** | Keep until UI fully off `ragScans`; then single SoT. |
| **Effort** | L (when ready) |

#### M11 — Other approve paths check-then-act

| | |
|---|---|
| **Where** | Graph edge approve/reject; timeline pin approve — same TOCTOU class as C1, lower click frequency |
| **Recommendation** | Same conditional-update pattern when touching C1. |
| **Effort** | S (with C1) |

#### M12 — AI fence trust boundary is client-parse → API body

| | |
|---|---|
| **Where** | Fence strings only instructed in `chatContextService.ts`; accept routes trust client-built proposal payloads (`routes/chats.ts` codex-proposals, sheet accept via lorebook PUT, etc.) |
| **Risk** | Malicious/compromised client can POST arbitrary “proposed” fields without the model ever emitting a fence. Partially mitigated by human Approve UX + secrets strip on Codex. Combines with H1 mass-assignment. |
| **Recommendation** | Server-side Zod on proposal create/accept; optional re-parse of last assistant message for high-trust writes; never allow secrets keys in proposal payloads (already stripped on apply — also reject on create). |
| **Effort** | M |

#### M13 — `ragChunks` timestamp unit inconsistency

| | |
|---|---|
| **Where** | `ragRepository.ts` writes `Date.now()` (ms) via raw SQL; agentJobs/memories carefully use epoch **seconds** |
| **Risk** | Any Drizzle/`mode: timestamp` read of those columns is wrong; future code that compares units will mis-order staleness. |
| **Recommendation** | Standardize on one unit (prefer seconds to match the rest of the app) + one-shot fixup if needed. |
| **Effort** | S |

#### H8 — Chat switch does not remount / reset local chat UI state

| | |
|---|---|
| **Where** | Hosts keep one `ChatInterface` without `key={selectedChat.id}`; `useChatContextToggles` seeds once from first chat and **never resyncs**; composer draft init once; ephemeral proposal maps in component state |
| **Risk** | Auto-insert / auto-accept / context toggles from chat A apply to chat B; wrong draft; stale Accept cards after switch. |
| **Recommendation** | `key={selectedChat.id}` on `ChatInterface` (simplest) or explicit full reset effects on id change. |
| **Effort** | S |

#### H9 — Chapter scribble autosave cancels pending work on unmount

| | |
|---|---|
| **Where** | `ChapterNotesEditor.tsx` cleanup: `debouncedSave.cancel()` — not `flush()`. Contrast prose `SaveChapterContentPlugin` which **flushes** after a real loss bug. |
| **Risk** | Type scribble → leave tab/tool within ~1s → latest HTML never saved. |
| **Recommendation** | `flush()` on unmount (same pattern as chapter content). |
| **Effort** | S |

#### H10 — Unsequenced chapter content saves (reorder / late response)

| | |
|---|---|
| **Where** | Debounced `updateChapterMutation` with no in-flight queue or content revision; mutation `setQueryData` applies whatever response arrives last |
| **Risk** | Slow older PUT can overwrite a newer one in DB; cache can flash stale (editor often protected by `hasSeenLoad`, DB is not). |
| **Recommendation** | Client per-chapter save queue, or server content revision / CAS. |
| **Effort** | M |

#### H11 — Auto-accept safety depends on correct per-chat toggle state

| | |
|---|---|
| **Where** | Defaults OFF — good; auto-insert falls back to card if no editor — good; codex auto-accept fires on create; combined with **H8**, wrong-chat toggles can silently apply |
| **Risk** | User believes toggles off for this chat; state leaked from previous chat mutates codex/outline. |
| **Recommendation** | Fix H8 first; optionally re-read toggles from server chat row immediately before auto-accept. |
| **Effort** | S (after H8) |

#### H12 — TTS API keys exposed to editors (AI keys correctly owner-only)

| | |
|---|---|
| **Where** | `/api/ai` is `requireOwner`; `/api/tts` is editor-level; `GET /api/tts/settings` returns full provider API keys |
| **Risk** | Any editor can read/overwrite Speechify (etc.) secrets — inconsistent with “API keys owner-only” posture. |
| **Recommendation** | Owner-gate settings routes; redact keys for non-owners; keep generate usable without returning secrets. |
| **Effort** | S |

#### H13 — Full AI secrets returned to owner browser / export

| | |
|---|---|
| **Where** | `GET /api/ai/settings` returns raw openai/openrouter/grok keys, grok session cookie, OAuth tokens; admin export dumps `aiSettings` |
| **Risk** | XSS, malicious extension, or shared browser profile steals provider credentials. Export files are high-value. |
| **Recommendation** | Write-only secret fields + `hasXKey` booleans; never echo raw secrets; redact export (or passphrase-encrypt). |
| **Effort** | M |

#### H14 — Default Docker publish binds all interfaces without TLS

| | |
|---|---|
| **Where** | `docker-compose.yml` / prod compose `ports: "3000:3000"`; cookies `secure: false` by default |
| **Risk** | Accidental internet exposure → cleartext session theft + workspace access (login lockout is in-memory only). |
| **Recommendation** | Default bind `127.0.0.1:3000`; prefer tailscale compose; document TLS + `COOKIE_SECURE=true` for any public edge. |
| **Effort** | S |

#### H15 — No last-owner / self-lockout protection

| | |
|---|---|
| **Where** | `routes/users.ts` / `authService` user update |
| **Risk** | Demote/deactivate last owner (including self) → permanent admin lockout until DB surgery. |
| **Recommendation** | Refuse demoting/deactivating the last active owner. |
| **Effort** | S |

#### M14 — `ChatInterface` god component (~2054 lines)

Already noted as M8; client review confirms same file owns generation, all proposal types, MB ops, multi-accept paths. Keep M8 as canonical id.

#### M15 — localStorage key hygiene after SL rename

| | |
|---|---|
| **Where** | Mix of `storyLabyrinth.*`, residual `sn-*`, unprefixed workspace/editor keys |
| **Risk** | No content loss; one-time UI reset for users with old keys; drafts key lacks story/user isolation on shared browser profiles. |
| **Recommendation** | Optional one-shot migrate/read-fallback; namespace drafts per storyId. |
| **Effort** | S |

#### M16 — Lorebook form dirty guard is sheetBody-centric

| | |
|---|---|
| **Where** | Chat-driven sheet accept respects `dirtyFields.sheetBody`; psych/sexuality/place metadata accepts update server/`liveEntry` without the same full-form dirty model |
| **Risk** | Parallel panel edits can desync form vs server for non-sheet fields. |
| **Recommendation** | Broaden dirty guards or always rehydrate form from server after any accept. |
| **Effort** | M |

#### M17 — Global roles only — no per-story ACL

| | |
|---|---|
| **Where** | `stories` schema has no ownerId; all authenticated editors see all stories |
| **Risk** | Fine for single-tenant household; unsafe if untrusted multi-user on one instance. |
| **Recommendation** | Document hard; if multi-tenant ever needed, ACL middleware on every story-scoped + id-addressed route. |
| **Effort** | L (only if product needs it) |

#### M18 — CSRF residual on cookie auth

| | |
|---|---|
| **Where** | No CSRF token/Origin check; `SameSite=Lax` mitigates most browser cross-site POST |
| **Risk** | Low for pure same-origin SPA; owner `/_status/shutdown` is cookie-only state change. |
| **Recommendation** | Origin allowlist on mutating routes if ever multi-origin; keep Lax/Strict. |
| **Effort** | S |

#### M19 — Manual image upload trusts client MIME

| | |
|---|---|
| **Where** | Lorebook upload uses `file.mimetype`; magic-byte sniff only on AI image path |
| **Risk** | Polyglot/wrong-type stored; served under auth (limits blast radius). |
| **Recommendation** | Always sniff buffer; `X-Content-Type-Options: nosniff` on serve. |
| **Effort** | S |

#### M20 — Owner-configured `apiUrl` is second-order SSRF

| | |
|---|---|
| **Where** | `aiClientFactory` / feature endpoints local baseURL |
| **Risk** | Compromised owner points baseURL at internal services; normal AI use triggers server requests. Intentional for local LLMs. |
| **Recommendation** | Optional allowlist; block private ranges except explicit localhost opt-in. |
| **Effort** | M |

---

### Low / Informational

| ID | Finding | Notes |
|----|---------|--------|
| L1 | Dev `cors()` wide open | `NODE_ENV === "development"` only — OK; ensure production never sets that by mistake |
| L2 | Cookie `secure` default false | Documented for HTTP LAN/Tailscale; set `COOKIE_SECURE=true` behind TLS |
| L3 | 30-day sessions | Intentional personal-tool choice; fine on private net |
| L4 | In-memory login lockout resets on restart | Defense-in-depth only; acceptable; no IP throttle |
| L5 | No CSRF token | See M18 — Lax mitigates most browser cases |
| L6 | Health `/api/health` unauthenticated | Correct for Docker; no secrets |
| L7 | Dual map systems on disk | L3 `storyMap*` graph code may still exist while Maps v2 owns UI — dead weight, not security |
| L8 | `ragScans` dual-write still present | Known P1.1 leftover; migrate when consumers ready (see M10) |
| L9 | Talk list / skill lag vs backlog | Process risk: agents re-offer shipped work — hygiene, not runtime |
| L10 | Dep pack 3 ROI-frozen | Good restraint; stay frozen unless CVE |
| L11 | Schedule tick loads all stories every 60s | Fine at personal scale; no pagination |
| L12 | Manual job enqueue allows loose payload | Owner-only route; still little schema validation |
| L13 | 70+ migrations / many single-column alters | Operational noise, not broken |
| L14 | `prune_history` skips `ragScans`/`ragScanIssues` | Intentional; tables can grow |
| L15 | No Helmet/CSP/HSTS | Add for any non-LAN deploy |
| L16 | First-register race | Concurrent first users may both pass setup check — unique+tx “count==0” |
| L17 | `sanitizeUrl` fails open on parse error | Prefer `about:blank` fail-closed |
| L18 | Role change does not rotate sessions | Deactivate does; role edit should invalidate too |
| L19 | Editor layout save cancels on unmount | UI-only chrome loss, not story content |
| L20 | Corrupt chapter JSON → empty doc unlocks save | Can blank a chapter if user keeps typing; toast would help |
| I1 | Password min length 8 | OK for private tool; consider 12+ if ever internet-facing |
| I2 | SQLite single-writer | Serial jobs match engine; soft concurrency still optional |
| I3 | Glass Orchard B17 MultiView split | Not cleanly reproduced; keep an eye out with real screenshots if users report |
| I4 | Markdown XSS baseline good | No `dangerouslySetInnerHTML` in `src/`; rehype-sanitize on chat MD |
| I5 | SQL injection baseline good | Drizzle + bound params; FTS quoting; no classic string SQLi found |

---

## Architecture notes (non-blocking)

### What works well
- **Feature modules** under `src/features/*` mirror server services/routes reasonably.
- **Jobs as the LLM-spend control plane** for scans/reviews/graph suggest is the right seam (owner + queue).
- **Crash recovery + progress.scanId resume** (B4) is thoughtful for long story scans.
- **Secrets in Codex** with index-time omission + never-from-proposal apply is a strong privacy pattern for fiction tooling.
- **Memory approve transaction** is the pattern every other approve path should copy.

### Smells to budget for (not “fix now”)
1. **createCrudRouter as default** — velocity win, validation loss. New tables should opt into Zod-first routes.
2. **Chat message array as JSON blob** — edit/truncate/regenerate are client-orchestrated full-array patches; fine at personal scale, awkward for audit/branching later.
3. **Prompt/fence surface area** — ~15 fence types; “model forgot fence / wrong id” ops load; parsers must stay pure and unit-tested (today: mostly untested).
4. **Schema gravity** — 76 migrations / large schema is healthy history; keep generating via drizzle-kit, avoid hand-edit drift.
5. **Dead or deprecated Story Map graph** — remove or quarantine when T8/cleanup energy exists to reduce cognitive load.
6. **Dual scan pipelines** (legacy IIFE + agent job) — dual maintenance until C2 deletes one.
7. **Hybrid Drizzle + raw better-sqlite3** — correct for atomicity; epoch unit drift already present (M13).
8. **Inconsistent index-on-write policy** — lorebook/notes/outline server F&F; chapters client-debounced; graphs reindex endpoints; all papered by `reconcile_index`.
9. **In-process serial queue** is right for single-container SQLite; redesign only if multi-instance ever appears.

---

## Test & ops gap checklist

| Gap | Status |
|-----|--------|
| Unit tests | Missing |
| API integration tests | Missing |
| E2E (Playwright/Cypress) | Missing (manual Browser pane + Glass Orchard) |
| Lint CI | oxlint local; confirm GH Actions coverage |
| Typecheck CI | Via `npm run build` |
| Dependency audit automation | Not reviewed in depth this pass |
| Backup story | Manual `cp` of SQLite — called out in past DECISIONS; still true |
| Secrets in backups | Export includes keys (M5) |

---

## Suggested priority order (if you later act)

Do **not** treat this as a build ticket list unless you promote items.

| Priority | Item | Why |
|----------|------|-----|
| 1 | **H2** filename jail (+ import strip) | Tiny fix, closes traversal class |
| 2 | **H3** SSRF denylist + block EPUB remote imgs | Research + export fetch |
| 3 | **C3** same-chapter MultiView write policy | Real prose data-loss class |
| 4 | **C1** atomic Codex approve (+ M11 peers) | Double-apply race; copy memory pattern |
| 5 | **H8** `key={selectedChat.id}` / reset toggles | Stops wrong-chat auto-accept (H11) |
| 6 | **C4** chat message CAS / block mutate-while-generating | Lost-update on stream+edit |
| 7 | **H9** scribble `flush()` on unmount | One-liner class fix |
| 8 | **C2** kill legacy `scanStory` IIFE | One scan pipeline |
| 9 | **H4** fail-loud chapter scan accounting | Stops lying “success” on partial scans |
| 10 | **H12** owner-gate TTS secrets | Editor shouldn’t see API keys |
| 11 | **H13** redact AI secrets in GET/export | XSS/extension theft |
| 12 | **H1** allowlists on lorebook + chapters + notes | Mass assignment |
| 13 | **H14** Docker bind localhost by default | Accidental public exposure |
| 14 | **H15** last-owner protection | Avoid self-lockout |
| 15 | **H6** server-side chapter index on PUT | RAG freshness |
| 16 | **H5** job lease/heartbeat | Hung serial queue |
| 17 | **H10** sequence chapter content saves | LWW late PUT |
| 18 | **M1** seed unit tests | Future-proofs above |
| 19 | **M2** sanitize 500 responses | Cheap hygiene |
| 20 | **M12** Zod on proposal create/accept | Client-forged fences |
| 21 | **M7** HTML sanitize notes/scribbles | Multi-user XSS |
| 22 | Rest of M/L as energy allows | — |

---

## Out of scope this review

- Line-by-line audit of every job handler and every fence parser
- Dependency CVE database scan (`npm audit` not run as gate here)
- Runtime load/perf profiling
- Docker image contents / supply chain beyond Dockerfile presence
- Upstream JonSilver parity diff
- Product backlog prioritization (T8, etc.)

---

## Sign-off

| | |
|---|---|
| **Verdict** | **Ship-quality for trusted single-operator / household private use.** Not hardened for hostile multi-user or public internet without **H2/H3, C3/C4, C1, H8–H15** (and ideally the M-tier allowlists/tests). |
| **Code changed** | **None** (findings document only). |
| **Follow-ups** | **Promoted 2026-08-18** → `docs/CURRENT_BACKLOG.md` **P2 B22–B44** (+ talk-list pointer). This file remains the narrative SoT for evidence/severity; backlog wins on “what’s left to build.” |
| **Sources** | Primary static review 2026-08-17; server architecture + client/UI + security deep-dives merged 2026-08-18 (all three subagent batches complete). |

### Backlog ID map (review → B-row)

| Review | Backlog |
|--------|---------|
| H2 path jail | **B22** |
| H3 SSRF (+ EPUB) | **B23** |
| C3 MultiView same-chapter LWW | **B24** |
| C1 Codex approve TOCTOU (+ M11 peers) | **B25** |
| H8/H11 chat switch / auto-accept state | **B26** ✅ (2026-08-18 Lean A) |
| C4 chat message lost-update | **B27** |
| H9 scribble flush | **B28** |
| C2 legacy story scan | **B29** |
| H4 scan fail accounting | **B30** |
| H12 TTS keys | **B31** |
| H13 AI secrets GET/export | **B32** |
| H1 mass-assignment | **B33** |
| H14 Docker bind / cookie secure | **B34** |
| H15 last-owner | **B35** |
| H6 chapter index-on-write | **B36** |
| H5/H7 job heartbeat / stop | **B37** |
| H10 unsequenced chapter saves | **B38** |
| M12 fence client trust | **B39** |
| M1 no tests | **B40** |
| M2 error leakage | **B41** |
| M7 HTML sanitize notes | **B42** |
| M13 ragChunks timestamp units | **B43** |
| M6 status restart | **B44** |

*Reviewer: Hermes (Lizzy) · 2026-08-17 · final merge 2026-08-18 · backlog promote 2026-08-18*
