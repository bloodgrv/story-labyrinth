# Story Labyrinth — Whole-App Health Review (2026-09-06)

**Status:** Findings. **Wave 0 (H2 + H3 Tiers 1–2) and the first slice of Wave 1 (H4) shipped the same day** — see B46/B47/B49 in `docs/CURRENT_BACKLOG.md` and the "Wave 0 — Canvas Removal + Dependency Wave" and "Wave 1 — Invariant Test Harness" entries in `DECISIONS.md`. H4 is only **partially** closed — 3 invariant groups are covered; the job-runner, restore-path, auth-gating and append-retry groups are not. Everything else here is still open. The findings below are preserved as written on the day of the sweep; they are *not* rewritten as work lands, so read them as a snapshot and trust the backlog for current state.
**Scope:** Whole fork, at `main` / v0.8.20 (commit `aebfebd`).
**Method:** Automated sweep (typecheck, lint, tests, dependency audit, dead-code scan) plus targeted code reading of the areas the prior QA/code-review passes left open or parked.
**Relationship to other docs:** This is a *point-in-time* review, the peer of `docs/CODE_REVIEW_2026-08-17.md` and `docs/BUGS_2026-08-19.md`. Open items from it are tracked as **P2 B45–B53** in `docs/CURRENT_BACKLOG.md`, which stays the source of truth for priority.

---

## 1. Baseline — the codebase itself is healthy

Every check below was run fresh on 2026-09-06 against a clean tree.

| Check | Command | Result |
|---|---|---|
| Client typecheck | `tsc --noEmit -p tsconfig.json` | **clean**, 0 errors |
| Server typecheck | `tsc --noEmit -p server/tsconfig.json` | **clean**, 0 errors |
| Lint | `oxlint` (888 files) | **0 errors**, 204 warnings |
| Tests | `vitest run` | **92/92 pass**, 21 files, 1.35s |
| Dead code | `knip` | 17 unused files, 2 unused deps, 79 unused exports, 165 unused types |
| Prod dependency audit | `npm audit --omit=dev` | 34 advisories (1 critical, 19 high, 12 moderate, 2 low) |
| Outdated | `npm outdated` | 17 majors behind, 54 minor/patch behind |
| `TODO`/`FIXME`/`HACK` | grep, `src` + `server` | **2**, both inherited upstream Lexical comments |
| Empty `catch` blocks | grep | **0** |
| `as any` / `@ts-ignore` | grep | 5 / 3 |
| Repo hygiene | `git ls-files` | clean — no DBs, zips, `dist/`, or `portable-build/` tracked |

**The 204 lint warnings were individually reviewed and none is a latent bug:** 123 `curly` (style), 41 `max-lines` (see H5), 14 `no-non-null-assertion` (all guarded by a preceding `.has()`/null check), 6 `exhaustive-deps` (all deliberate — several carry their own `eslint-disable` rationale comments; the rest depend on setState identities React guarantees stable, or key intentionally on `note.id`/`chatId` identity), 1 `arrow-body-style`.

**Conclusion:** this is not a decaying codebase. The real debt is architectural and supply-chain, described below.

---

## 2. Findings

### H1 — Live chat bypasses the server entirely (one root cause behind three parked issues)

**Evidence.** `src/services/ai/AIService.ts` fetches `GET /api/ai/settings` and instantiates providers **in the browser**, calling OpenAI / OpenRouter / Gemini / Grok directly with the raw keys. Meanwhile `server/services/aiClientFactory.ts`'s `buildClientForFeature` — full per-feature endpoint routing, including custom `apiUrl`/`apiKey` — is already used by ~20 server services (RAG scanner, every `agentJobs` job, AI Review, humanizer, beat detector, embeddings, document import, name generator).

**Why it matters — this single split is the root cause of three separately-logged items:**

1. **B32's "architecturally unfixable" secret exposure.** AI provider keys are handed to every editor-level browser session because the browser is the thing that needs them. That was correctly diagnosed on 2026-08-18 and correctly parked *given the current architecture*. It is fixable by changing the architecture.
2. **B13's parked residual.** Verified in code on 2026-09-06: `resolveChatDefaultModel.ts` now honours `featureOverrideModelId` via `useChatSystemPrompt.ts`'s `CHAT_FEATURE_KEYS` (worldbuilding / editor / outline / research and the rest), so the original bug is genuinely fixed. But **only the model id crosses over.** A per-feature custom `apiUrl`/`apiKey` is honoured solely by server-side calls. CLAUDE.md's headline claim — *"Per-feature endpoint selection required (writing model and scanner model can run on different machines)"* — therefore holds for jobs and the scanner but **not for the chat surface the user actually writes in**.
3. **Remote access.** Post RF0–RF5 (`docs/Remote_Access_Funnel_Design.md`), a work PC reaches the app over Tailscale/Funnel — but the *browser on that machine* is what must reach the model host, not the server. A home 3090 that is reachable from the server is not automatically reachable from the remote browser. Funnel exposure also widens the blast radius of point (1) above.

