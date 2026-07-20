# Story Nexus Fork — Current Backlog

**Last updated:** 2026-07-20 (P0.4 B5 done: WB + Outline guided-start, Character psych module)  
**Purpose:** Single source of truth for **what’s left**, after implementation order got scrambled relative to the original Phase 0 list.  
**Canonical live status also mirrored in:** `CLAUDE.md` (architecture + high-level “done” notes) and `DECISIONS.md` (load-bearing how/why).  
**This file wins** when those conflict on *priority of remaining work*.

---

## How to use this

1. Pick the next **P0** item unless the user explicitly redirects.
2. Do not re-implement items in **Done**.
3. Phase C / G1.5 items are **à la carte** — not a mandatory package.
4. After finishing an item: move it to Done (or mark partial), note the date, and record load-bearing choices in `DECISIONS.md`.

---

## Done (do not re-plan as foundation)

| Area | Notes |
|------|--------|
| Fork + Docker + basic login | |
| Character Codex (concrete state only) + propose/approve | |
| Codex Project Saves layer (snapshot timeline + restore) | Lorebook entry History UI |
| Per-feature AI endpoints + Grok routing editor | |
| Vector RAG (sqlite-vec + FTS5 hybrid) + index-on-write | Lorebook create/update, chapter save, Codex approve reindex |
| RAG Scanner **backend** + job-wrapped scans | `ragScans` / `ragScanIssues`; dual-write via `agentJobs` |
| World-building / research / editor chats + entry/chapter anchors | |
| Editor MultiView (panes, tabs, float, persistence) | |
| Story outlining + character arcs + AI outline suggestions | |
| Concrete Beats (manual, AI suggest, auto-tag, guide) | |
| Deep Writing / Focus sessions | |
| Humanizer | |
| TTS (Speechify) | |
| Lorebook images (upload + AI generate) | |
| Multi-format lorebook document import | Fixed 2026-07-17: PDF page-break marker leak, description-stripping prompt, PDF + DOCX embedded-image extraction (largest image by area). Added native `canvas` dependency + Dockerfile system libs, per explicit user confirmation — see `DECISIONS.md` |
| Baseline novel export (md/html/text/epub/pdf paths) | |
| Visible model thinking tags (parse + ThinkingBlock) | **Partial product** — not full multi-agent reasoning UI |
| Agent Framework Phase A (jobs, runner, reconcile, prune, scan-as-job) | Settings `RecentJobsCard` |
| Agent Framework Phase B (project memory, pending approve, distill job) | Memory tool; distill manual enqueue only |
| Lorebook Relationship Graph Phase G1 | `storyGraphEdges` SoT, React Flow Relationships tool, ego + full view |
| Lorebook entry "Natural View" (prose character profile toggle) | `NaturalEntryView.tsx`; same form data as raw fields, tags hidden; Codex auto-compile (P0.3/C5) NOT included |
| Theme-tint fix: `MainContent.tsx` `toolTints` no longer breaks under custom (non-`.dark`) themes | Was causing a visible light "block" per tool pane on Midnight/Forest/Sand/Graphite |
| RAG Scanner frontend (P0.1) | Editor right-rail drawer (chapter-scoped) + "Scanner" sidebar tool (story-wide, scan history, status tabs), both triggering via `POST /api/agent/jobs` (owner-only). See `DECISIONS.md` "RAG Scanner Frontend (P0.1)" |
| Chapter alternate-version tabs (P0.2, redefined — see note below) | Flat, chat-branching-style draft tabs next to the main chapter (`ChapterVersionsPanel.tsx`), created via AI regenerate or manual duplicate, independently editable, one-way "Compile to Main" action, optional side-by-side compare toggle. See `DECISIONS.md` "Story-Layer Chapter Versioning (P0.2)" |
| Chapter content undo/restore (P0.2b) | Linear history for the main chapter's own content (`chapterSnapshots` table, mirrors Codex snapshot/restore) — throttled ~15min auto-checkpoints, manual named saves, restore via a new "History" editor drawer. Compile (P0.2) now takes a safety checkpoint first too. See `DECISIONS.md` "Chapter Content Undo/Restore (P0.2b)" |
| Notes/Outline ↔ Chat bridge, "Core Bridge" scope (P0.3 N0-N4, O1-O4) | Double-gate opt-in (`includeInAi` per note/outline item + `includeNotes`/`includeOutline` per chat) — schema, RAG `note`/`outline_item` entity types + reconcile_index, per-item toggle UI, story export/import round-trip, `chatContextService` non-canon packets surfaced in World-Building/Research/Editor(-excluded)/Brainstorm chats. N5/N6 (save-as-note, note-proposal) NOT included. See `DECISIONS.md` "Notes/Outline ↔ Chat Bridge (P0.3, Core Bridge scope)" |
| Project Memory chat toggle (P0.3 C1) | `aiChats.includeMemory` toggle + `resolveMemories` in `chatContextService.ts`, surfaced in the same chat UI as the Notes/Outline toggles. No per-item flag needed — every active memory is already index-eligible via Phase B's approve step. See `DECISIONS.md` "Project Memory Chat Toggle (C1)" |
| Editor Selection Rework + Codex Proposal Tray (P0.4 R0-R3) | "Rework in chat" replaces the floating toolbar's one-shot Expand/Rewrite/Shorten as the primary path — highlight → bound Editor chat with before/selection/after context → Accept replaces only that selection. Codex proposals for Editor(/Outline) chats moved to a tray under the chat list with Approve/Reject/Edit. Fixed two real pre-existing bugs found along the way (`activeChapterEditorStore` single-slot bug, chat-list cache invalidation). See `DECISIONS.md` "Editor Selection Rework + Codex Proposal Tray (P0.4 R0-R3)" |
| Lorebook Rework → WB, Dedicated Outline Chat, Outline Row Rework, WB Handoff (P0.4 R4/R5/R7/R8) | Description-field sub-span "Rework in chat" bound to the entry's WB chat (Accept = existing codex-proposal approve flow, no new apply path); WB Codex proposals unified onto the same tray Editor uses (Approve/Edit/Reject). Outline gets a real dedicated `chatType`/`promptType: "outline"` (R7's split, done here since R5 needed it) — own chat list/rail, always-on full outline tree + written-chapter-summaries context, new `outline-proposal`/`lore-suggestion` fences, retired bulk "Generate with AI" button (`outlineGenerator.ts` deleted). Outline rows get whole-field "Rework in chat" too; lore suggestions hand off to Lorebook via the same same-tab `StoryContext` pattern the Relationships graph's "Open entry" already used. Structured-Codex-field (wardrobe/wounds/items) rework and R6 (auto-accept toggle UI) explicitly cut/deferred. See `DECISIONS.md` "P0.4 R4/R5/R7/R8" |
| Brainstorm Hub — migrate to shared stack, Guided Setup, depth-adaptive propose, durable tray (P0.4 B0-B4) | Brainstorm moved off its own parallel chat implementation onto the shared `aiChats`/`chatContextService`/`ChatInterface` stack, own `chatType: "brainstorm"`. Composer blurb + Guided Setup button + Light/Standard/Grill-me style dropdown (confirmed prompt-driven with user, not a tracked interview state machine) + empty-story "Start in Brainstorm" CTA. Opt-in toggles: Notes/Outline/Memory (existing) plus new Lorebook/Chapter Summaries (Brainstorm is the first chat type where lorebook search defaults OFF). Two new fences — `overview-proposal` (synopsis/overview note/opt-in memory, one discriminated fence) and `handoff-packet` (Outline/WB/Notes/Research, multiple per reply) — persisted immediately on parse as durable `brainstormChecklist` rows (new table, genuinely different status lifecycle than `codexPendingChanges`: Open/Send/Accept perform the real write but stay Active, only "Mark done" moves to Done). WB handoff reuses the existing `pendingLorebookSeed` mechanism unchanged; Outline/Research reuse a new generalized `StoryContext.pendingChatComposerSeed` + `ChatInterface`'s new `initialComposerText` prop; Notes handoff creates directly (no chat rail exists yet). Separate `brainstormSlots` table backs a fixed 5-slot known/unknown setup checklist. Found and fixed a real pre-existing bug along the way: `POST /api/notes` never set `updatedAt` (NOT NULL column), silently 500ing every note-creation path in the app, not just this new one. B5 (WB/Outline domain playbooks) and the S/K/R6 tracks stay explicitly out of scope. See `DECISIONS.md` "P0.4 B0-B4" |

Design docs that still say “not implemented” in their headers may be stale for A/B/G1 — trust this file + `CLAUDE.md` over those headers until they are refreshed.

---

## Recommended build order (from here)

```
1. Continuity glue (memory ↔ chat/scan)    ← P0/P1
2. Graph G1.5 / Agent C only if daily pain ← P1
3. Bugfix pass                           ← P2 (anytime)
4. Nice-to-haves                           ← P3
```

---

## P0 — High leverage / incomplete core claims

### P0.1 — RAG Scanner frontend — ✅ Done (2026-07-18)

Editor right-rail drawer (`EditorToolsPanel.tsx`'s `"ragScanner"` drawer, chapter-scoped) and a story-wide "Scanner" sidebar tool (`RagScannerPanel.tsx`) both shipped — trigger via `POST /api/agent/jobs` (owner-only, per user decision), progress via job polling, issues list with Open/Resolved/Dismissed tabs bound to `ragScanIssues`. Not built this pass, still open if revisited: inline highlights in chapter text, full dual-write retirement of `ragScans`, auto-chaining `distill_memory`. See `DECISIONS.md` "RAG Scanner Frontend (P0.1) — Load-Bearing Decisions".

---

### P0.2 — Chapter alternate-version tabs — ✅ Done (2026-07-18), but read the note below

**This shipped a different feature than this item originally described**, per direct user correction mid-build: not linear chapter-content history/undo, but chat-branching-style alternate drafts — flat tabs next to the main chapter (`ChapterVersionsPanel.tsx`), created via AI regenerate (`GenerateVersionDialog.tsx`, new `chapter_version` feature endpoint) or manual duplicate, each independently editable (`VersionEditor.tsx`, its own autosave), with an optional side-by-side compare toggle and a one-way "Compile to Main" action. `chapterVersions` table, `server/routes/chapters.ts`'s `/versions` sub-routes. See `DECISIONS.md` "Story-Layer Chapter Versioning (P0.2) — Load-Bearing Decisions" for the full scoping trail and load-bearing choices.

**The original problem this item was written to solve was split out and is now done separately as P0.2b below** (chapters still had zero linear undo history and a fully destructive autosave when this item shipped — nothing about the alternate-version-tabs feature itself touched that).

**Refs:** `CLAUDE.md` Project Saves; `DECISIONS.md` "Project Saves — Phase 1 (Codex Layer…)" and "Story-Layer Chapter Versioning (P0.2)"

---

### P0.2b — Chapter content undo/restore — ✅ Done (2026-07-19)

Linear undo history for the main chapter's own content, mirroring the Codex `codexSnapshots`/restore precedent for real this time. New `chapterSnapshots` table (forms a restore chain, unlike P0.2's flat `chapterVersions`). Server-side throttled `'auto'` checkpoints (~15min per chapter, computed inside the chapter content `PUT` route) plus manual named saves and restore, surfaced via a new "History" drawer in `EditorToolsPanel.tsx`. Compile (P0.2) and Restore both now take an unconditional safety checkpoint before their one-way overwrite, closing the "no backup" gap P0.2 shipped with. See `DECISIONS.md` "Chapter Content Undo/Restore (P0.2b) — Load-Bearing Decisions" — including two real bugs caught live before shipping: a `createdAt` tie-break ordering bug, and a race condition where Restore/Compile could silently undo themselves seconds later via a stale-cache reload.