**Recommendation.** Add a server-side streaming chat proxy (`POST /api/ai/chat/stream`, SSE) that resolves its client through the existing `buildClientForFeature`, and point `AIService` at it instead of at provider SDKs. Keys stop leaving the server, per-feature endpoints start applying to chat, and remote browsers work through the server. This reuses machinery that already exists and is exercised by 20 callers — the risk lives in the streaming/abort path, not in the routing.

**Effort:** Medium-large (1–2 focused sessions). **Prerequisite:** H4's test net, ideally.

---

### H2 — The `canvas` native dependency is dead weight, and CLAUDE.md is wrong about it

**Evidence.**
- Nothing in `src/`, `server/`, or `scripts/` imports `canvas` — verified by grep for `from "canvas"`, `require("canvas")`, and `createCanvas`. `knip` independently flags it as an unused dependency.
- `pdf-parse@2.4.5`'s own `dependencies` are `{"@napi-rs/canvas": "0.1.80", "pdfjs-dist": "5.4.296"}`. Its `getImage()` — the one thing `documentImportService.ts` calls — is backed by **`@napi-rs/canvas`**, which ships prebuilt binaries and needs no system libraries.
- `canvas` is nonetheless installed (`node_modules/canvas`, `canvas-win32-x64-msvc`) and the `Dockerfile` installs `libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev` in **both** the build and runtime stages for it (lines 15 and 52).

**Why it matters.** `canvas` is the only compile-from-source native dependency in the tree — the exact risk class CLAUDE.md says this project avoids. It slows Docker builds, bloats both image stages, and is a standing fresh-install failure mode. The `DECISIONS.md` "Document Import" entry and CLAUDE.md's Technology Stack section both describe it as load-bearing ("the one deliberate exception… added 2026-07-17 by explicit user decision"). That was true of the `pdf-parse` of the day; it is not true of the installed version.

**Recommendation.** Remove `canvas` from `package.json`; drop the five `-dev` library installs from both Dockerfile stages (keep `libgomp1` — that one is real, for `onnxruntime-node`); verify PDF import image extraction still works end-to-end; correct CLAUDE.md and add a `DECISIONS.md` note explaining *why* the earlier decision no longer applies, so it isn't re-added.

**Effort:** Small (an hour, plus a Docker build to verify).

---

### H3 — Dependencies: 17 majors behind, 45 advisories, most of which don't matter

The advisory count is misleading for a single-operator LAN/Tailscale app — a great many are dev-toolchain DoS/ReDoS findings that require a hostile input source this deployment doesn't have. What follows separates signal from noise rather than chasing the number to zero.