**Refs:** `CLAUDE.md` Project Saves; `DECISIONS.md` "Project Saves — Phase 1 (Codex Layer…)" and "Chapter Content Undo/Restore (P0.2b)"

---

### P0.3 — Continuity glue (memory + scanner + writing loop + Notes/Outline bridges)

**Status:** ✅ Fully done (2026-07-20). Notes/Outline bridge "Core Bridge" scope (N0-N4, O1-O4) — done. C1 (project memory chat toggle) — done. N5 (save message/selection as note), N6 (AI note-proposal accept/reject card), C2 ("suggest memories from this scan" button), C3 (scanner reads active Project Memory for contradiction checks, per-scan opt-in), C4 (per-story unattended scan schedule, default off), C5 (Codex auto-compile from manuscript via a new manual-trigger job + entry-scoped pending-changes review panel) — all done, same session. See `DECISIONS.md`'s "P0.3 Remaining Slices (N5/N6, C2-C5) — Load-Bearing Decisions".  
**Why:** Project memory, graph, scanner, Notes, and Outline don’t yet form a daily continuity loop. Models default to lorebook+chapter RAG only; Notes/Outline are human silos.

**N0-N4 + O1-O4 shipped 2026-07-20** — see `DECISIONS.md` "Notes/Outline ↔ Chat Bridge (P0.3, Core Bridge scope)" for the full load-bearing trail, including two real pre-existing bugs found (and one fixed) during verification: story export/import previously crashed on any lorebook entry with a non-null `updatedAt` (fixed), and the story `DELETE /:id` route's async transaction callback is incompatible with better-sqlite3's sync-only transaction API (not fixed — unrelated to this feature, flagged as a P2 bug below, ID B7). Brainstorm chats are wired narrower than the other chat types by deliberate design call — see that DECISIONS.md entry for why.

**C1 shipped 2026-07-20, same session** — new `aiChats.includeMemory` toggle + `resolveMemories` in `chatContextService.ts`, surfaced in the same World-Building/Research/Brainstorm chat UI the Notes/Outline toggles landed in. No per-item flag needed on the memory side (every `status: "active"` memory is already index-eligible via Phase B's own approve step). See `DECISIONS.md` "Project Memory Chat Toggle (C1)".

**Canonical design (Notes/Outline ↔ chat):** `docs/Notes_Outline_Chat_Bridges_Design.md` (locked 2026-07-18).

#### Persistence & project packaging (required with bridges — locked)

| # | Recommendation |
|---|----------------|
| 1 | Treat **`notes` / outline item rows as SoT** — RAG is derived cache only; toggle-off never deletes the row |
| 2 | Add **notes (+ `includeInAi`)** to **story export/import** (`GET /stories/:id/export` omits them today) |
| 3 | Add **outline items (+ `includeInAi`)** to story export/import (same packaging gap) |
| 4 | **Do not export RAG chunks** — reindex after import from rows + flags |
| 5 | **Project Saves timelines stay Codex/chapter-focused** unless note/outline history is explicitly reopened later; portable package = story JSON export/import |

Also: extend **`reconcile_index`** valid keys for armed notes/outline only — never a job that deletes note rows as “orphans.”

#### Notes/Outline ↔ chat slices

| Slice | Description |
|-------|-------------|
| N0 | ✅ Story export/import includes notes (+ outline); round-trip `includeInAi`; no RAG blobs in export |
| N1 | ✅ `notes.includeInAi` (default false) + UI toggle/badge (bulk enable not built — single-item toggle only) |
| N2 | ✅ RAG `entityType: "note"` only when armed; remove on off/delete; reconcile_index |
| N3 | ✅ Per-chat `includeNotes` / `includeOutline` (default false) on **all chats except Editor** — including Brainstorm, wired narrower (see DECISIONS.md) |
| N4 | ✅ `chatContextService` non-canon packets when **both** gates pass (top-K, labeled working material) |
| N5 | ✅ Manual "Save message as note" — hover action in `ChatMessageList.tsx` (both chat surfaces), `NoteFormDialog.tsx` reused |
| N6 | ✅ AI `note-proposal` fence + accept/reject `NoteProposalCard.tsx` — non-Editor `features/chat` chats only (not Brainstorm, see DECISIONS.md) |
| O1–O4 | ✅ Same double-gate pattern for outline items |

**Inclusion doctrine:** per-item AI flag AND per-chat toggle, both default OFF; Editor never gets these toggles.

#### Existing memory/scanner slices (any order)

| Slice | Description |
|-------|-------------|
| C1 | ✅ Opt-in **“Include project memory”** for chat / context (`entityTypes` includes `agent_memory`) |
| C2 | ✅ **“Suggest memories from this scan”** button (per completed scan, `RagScannerPanel.tsx` scan history) → enqueues `distill_memory` via the existing generic `POST /api/agent/jobs` (manual only; no silent auto-chain) |
| C3 | ✅ Scanner may **read active** `agent_memory` when opted in per-scan (`includeMemory` toggle in `RagScannerPanel.tsx`/`ChapterScannerDrawer.tsx`, carried as the job's own `payload.includeMemory` — not a persisted setting) — factual contradiction checks via a second scanner system prompt variant |
| C4 | ✅ Per-story **unattended** `rag_scan_story` schedule toggle (default OFF) — `stories.unattendedScanEnabled` column (migration `0035_odd_nextwave.sql`), fixed daily cadence in `jobRunner.ts`'s schedule tick, toggle in `RagScannerPanel.tsx` |
| C5 | ✅ **Codex auto-compile from manuscript** — done 2026-07-20, shaped exactly per this row's own recommendation: manual-trigger-only new `suggest_codex_updates` job (`codexCompileJob.ts`), never auto-chained, proposing updates to **existing** Codex-enabled entries only (wardrobe/appearance/wounds/items — never customFields/description/new entries) through the *existing* `codexPendingChanges` approve/reject pipeline (`sourceType: "ai"`, previously unused). New review surface added since the existing chat-scoped tray couldn't show job-sourced proposals: `CodexPendingChangesPanel.tsx` (entry-scoped, source-agnostic) next to `CodexHistoryPanel.tsx` in the Lorebook entry editor. Trigger button ("Suggest Codex updates from this chapter") lives in `ChapterScannerDrawer.tsx`. New `codex_compile` per-feature endpoint key. `useReviseProposalMutation`'s "Edit First" was NOT extended to this new panel (Approve/Reject only — no chat to revise through); still only wired for the chat-scoped tray, per the R0-R3 entry. See `DECISIONS.md`'s "P0.3 Remaining Slices (N5/N6, C2-C5)" for the full trail, including a documented stale-dev-server artifact (the user's other running session needs a restart to pick up the new job type/route/schema changes). |

**Refs:** `docs/Notes_Outline_Chat_Bridges_Design.md`; `docs/Chat_Panel_Integrations_Design.md`; Agent design Phase C; `DECISIONS.md` Phase B (no auto-distill; no suggest UI yet)

**Clarification 2026-07-19:** Keep agent memory **within existing plan** (Project Memory + Phase C as already designed). Do **not** add new unplanned agent-self / always-on / silent-learning memory. Ship planned C1–C4 and Phase C items; no scope expansion beyond the design docs.

---

### P0.4 — Chat ↔ panel integrations (selection rework + host chats)

**Status:** R0-R3 — ✅ Done (2026-07-20). R4/R5/R7/R8 — ✅ Done (2026-07-20, same day). B0-B4 (Brainstorm Hub) — ✅ Done (2026-07-20, same day). B5 (WB + Outline guided-start, Character psych module) — ✅ Done (2026-07-20, same day). R6 (auto-insert/auto-accept toggles) — ✅ Done (2026-07-20, same day). Design locked for WB + Editor + Outline + Brainstorm + Research + Notes desk + generalized pattern (2026-07-18); the S/K tracks **not implemented**  
**Canonical design:** `docs/Chat_Panel_Integrations_Design.md`

**Doctrine:** Panel owns artifact; **chat governs** content; selection/focus owns span; Accept applies; no amnesiac one-shot as primary path.

**R0-R3 shipped 2026-07-20** — see `DECISIONS.md` "Editor Selection Rework + Codex Proposal Tray (P0.4 R0-R3)" for the full load-bearing trail, including a real correctness bug fixed in `activeChapterEditorStore.ts` (single global slot → per-chapter map) and a second pre-existing bug found and fixed in `useCreateChatMutation`/`useUpdateChatMutation`'s cache invalidation (was invalidating a key that never matched any real query). Full live Accept round-trip (real LLM reply → replace selection) could not be exercised in this dev environment — the configured AI provider returned zero content tokens for reasons unrelated to this feature's code (see that DECISIONS.md entry) — every other piece (capture, chat binding, context delivery, tray) was verified live.

**R4/R5/R7/R8 shipped 2026-07-20, later the same day** — see `DECISIONS.md` "P0.4 R4/R5/R7/R8 — Lorebook Rework → WB, Dedicated Outline Chat, Outline Row Rework, WB Handoff" for the full load-bearing trail. Note: the backlog line below previously called R6-R7's `chatType` split "deliberately deferred — neither R0-R3 nor R4/R5/R8 strictly require it"; that was wrong for R7 specifically — Outline had no chat identity of its own (it was reusing `EditorChatRail` with `chatType="editor"`), so a real dedicated Outline chat (R5) was impossible without R7's split, which happened here as part of R5. **R6 (auto-insert/auto-accept toggle UI) stays deferred** — genuinely optional, every new proposal path here defaults to manual accept with no new toggle added. Found and fixed one real pre-existing bug along the way: `ReworkCard.tsx`'s trailing hint text was hardcoded chapter-specific ("...in the chapter"), misleading for the new Lorebook/Outline rework cases — now a `hostHint` prop varying per `FocusTarget.kind`. R4 shipped narrower than the design doc's host matrix: description-field sub-span rework only, not per-row structured-Codex-field (wardrobe/wounds/items) rework — cut for cost/value (3 components deep, no `entryId` threaded, low marginal value for short single-line fields), flagged as a fast-follow. Live-verified end to end except the actual model-generated `outline-proposal`/`lore-suggestion` fence content and the resulting "Open in WB" handoff — same "no reachable AI provider in this dev sandbox" limitation every session since R0-R3 has hit.

**B0-B4 shipped 2026-07-20, still the same day** — see `DECISIONS.md` "P0.4 B0-B4 — Brainstorm Hub" for the full load-bearing trail. Migrated Brainstorm off a fully separate parallel chat implementation (own `ChatInterface`/`ChatList`/generation hook, never touching `chatContextService`) onto the shared stack with its own `chatType: "brainstorm"`. Confirmed with user via `AskUserQuestion` before building: B2's "playbook" depth is prompt-driven (Light/Standard/Grill-me system-prompt hints shaping ordinary chat), not a scripted ask/capture/confirm state machine — the only persisted "slot" concept is a fixed 5-entry known/unknown checklist (`brainstormSlots` table). Two new fences (`overview-proposal`, `handoff-packet`) persist immediately on parse as durable `brainstormChecklist` rows — a genuinely different status lifecycle (`pending→opened→done/dismissed`) than `codexPendingChanges`, since B4 requires Open/Send/Accept to perform the real write without clearing the Active queue. All four handoff destinations (Outline/WB/Notes/Research) live-verified end to end via manually-inserted checklist rows standing in for live model output (same AI-provider-unreachable limitation as every prior P0.3/P0.4 session). Found and fixed one real, previously-undiscovered bug along the way, unrelated to this feature's own code but blocking its Notes handoff: `POST /api/notes` never set the `NOT NULL` `updatedAt` column, silently 500ing on every note-creation path in the app (Notes tool's own "New Note" button included) — two-line fix, no caller behavior change.

**B5 shipped 2026-07-20, still the same day** — see `DECISIONS.md` "P0.4 B5 — WB + Outline Guided-Start Playbooks + Character Psych Module" for the full load-bearing trail. User confirmed via `AskUserQuestion` to include Outline in this slice (its own locked spec didn't explicitly require guided-start UI, unlike WB's), for parity across all three playbook-style chats. `GuidedSetupControl.tsx` generalized (moved `features/brainstorm/` → `features/chat/`) so WB and Outline reuse the same shell with their own blurb/opening-lines/style-hint text (`aiChats.wbStyle`/`outlineStyle`, new `WB_STYLE_HINTS`/`OUTLINE_STYLE_HINTS`). WB's Character template gets an opt-in psych module (MBTI/Enneagram/blurb) via a new `psych-proposal` fence — deliberately **not** routed through `codexPendingChanges`/`codexSnapshots` (which stay concrete-state-only per CLAUDE.md's standing constraint); writes straight to `metadata.psychProfile` via the *existing* generic `PUT /api/lorebook/:id` route, no new server route needed. Found and fixed a real correctness bug affecting B0-B4's `brainstormStyle` too, not just B5's new columns: `ChatInterface.tsx`'s context-fetch effect never included any style/psych value in its dependency array, so changing style or the psych toggle updated the DB correctly but the component's own cached system-prompt context silently stayed stale for the next message until something else happened to refire the effect — fixed by adding the four style/psych fields to the dependency array (safe since every caller already passes a fresh chat object on change, not a mutation).

**R6 shipped 2026-07-20, still the same day** — see `DECISIONS.md` "P0.4 R6 — Auto-insert/Auto-accept Toggles" for the full load-bearing trail. Three new `aiChats` columns (`autoInsertProse`, `autoAcceptCodex`, `autoAcceptOutline`, migration `0038_motionless_human_torch.sql`), all default false per doctrine ("no silent canon unless an explicit toggle is ON"). `autoInsertProse` (Editor only) and `autoAcceptOutline` (Outline only, create/edit/reorder — **delete deliberately excluded**, matches the design doc's asymmetric table) live in `ChatInterface.tsx`; `autoAcceptCodex` (Editor/WB/Outline, gated on the existing `usesCodexTray` computation) chains a `useApproveProposalMutation` call right after `useChatMessageGeneration.ts`'s existing `createProposalMutation` succeeds — same call `ProposalTrayCard`'s manual Approve button already makes. Prose auto-insert reuses a new `applyProseProposal` helper extracted from the pre-existing `handleAcceptProse`, so manual Accept and auto-insert never drift; falls back to the normal review card (never silently drops content) if no matching chapter editor is open. Found and fixed one real pre-existing type gap along the way: `chatsApi.proposeNewEntry` (`src/services/api/client.ts`) called `fetchJSON` with no type argument even though the server always returns `{ entry, snapshot, pendingChange }` — typed it to match `proposeModifyEntry`'s existing shape so the new auto-accept chain's `result.pendingChange.id` access is type-safe. `npm run build` (tsc client+server+vite) clean. Live-verified in the Browser pane: each chat type renders exactly its own toggle subset (Editor: auto-insert prose + auto-accept Codex; WB: auto-accept Codex alongside the pre-existing untouched Guided Setup psych-module toggle; Outline: auto-accept Codex + auto-accept outline), a toggle flip PATCHes and survives a full reload, and — since this dev sandbox still has no reachable AI provider (same limitation every P0.4 session has hit) — the actual auto-accept chain was exercised directly via the REST API (create a pending Codex proposal → immediately approve it, mirroring the new `onSuccess` callback exactly) and confirmed the entry updates and the pending row lands `"approved"`. All test artifacts (a scratch chat, a scratch Codex proposal/snapshot) were cleaned up from the demo story afterward.

| Slice | Description |
|-------|-------------|
| R0 | ✅ Shared FocusTarget / FocusPacket / ReworkCard shell (`src/types/rework.ts`, `src/features/rework/`) |
| R1 | ✅ **Editor:** highlight → Rework card → Editor chat (before/after/selection + full editor context) → Accept **replaces selection** |
| R2 | ✅ Buried primary floating one-shot Expand/Rewrite/Shorten behind "More"; now chips that send instructions into host chat |
| R3 | ✅ Editor Codex **tray under chat list** (this chat only, `CodexProposalTray.tsx`); Edit-before-approve wired (`useReviseProposalMutation`, previously unused); auto-accept still default OFF (unchanged — no auto-accept toggle added this pass) |
| R4 | ✅ **Lorebook:** description-field sub-span rework → **WB chat** → `codex-proposal` (`modify_entry`) reviewed via the same tray Editor uses (WB's inline `ProposalCard` retired in favor of it). Structured Codex-field (wardrobe/wounds/items) rework **not included** this pass |
| R5 | ✅ **Outline chat:** own `chatType`/`promptType: "outline"`, own rail/list (`OutlineChatRail.tsx`); always-on full outline tree + written-chapter-summaries context (`chatContextService.ts`); `outline-proposal` fence (create auto-persists as a pending tree row, edit/reorder/delete are ephemeral cards) + auto-accept OFF; **bulk Generate button retired** (`outlineGenerator.ts` deleted); Codex tray reused; note-proposal reused; `lore-suggestion` fence + tray section |
| R6 | ✅ Auto-insert (prose, Editor) / auto-accept (Codex — Editor/WB/Outline; outline create/edit/reorder — Outline only, never delete) toggles per host, defaults OFF. New `aiChats.autoInsertProse`/`autoAcceptCodex`/`autoAcceptOutline` columns; Codex auto-accept chains `useApproveProposalMutation` right after proposal creation in `useChatMessageGeneration.ts`; prose auto-insert/manual Accept share a new `applyProseProposal` helper |
| R7 | ✅ Split `chatType` **editor** vs **outline** (separate chat lists) — done as part of R5, see note above |
| R8 | ✅ Outline row "Rework in chat" (whole title+summary, not sub-span) + tray **Open in WB** from lore-suggestion cards, via the same same-tab `StoryContext.pendingLorebookSeed` pattern the Relationships graph's "Open entry" already used |
| B0–B4 | ✅ **Brainstorm hub:** migrated to shared `aiChats`/`chatContextService`/`ChatInterface` stack (`chatType: "brainstorm"`); CTA+blurb+Guided setup+style dropdown (`GuidedSetupControl.tsx`); depth is prompt-driven (`STYLE_HINTS`), not a state machine, per fixed 5-slot known/unknown checklist (`brainstormSlots`); depth-adaptive `overview-proposal` (synopsis/note/opt-in memory) + `handoff-packet` (Outline/WB/Notes/Research, multi-per-reply) fences; durable tray checklist (`brainstormChecklist` table, `BrainstormChecklistTray.tsx`) — Open/Send/Accept perform the real write but only **Mark done** clears Active. WB handoff reuses `pendingLorebookSeed`; Outline/Research reuse new `StoryContext.pendingChatComposerSeed` + `ChatInterface`'s new `initialComposerText` prop; Notes handoff creates directly. Found/fixed a real pre-existing `POST /api/notes` bug (missing `updatedAt`) along the way. See `DECISIONS.md` "P0.4 B0-B4" |
| B5 | ✅ WB + Outline guided-start (shared `GuidedSetupControl.tsx`, per-host style hints, `wbStyle`/`outlineStyle` columns); Character template **psych module** (MBTI/Enneagram/blurb via new `psych-proposal` fence → `metadata.psychProfile`, Grill-me nudges the toggle on; deliberately outside `codexPendingChanges` — writing aid only, never Codex state). Location playbooks (per `Locations_And_Maps_Design.md`) **not included this pass** — still P3/unstarted, see that doc's own row below. See `DECISIONS.md` "P0.4 B5" |
| S0–S5 | **Research:** Story/Global mode; web search+fetch; citations; save-as-note on request; opt-in lore/notes context; copy-friendly blocks |
| K0–K5 | **Notes desk:** badges/filters/pin; optional `notes` chat; rework/split; promote tray (Mark done); import dump→Notes; N-gates for other chats |

**Also locked (see design doc):** full §1–§7 (WB, Editor, rework, Outline, Brainstorm, Research, Notes desk).

---

## P1 — Polish on shipped systems

### P1.1 — Agent Framework Phase C (à la carte)

- Richer Project Memory UX (session pin semantics, prioritization, superseded history tab)
- Cross-project `writer_pref` browser
- Soft concurrency for non-overlapping jobs (only if serial becomes painful)
- Migrate fully off `ragScans` dual-write (only when UI/API consumers are ready)

### P1.2 — Relationship Graph G1.5+

- AI **suggest edges** → `status: pending` only; approve/reject UI
- **Persist layout** (`storyGraphLayout` or equivalent)
- Pending-edge review (column already exists; nothing produces non-`active` rows yet)
- Optional: reindex lorebook text when edges change so RAG sees relationships

**Refs:** `docs/Thin_Story_Graph_And_Lorebook_Visualization.md`; `DECISIONS.md` Lorebook Relationship Graph

### P1.3 — Chat context

- Per-message / conversation-seeded RAG (not only static chat title) — explicitly deferred in chat-anchoring DECISIONS

### P1.4 — Visible AI Reasoning (full product)

- Tag display exists (`parseThinking`, `ThinkingBlock`)
- Full design (richer traces, per-pipeline visibility) still mostly aspirational — confirm **narrow display-only** vs expanded scope before building

**Refs:** Hermes `2026-06-26_Visible_AI_Reasoning_Design.md`; story-nexus skill scope note

---

## P2 — Known bugs / debt

| ID | Issue | Notes |
|----|--------|--------|
| B1 | **Word count reads 0** | `WordCountPlugin` traversal bug; breaks word-count focus goals |
| B2 | **Beat mark text deleted in editor leaves DB row** | Needs mutation listener / cleanup on mark removal |
| B3 | **Global/series lorebook not in RAG** | By design for now; multi-story association needed later |
| B4 | **Story scan job restarts from chapter 0 after crash** | Visibility yes; mid-scan resume no |
| B5 | **Legacy `metadata.relationships` wiped on lorebook save** | Edge table is SoT; don’t re-depend on metadata JSON for links |
| B6 | Stale design-doc headers | Update Agent/Graph design status lines when convenient |
| B7 | **Story `DELETE /:id` always 500s** | `db.transaction(async tx => {...})` — better-sqlite3's transaction API is sync-only and rejects an async callback with `TypeError: Transaction function cannot return a promise`. Found 2026-07-20 while verifying P0.3 export/import (unrelated to that feature). Needs restructuring the lorebook-cascade + story-delete two-step to not need `async`/`await` inside the transaction callback. |

---

## P3 — Nice-to-haves / old roadmap (not current foundation)

| Item | Notes |
|------|--------|
| **Import to Outline** | **User note 2026-07-18:** add import into Outline (parallel to multi-format lorebook import). Accept outline/structure docs → chapter/scene `outlineItems` (manual confirm before bulk create). Scope formats + merge-vs-replace when picked up. Not started. |
| **Name generator** | **Gaps closed 2026-07-19 (v0.3).** Design: `docs/Name_Generator_Design.md` (+ Hermes plans mirror). **Not started.** Slices NG0–NG7: schema → API → seed core → panel → syntax → import → optional tool. P3 until explicitly promoted. |
| **Locations & maps** | **Locked 2026-07-19.** Design: `docs/Locations_And_Maps_Design.md`. Location grill in playbook v1; map SoT = graph then layout text (images illustration only); mood + map image presets; entry layout + Story Map tool; light place sheet now, full place-Codex later. Slices L0–L5. P3 / promote with playbooks. |
| Spellcheck / LanguageTool depth | Settings/types exist; full design may exceed current UX |
| Gemini provider polish | `docs/gemini-provider-plan.md` |
| Mobile responsive overhaul | `docs/mobile-responsive-refactor-plan.md`, issue-58 plan |
| Obsidian integration | Hermes design only |
| Full multi-writer collab (invites, comments, change tracking) | Beyond basic owner/editor/viewer patterns |
| Advanced export profiles | Baseline export exists |
| Style memory / what-if explorer / alt generations | Old Phase 2 roadmap |
| Analytics, plugin system | Old Phase 5 |
| Personal_Agent_Memory → Story Nexus bridge | Separate product; API client later, not a fork rewrite |
| Graph/memory psych or power-dynamic types | **Out of scope** permanently unless user reopens |

---

## Explicitly out of scope (unless user reopens)

- Thematic / corruption / psychological enforcement pipelines as system features
- External queue/worker (Redis, Bull) or second process for jobs
- Neo4j / Mem0 / Letta inside Story Nexus
- Merging Personal_Agent_Memory_System into the fork DB

---

## Suggested next Claude kickoff (copy-paste)

```text
Read CLAUDE.md and docs/CURRENT_BACKLOG.md.
P0.1, P0.2, P0.2b, and all of P0.3 (Notes/Outline "Core Bridge" N0-N4/O1-O4, C1 project memory
chat toggle, N5/N6 save-as-note + note-proposal, C2-C5 scanner-memory integration/distill button/
scheduled scans/Codex auto-compile) are all done, along with P0.4's R0-R3 (Editor selection
rework + Codex proposal tray), R4/R5/R7/R8 (Lorebook rework → WB, dedicated Outline chat +
its own chatType split, outline row rework, WB handoff), B0-B4 (Brainstorm Hub migrated to
the shared chat stack, Guided Setup + depth-adaptive propose + durable handoff/checklist tray),
and B5 (WB + Outline guided-start with the same shell, Character psych module).
Remaining work: P0.4's R6 (auto-insert/auto-accept toggle UI, genuinely deferred) and the S/K
tracks (Research web search, Notes desk polish) — any order, pick the highest-value one first
unless the user redirects. P1 (Agent Framework Phase C, Relationship Graph G1.5+) and P2 bugs
(see that section) are also open.
Record load-bearing decisions in DECISIONS.md; update CURRENT_BACKLOG.md when done.
```

---

## Document map

| Doc | Role |
|-----|------|
| `CLAUDE.md` | Architecture + constraints + high-level done flags |
| `DECISIONS.md` | Why/how of each shipped change |
| `docs/CURRENT_BACKLOG.md` | **This file** — remaining work + priority |
| `docs/Notes_Outline_Chat_Bridges_Design.md` | Notes/Outline ↔ chat double-gate + export packaging (locked 2026-07-18) |
| `docs/Chat_Panel_Integrations_Design.md` | WB/Editor locks, selection rework, generalized panel↔chat pattern |
| `docs/Name_Generator_Design.md` | Name generator v0.3 (gaps closed 2026-07-19); NG0–NG7 |
| `docs/Locations_And_Maps_Design.md` | Location playbooks, place sheet, Story Map, image presets (locked 2026-07-19) |
| `docs/Agent_Framework_And_Project_Memory_Design.md` | Agent A/B design (A/B shipped; C backlog) |
| `docs/Thin_Story_Graph_And_Lorebook_Visualization.md` | Graph design (G1 shipped; G1.5+ backlog) |
| Hermes `.hermes/plans/*` | Historical designs; may be stale vs CLAUDE |

---

*Update this file whenever a P0/P1 item ships or priority changes.*