**Tier 1 — do now, non-breaking (`npm audit fix`):** `drizzle-orm` 0.45.1→0.45.2 (SQL injection via improperly escaped identifiers — worth taking on principle even though this codebase's raw-SQL sites are internal), `multer`, `nanoid`, `lodash`, `postcss`, `react-router` within 7.x, plus `ws` / `undici` / `brace-expansion` / `qs` / `path-to-regexp` transitives.

**Tier 2 — contained, do next:** `jspdf` 3→4. Three **critical** advisories (path traversal, PDF/JS injection). Blast radius is the PDF export path only, which is easy to verify by exporting one manuscript.

**Tier 3 — low-risk majors, batch them:** `concurrently` 10, `knip` 6, `@types/node` 26, `@types/better-sqlite3` 9, `gpt-tokenizer` 4, `@sindresorhus/is` 8. Add `better-sqlite3` 12→13 with care: trivial code-wise, but it must be re-verified against the portable build **and** Docker (native rebuild + `sqlite-vec` loading).

**Tier 4 — one per session, verify by hand:** `openai` 7, `@google/genai` 2, `lucide-react` 1 (icon renames), `vite` 8 + `@vitejs/plugin-react` 6 (dev/build only), `react-resizable-panels` 2→4 — **this one touches Editor MultiView, the feature with the worst bug history in this project (B11, B17, B24)**; and Lexical `0.48`→`0.50`, which is only a minor bump but lands on the single highest-risk surface in the app and deserves a solo pass with real manual editing.

**Tier 5 — defer, each is its own project:** `tailwindcss` 4 (CSS engine rewrite against a heavily customised multi-theme token system), `typescript` 7 (new Go-based compiler; wait for the ecosystem), `react-router` 8.

**Also flagged by `knip` and safe to drop:** `vaul` plus its only consumer `src/components/ui/drawer.tsx` (unused).

---

### H4 — Automated coverage does not reach any of the app's load-bearing invariants

**Evidence.** 21 test files, 92 tests. Eighteen are AI-fence parsers (`parseCodexProposals`, `parseHandoffPackets`, …), one is `sortPins`, three are server storage/SSRF helpers. All pure functions, no database, no HTTP. That was B40's deliberate, correctly-scoped choice on 2026-08-18.

**What has no coverage at all**, despite being the machinery the product's promises rest on:

- **Propose→approve doctrine.** "All Codex modifications require explicit user approval" and "no silent canon unless an explicit toggle is ON" are enforced by service code with zero tests. A regression here is silent by definition.
- **Optimistic concurrency.** `chapters.contentVersion` (B24) and `aiChats.messagesVersion` (B27) — the defences against the prose-loss bug class — have no test proving a stale write is rejected or that the append-retry converges.
- **Approve TOCTOU claims** (B25, and its mirrors for graph edges and timeline pins): the `WHERE status = 'pending'` atomic-claim pattern is invisible to any current test.
- **Job runner** (`jobRunner.ts`): serial execution, the 15-minute timeout un-wedge (B37), story-scan resume-after-crash (B4).
- **Migration runner.** Has caused two separate real incidents (the migration-timestamp bug and the epoch-seconds landmine) and there are 93 migrations. `server/scripts/verify-migrations.mjs` exists but isn't part of `npm test`.
- **Restore paths.** Codex snapshot restore (QA-B2 shipped two independent root-cause fixes here) and chapter history restore.

> **ID collision warning.** `docs/BUGS_2026-08-19.md` runs its **own** `B1–B21` series that collides with `docs/CURRENT_BACKLOG.md`'s. Throughout this document, a bare `B##` means the **backlog's** id; a `QA-B##` means the **2026-08-19 QA doc's** id. They are different bugs at the same numbers (e.g. backlog B2 is a beat-mark DB row leak; QA-B2 is Codex History restore).

**Recommendation.** A server integration harness — a temp SQLite file plus the real Express app — and 8–12 tests that each assert one invariant. Not a coverage-percentage project; a "the things that must never silently break" project. Fold `verify-migrations.mjs` into `npm test` while there.

**Effort:** 1–2 sessions. **Highest-leverage non-feature work in this review.**

---

### H5 — `ChatInterface.tsx` is 2,374 lines and is where bugs keep landing

41 files exceed the 250-line lint threshold; the outliers are `ChatInterface.tsx` (2,374), `server/db/schema.ts` (1,824 — fine, it's a schema), `chatContextService.ts` (1,549), `LorebookEntryEditor.tsx` (984).

`ChatInterface.tsx` is not merely long — it is empirically the highest-defect file in the project. QA-B15 (prose corruption), QA-B19 (stuck composer), QA-B21 (multi-click send), B26 (per-chat toggle leakage) all landed in or immediately around it, and the 2026-08-17 review flagged it as M8 ("god-file split — maintainability, not a bug ticket"). Every new fence type adds another branch to the same function.

**Recommendation.** One surgical extraction, not a rewrite: lift fence detection/handling into a registry (`fenceHandlers/` — one module per fence, a shared `{ match, parse, onAccept }` shape), which is the axis the file actually grows along. Leave composer/streaming/layout alone.

**Effort:** Medium, and genuinely optional — but it compounds, and every future fence makes it worse.

---

### H6 — Dead L3 Story Map surface: decide, don't drift

`knip` finds nine unreferenced frontend files — `src/features/story-map/*` (canvas, node, edge label, search box, side panel, edit dialog, hook, layout) plus `src/components/workspace/tools/StoryMapTool.tsx` — superseded by Maps v2. This is **deliberate**: `StoryMapTool.tsx`'s own header comment says it was "left on disk deliberately, not deleted." Meanwhile the server half is still fully mounted: `server/routes/storyMap.ts`, `storyMapService.ts`, and the `storyMapEdges`/`storyMapLayout` tables, with `server/index.ts` noting the L3 graph is "deprecated in the UI only."

**Recommendation.** Make it an explicit decision rather than an indefinite park: either (a) delete the frontend module and keep the routes/tables read-only for data preservation, or (b) retire the whole surface with a migration. Either is fine; drifting is what costs — every future dependency upgrade and refactor pays a tax on nine files nobody renders.

---

### H7 — QA-B12 will not be found by hunting; make it self-reporting

QA-B12 ("two recurring unisolated 500s") survived three investigation passes and remains open. A fourth hunt is unlikely to differ.

**Recommendation.** Invert it: add a request-id plus error ring buffer on the server (last N failed requests with route, status, message, stack, timestamp) surfaced under Settings → Logs next to Transfers and Recent Jobs. The next occurrence then self-identifies instead of costing another pass. This also partially addresses B41's parked error-visibility tension without reopening the "do 500s leak `error.message`" debate — the buffer is owner-only.

---

### H8 — Backlog B3 remains a real functional gap, not just debt

"Global/series lorebook not in RAG" is filed as by-design-for-now. With series-level worldbuilding in active use, it means global entries are invisible to the scanner, chat grounding, and every RAG-fed context path — a silent, plausible-looking absence rather than an error. Worth re-scoping deliberately rather than leaving as a permanent caveat.

---

### H9 — Documentation drift found during this pass

| Doc | Claim | Reality |
|---|---|---|
| `CLAUDE.md` (Technology Stack) | `canvas` is used by PDF image extraction, "the one deliberate exception" to native-binding avoidance | Unused; `pdf-parse` uses `@napi-rs/canvas`. See **H2**. |
| `CLAUDE.md` (RAG Systems) | "Per-feature endpoint selection required (writing model and scanner model can run on different machines)" | True for server/job calls; **not** for live chat, which only inherits the model id. See **H1**. |
| `docs/CURRENT_BACKLOG.md` | "Last updated: 2026-08-23" | Rows dated 2026-08-24/25 (RF1–RF5) landed after it. |
| Session memory | "Chat model routing bug — confirmed unfixed" | Fixed by backlog B13 on 2026-08-15; re-verified in code 2026-09-06. **Corrected in memory during this pass.** |

---

## 3. Proposed sequencing

### Wave 0 — quick wins (~half a day)
Remove `canvas` plus the five Dockerfile `-dev` libs (**H2**); remove `vaul` plus `drawer.tsx`; Tier 1 dependency wave (**H3**); `jspdf` 3→4; fix the four doc drifts in **H9**. Verified by a Docker build plus a portable smoke test and one PDF export.

### Wave 1 — safety net (1–2 sessions)
The server integration harness and its 8–12 invariant tests (**H4**). Deliberately before Wave 2, so the architectural change lands against a net.

### Wave 2 — server-side AI proxy for chat (1–2 sessions)
**H1.** Closes B32's and B13's residuals and makes remote writing work through the server.

### Wave 3 — dependency majors (one per session)
**H3** Tiers 3 and 4, riskiest last; Lexical and `react-resizable-panels` each get their own pass with manual verification.

### Wave 4 — maintainability
`ChatInterface` fence-handler extraction (**H5**); the Story Map retirement decision (**H6**); B12 observability (**H7**); B3 re-scope (**H8**).

---

## 4. Explicitly *not* flagged (so this isn't re-litigated)

- **The 204 lint warnings.** Reviewed individually; all style or deliberate. Don't spend a pass on `curly`.
- **The raw advisory count.** 45/34 is not a meaningful number for this threat model (trusted single operator, LAN/Tailscale, per `docs/CODE_REVIEW_2026-08-17.md`'s own stated model). The tiers above are the actionable subset; the rest is dev-toolchain ReDoS noise.
- **`knip`'s 79 unused exports / 165 unused types.** Overwhelmingly query-key constants and prop types following a consistent per-feature convention. Removing them would fight the codebase's own pattern for no benefit. The `story-map` block (**H6**) is the one real cluster.
- **Code splitting.** Route-level `React.lazy` is already in place (11 sites, including the heavy Maps canvas). Bundle size wasn't measured this pass — measure before assuming it's a problem.

---

## 5. Cross-references

| Doc | Relationship |
|---|---|
| `docs/CURRENT_BACKLOG.md` | Open items from here live as **P2 B45–B53**; that file wins on priority |
| `docs/CODE_REVIEW_2026-08-17.md` | Prior audit (B22–B44); H1 unparks its B32, H4 extends its B40 |
| `docs/BUGS_2026-08-19.md` | Prior QA pass (its own B1–B21 series — see the ID collision warning in H4); H7 addresses its still-open QA-B12 |
| `DECISIONS.md` | Where the *why* of any fix from this review must be recorded |
| `docs/Remote_Access_Funnel_Design.md` | RF0–RF5 context for H1's remote-access half |
