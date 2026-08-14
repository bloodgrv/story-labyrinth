# CLAUDE.md — Story Labyrinth (fork of The Story Nexus)

**Project:** Story Labyrinth — a fork of The Story Nexus  
**Owner:** Reuben  
**Date:** 2026-06-29  
**Supervisor:** Hermes Agent

---

## Project Goal

Create a purpose-built fork of JonSilver/TheStoryNexus optimized for long-form erotic/psychological fiction with strong emphasis on:

- Concrete dynamic state tracking (wardrobe, appearance, wounds, items, user-defined fields)
- Factual consistency (preventing drift from established facts and Codex state)
- Interview-style world-building via specialized chats
- Strong user control and non-destructive history

---

## Key Architectural Decisions

### Character Codex
- Extends the existing Lorebook
- Focuses on **concrete/physical state** only (no psychological modeling)
- Supports per-entry snapshot history with restore capability
- Tracks source of changes (chat + user)
- Quick-add from Main Editor with "Needs fleshing out" tagging
- Codex state (wardrobe/appearance/wounds/items) is user-typed or chat-proposed (Approve/Reject; "Edit First" exists server-side but has no UI yet); a manual-trigger "Suggest Codex updates from this chapter" auto-compile path also exists (P0.3 C5, `suggest_codex_updates` job, review via `CodexPendingChangesPanel.tsx`) — never auto-chained, always propose→approve
- Entry editor's default primary surface is the **Lore Sheet** (T5, **FS0-FS8 all shipped**, `sheetBody` markdown + per-category section outline + "Insert template" + optional "Improve with AI" + "Sync structured fields", `LoreSheetEditor.tsx`) — the old "Natural View" prose-profile toggle is **retired** (deleted, not just hidden). Structured Codex/description/tags/level/scope ("machine chrome") live under the entry editor's collapsed-by-default "Advanced" panel; a pre-existing entry with no sheet yet gets a deterministic reverse-compile from its own description/Codex/placeState on first open (`reverseCompileSheet.ts`), not a blank template — a document-import draft (FS7) gets the exact same reverse-compile, fed from its own extracted description/codexState, instead of a blank template. "Sync structured fields" (`sheetSyncService.ts`, hybrid deterministic `##` split + LLM row/list extraction) is the forward direction — it proposes into the *existing* Codex tray (`CodexPendingChangesPanel.tsx`, now entry-scoped rather than `codexEnabled`-gated) as a `codexPendingChanges` row, same propose→Accept doctrine as every other Codex proposal, never a silent write; that tray (and the chat-driven Codex proposal tray, `ProposalTrayCard.tsx`) now shows a **diff** against the entry's current state (FS8) — added/removed for the full-replace list buckets (wardrobe/wounds/items), before→after for the merge-by-key labeled fields (appearance/customFields), via shared helpers in `codexStateDiff.tsx`. Structured (non-description) sync targets are scoped to `character`/`location` only (the only categories with a live structured-state UI); every category still gets its sheet's narrative sections compiled into `description`. A WB chat anchored to an entry can also draft/expand the sheet directly via a ```sheet-proposal``` fence (any WB template, not just Character/Locations — `chatContextService.ts`'s `SHEET_PROPOSAL_INSTRUCTIONS`), accepted wholesale via `SheetProposalCard.tsx`; its "Accept & Sync" button chains straight into the Sync call above (still a real, separate Codex-tray Approve, not a bypass). RAG indexing switches to `name+sheetBody+codex+placeState+edges` (skipping `description`) once a sheet is non-empty (FS6, `buildLorebookEntryText` in `ragIndexService.ts`). Sync also proposes three independent cross-desk lanes alongside the Codex tray (FS5): a location's Layout Notes section as a `metadata.placeState.layoutMd` apply-to-map card; an event/timeline entry's When/Summary as a **pending** Timeline pin (reuses the Relationship-Graph-style pending/approve lane, reviewed in Timeline's own Pending tab — a global/series-level entry gets a soft notice instead, FS8's §5d); a `note`-category entry as a one-shot "create a Notes-desk note" offer (no persisted link back). See `docs/Lore_Sheet_And_Sync_Design.md`

### Chat System
- Six main contexts, each its own `chatType` with its own chat list:
  - World-Building Chats (multiple focused chats with templates)
  - Research Chat (web research desk; Story mode default + Global mode toggle, P0.4 S0, see `DECISIONS.md`)
  - Main Editor Chat (writing-focused)
  - Outline Chat (structure-focused; own chat list — **not** a WB template anymore, split out P0.4 R5/R7, see `DECISIONS.md`)
  - Brainstorm Chat (project intake/orientation hub; own chat list — migrated off a separate parallel stack onto this shared one in P0.4 B0-B4, see `DECISIONS.md`)
  - Notes Chat (working-material desk; own chat list, P0.4 K1, see `DECISIONS.md`)
- All Codex modifications require explicit user approval (Approve / Reject / Edit First)
- Per-chat saved prompts supported
- **Brainstorm** (P0.4 B0-B4, **implemented**) — intake/orientation hub, not a structure desk or lore factory. Composer blurb + Guided Setup button + Light/Standard/Grill-me style dropdown (prompt-driven depth, not a tracked interview state machine — confirmed with user); opt-in toggles for Notes/Outline/Memory/Lorebook/Chapter Summaries (Lorebook defaults OFF here, unlike every other chat type). Writes only through two fences — `overview-proposal` (synopsis/overview note/opt-in memory) and `handoff-packet` (Outline/WB/Notes/Research, multiple per reply) — never direct Codex/outline/prose writes. Durable tray (`brainstormChecklist` table): Open/Send/Accept perform the real write but stay in the Active queue, only "Mark done" moves an item to Done. Separate `brainstormSlots` table backs a fixed 5-slot known/unknown project-setup checklist.
- **WB + Outline guided-start, Character psych module** (P0.4 B5, **implemented**) — same Guided Setup shell (`src/features/chat/components/GuidedSetupControl.tsx`, generalized from Brainstorm's) extended to World-Building and Outline chats, each with their own style-hint text and `aiChats.wbStyle`/`outlineStyle` column. WB's Character template additionally gets an opt-in psych module toggle (MBTI + Enneagram + freeform blurb) — a `psych-proposal` fence, ephemeral accept/reject card, Accept merges into the anchor entry's `metadata.psychProfile` via the existing generic lorebook update route. Deliberately **not** Codex state and never routed through `codexPendingChanges`/`codexSnapshots` — stays a "writing aid only," never scanner-enforced, consistent with Character Codex's concrete-state-only scope above. `PsychProfilePanel.tsx` in the Lorebook entry editor renders it read-only; no manual edit form (chat propose→accept is the only write path).
- **Locations & Maps — WB place-sheet module** (L0-L1, **implemented**, `docs/Locations_And_Maps_Design.md`) — WB's `locations` template gets a 10-slot location script folded into its system-prompt hint (prompt-driven, no tracked state machine) plus an always-on light "place sheet" (`entry.metadata.placeState`: scale/biome/holder/danger/landmarks/exits/layoutMd/imageBrief/floorLabel). Unlike the psych module, this **does** get a manual edit form (`PlaceSheetFields.tsx`, category="location" only) in addition to chat propose→accept (`place-sheet-proposal` fence, ephemeral card, merges into `metadata.placeState` via the same generic lorebook update route) — **unless** the entry has graduated to L4's versioned tracking (below), in which case Accept routes through `codexPendingChanges` instead. This light tier is **not** Codex state, same concrete-state-only boundary as psych, unless/until L4 promotes it. **L4 (full place-Codex versioning, implemented)** — a "Track Place State" switch (`PlaceCodexStateEditor.tsx`) promotes a location onto the exact same `codexEnabled`/`codexState`/`codexSnapshots`/`codexPendingChanges` machinery Character uses (confirmed already category-agnostic — zero schema changes), with location-flavored field groupings ("Place Details" customFields, "Landmarks" as the `items` array) instead of Wardrobe/Appearance/Wounds. See `docs/CURRENT_BACKLOG.md` for the full L0-L5 pass including multi-floor nesting and export, and its Maps v2 entry for the sketch-canvas **Maps** tool (`docs/Maps_V2_Sketch_Design.md`, MV0-MV7, fully implemented) that replaced the original L3 Story Map spatial-relationship graph in that sidebar slot.
- **Auto-insert / auto-accept toggles** (P0.4 R6, **implemented**) — per-chat, per-doctrine "no silent canon unless an explicit toggle is ON," default OFF (`aiChats.autoInsertProse`/`autoAcceptCodex`/`autoAcceptOutline`). Auto-insert prose is Editor-only; auto-accept Codex applies to Editor/WB/Outline; auto-accept outline (create/edit/reorder, never delete) is Outline-only. Toggle row lives in the shared `ChatInterface.tsx`; Codex auto-accept chains onto the existing proposal-creation success callback in `useChatMessageGeneration.ts`.
- **Research web desk** (P0.4 S0-S5, **implemented**) — `src/components/workspace/tools/ResearchTool.tsx`. Story mode (default, light story seasoning via title+synopsis, opt-in Notes/Lorebook) vs. Global mode (pure web, not story-bound) — each is a single-chat identity, no chat list. Live web search + page fetch via DuckDuckGo HTML scraping (`server/services/webSearchService.ts`, no API key — explicit user choice), query-driven (fires on the user's actual message text via a new `explicitQuery`/`extraContext` path, never the mount-time context fetch) rather than a static per-chat toggle like Notes/Memory. `aiChats.webSearchEnabled` (default **true**, the desk's core job) is just an off-switch. Citations render via existing markdown link rendering. Own dedicated `RESEARCH_FRAMING` system prompt (`chatContextService.ts`) — fixed a real pre-existing bug where Research silently fell through to `WORLDBUILDING_FRAMING` and could propose Codex entries, violating the "no Codex/outline/prose writes" rule.
- **Notes desk** (P0.4 K0-K5, **implemented**) — `src/components/workspace/tools/NotesTool.tsx`. Badges/filters/pin on the note list (`notes.pinned`); own `notes` chatType + chat list (`NotesChatRail.tsx`, own `NOTES_FRAMING` system prompt) with always-on desk reads — every story note's title/type regardless of `includeInAi` (a desk privilege, unlike the opt-in Notes bridge other chat types use) plus the full body of whichever note is currently open. Whole-note "Rework in chat" (not sub-span — the WYSIWYG note body has no Lexical node-key selection or plain-textarea offsets to capture) reuses the existing `note-proposal` fence, Accept branching to update vs. create. Split-dump (a new `note-split-proposal` fence) and promote-to-synopsis/WB/Outline (reusing `overview-proposal`/`handoff-packet` unchanged) both persist through the same `brainstormChecklist` table Brainstorm's tray uses (confirmed chatType-agnostic already; a new `note_split` kind needed only a one-line allowlist bump, no schema change) — reviewed in `NotesChecklistTray.tsx`. Import dump seeds the Notes chat composer via the existing `pendingChatComposerSeed` pattern rather than a separate import path.
- **Chat Shuttle** (H0-H7, **implemented**, `docs/Chat_Shuttle_Design.md`) — keeps Editor/Outline/WB chats on-mission when a question is really an external/real-world-fact lookup: the model proposes (never auto-sends) a shuttle via a `shuttle-proposal` fence, persisted immediately as a durable `brainstormChecklist` row (`shuttle`/`shuttle_return` kinds, same zero-schema-change reuse K2/K3 established) and surfaced in a new `ShuttleTray.tsx` under each outbound host's chat list (Open / Answer here / Mark done — same B4 tray morals). Open reuses/creates the story's Research chat (Story mode) and pre-seeds its composer with the question + a short scene crumb via a new `StoryContext.pendingShuttleSeed`; "Answer here" seeds the *host's own* composer instead, without changing the tray item's status, so it stays Openable later. An optional "Send brief to origin" button in Research posts a `shuttle_return` packet (summary + extracted citation links) back to the origin chat's own tray — never auto-injected into that chat's transcript. Per-chat "always-shuttle" pref (`aiChats.autoShuttle`, default off) only skips the tray's manual Open click — it still never auto-sends a Research answer or force-switches tools. Highlight → Note (chapter prose selection via the floating toolbar; chat-bubble text selection via `window.getSelection()` in `ChatMessageList.tsx`) creates a note or seeds the Notes chat composer directly, with no rework/re-resolve step since neither surface writes back into the source.

### RAG Systems
- Vector RAG uses sqlite-vec (hybrid FTS5 + vector)
- RAG Scanner focuses on factual + concrete state consistency
- **Per-feature endpoint selection** required (writing model and scanner model can run on different machines)
- **Local in-process embeddings** (**implemented**, 2026-07-22) — a `"local-inprocess"` provider, valid only for the `embedding` feature, runs `nomic-ai/nomic-embed-text-v1.5` directly inside the Node server via `@huggingface/transformers` (`server/services/localEmbeddingService.ts`), so RAG indexing has zero external-endpoint dependency when selected. Model weights are baked into the Docker image at build time (`server/scripts/prefetchEmbeddingModel.mjs`, invoked directly in `Dockerfile`); runtime never reaches the network (`env.allowRemoteModels = false`), which is unconditional — not Docker-specific. A non-Docker build gets the same guarantee via `package.json`'s `prebuild` script running the same prefetch script before `npm run build` (2026-08-13 fix — this was previously Docker-only, so a fresh non-Docker clone selecting "Local (in-process)" for Embeddings without ever having run the prefetch script manually would fail outright at first use, no network fallback). Switching to/from this provider and re-running the "Rebuild embedding index" action (reuses the existing `reconcile_index` job with `storyId: null` = all stories) re-embeds everything so no vector index ever mixes two models' embedding spaces. See `docs/Local_Embeddings_Design.md` and `DECISIONS.md`'s "Local In-Process Embeddings — IE0-IE6" entry.

### UX Flow
- Dashboard as central hub (card grid + preferences sidebar)
- Everything opens in new browser tabs
- Full session persistence + user-configurable preferred tab setup
- Main Editor opens last chapter + dismissible session summary
- RAG Scanner in collapsible right rail (**implemented** — `EditorToolsPanel.tsx`'s Scanner drawer, chapter-scoped) plus a story-wide "Scanner" sidebar tool (scan history + full issue list); toggleable inline highlights in chapter text **not implemented**, see `DECISIONS.md`'s "RAG Scanner Frontend (P0.1)" entry
- Project Saves split into Codex + Story layers with separate visual timelines — **both implemented**. Codex layer: per-entry snapshot timeline + restore, in the Lorebook entry editor's "History" section. Story layer: linear chapter-content undo history + restore (`chapterSnapshots` table, throttled ~15min auto-checkpoints + manual named saves, "History" editor drawer), see `DECISIONS.md`'s "Chapter Content Undo/Restore (P0.2b)" entry. Separately, chapter **alternate-version tabs** also shipped (`ChapterVersionsPanel.tsx`, `DECISIONS.md`'s "Story-Layer Chapter Versioning (P0.2)" entry) — AI-regenerated or manually duplicated flat draft tabs next to the main chapter, independently editable, with a one-way "Compile to Main" action (now backed by an automatic pre-compile safety checkpoint) and an optional side-by-side compare toggle. These are two distinct features — versioning (parallel drafts) and history (linear undo) — that happen to share the same chapter editor surface

### Deployment & Access
- Docker-first approach
- Strong Tailscale / LAN support required
- Multi-machine model routing supported (e.g., 3090 for writing, Mac for scanner)

### Agent Framework & Project Memory
- Design: `docs/Agent_Framework_And_Project_Memory_Design.md` (supersedes `DECISIONS.md`'s earlier "RAG Index Freshness ... & Agent Framework Direction" section — shape kept, gaps filled)
- **Phase A — implemented.** In-process, strictly serial `agentJobs`/`jobRunner.ts` (no queue library, no worker process — single Docker container, single SQLite file): `reconcile_index` (RAG index drift detection/repair), `rag_scan_chapter`/`rag_scan_story` (dual-write adapter over the existing `ragScans`/`ragScanIssues` tables), `prune_history`. Minimal read-only status/retry surface in Settings (`RecentJobsCard`). Load-bearing implementation decisions recorded in `DECISIONS.md` under "Agent Framework — Phase A (Agent Jobs), Load-Bearing Decisions"
- **Phase B — implemented.** Factual/concrete project memory (`agentMemories`) with mandatory pending→approve lifecycle before anything is retrievable; stored as a new `agent_memory` RAG entity type (reusing `ragChunks`/`hybridSearch`, excluded from search by default unless a caller explicitly opts in via `entityTypes`). Versioned via `memoryKey` + status supersession (no separate snapshot table, unlike Codex). `distill_memory` job proposes pending rows from a scan's findings, manually enqueued only — never auto-chained after a scan. Project Memory tool/panel in the workspace sidebar (story-scoped, editor-level auth). No thematic/psychological agent pipelines — Codex remains concrete-state only. Load-bearing implementation decisions recorded in `DECISIONS.md` under "Agent Framework — Phase B (Project Persistent Memory), Load-Bearing Decisions"

### Lorebook Relationship Graph
- Design: `docs/Thin_Story_Graph_And_Lorebook_Visualization.md` — **Phase G1 implemented.** `storyGraphEdges` is the source of truth (not a metadata-only view); existing `lorebookEntries.metadata.relationships[]` data is migrated in via an idempotent, re-runnable migration and left read-only afterward
- Nodes are lorebook entries only. Edges are a 15-value concrete/factual allowlist (`knows`, `allied_with`, `opposed_to`, `member_of`, `located_in`, `owns`, `holds`, `works_at`, `related_to`, `part_of`, `caused`, `involved_in`, `mentions`, `contradicts`, `other`) — no psychological or power-dynamic types, consistent with this project's standing "keep psychological/thematic enforcement out of scope" constraint
- Story-scoped interactive graph tool ("Relationships" in the workspace sidebar) built on React Flow (`@xyflow/react`), ego view (1/2-hop neighborhood, centered on the alphabetically-first entry by default) and full-graph view, with create/edit/delete edges, search, and "Open entry" cross-tool navigation into the Lorebook tool
- On lorebook entry delete, incident edges are cascade-deleted server-side (no real FK on `fromId`/`toId` — explicit cleanup call, same pattern as the RAG-index cleanup)
- **Pending-edge review — implemented (2026-07-21, P1.2).** A third "Pending" tab (live count badge) on the Relationships tool lists `pending` edges with Approve/Reject actions (`POST /graph/edges/:id/approve`/`reject`, mirrors `agentMemories`'s approve/reject idiom); approving re-checks the active-edge conflict and returns a clean error rather than crashing. Since nothing previously produced `pending` rows, a minimal manual producer was added too: an opt-in "Propose for review" toggle on the existing "Add relationship" dialog (`source: "user"`, no new source value) — the future AI-suggestion job will write into this same lane unchanged.
- **AI-suggested edges, persisted layout, RAG reindex-on-edge-change — implemented (2026-07-22, P1.2 G1.5+, closes out P1.2 in full).** `graph_suggest_edges` job (manual-trigger only, story-wide, capped at 60 entries) proposes edges into the same `pending`/`ai_suggested` lane the review UI above already handles unchanged; owner-only "Suggest relationships" button on the Relationships toolbar. `storyGraphLayout` table persists Full-graph node positions only (ego view's ring layout is relative to whichever entry is centered, so it's excluded by design) — merges over the computed grid fallback, saves on drag-stop, "Reset layout" button clears it. Lorebook entries' RAG-indexed text now includes a `Relationships:` block from their active edges (`buildLorebookEntryText` became async), reindexed on every active-state edge transition — still not built: dashed-edge-in-canvas rendering (review stays a dedicated list tab). Load-bearing implementation decisions (library choice, source-of-truth rationale, a real query-cache invalidation gap found and fixed, plus each pass's own decisions) recorded in `DECISIONS.md` under "Lorebook Relationship Graph — Library Choice, Source-of-Truth, and Load-Bearing Decisions", "... — Pending-Edge Review UI (P1.2), Load-Bearing Decisions", and "... — G1.5+ (AI-Suggested Edges, Persisted Layout, RAG Reindex-on-Edge-Change), Load-Bearing Decisions"

### Story Timeline
- Design: `docs/Story_Timeline_Design.md` (design locked 2026-08-06) — **TL0-TL12 implemented in full (2026-08-07)**
- In-world chronology board, the time twin of Maps v2 (below): a **placement + order layer** (pins with when/order, links) plus a visual board — not Codex/chapter History, not the Story Map, not a second encyclopedia
- Schema: `storyTimelines` (spine + named ones, per-timeline `orientation`/`swimlanesEnabled`, Story-start anchor config), `storyTimelinePins` (story-scoped SoT — a pin's existence is independent of which timeline(s) show it), `storyTimelineMemberships` (join, `laneId` free-text for swimlanes). Spine is **lazy get-or-create** (`ensureSpineTimeline`, runs on first fetch) rather than hooked to story creation, so every story — new or pre-existing — gets one
- Time model: `whenKind` "relative" (`relativeOffsetYears`, 0 = at Story-start) \| "fuzzy" (`fuzzyPhrase` + drag-orderable `manualOrder`) \| "civil" (free-form date text). Sort is three strict tiers (civil group, then relative group with the Story-start marker fixed at offset 0, then fuzzy/manual-order group), not one blended scale
- Story-start defaults to Chapter One (pre-filled from the lowest-order chapter), always manually overridable to a specific pin or a freeform manual time (`StoryStartControl.tsx`), scoped per-timeline
- Multi-source "Place on timeline" (`PlaceOnTimelineButton.tsx`, one reusable component) from chapters, lorebook entries (any category), and notes; unlink-don't-destroy on source delete (mirrors Maps v2's `unlinkMapsForLocation` posture) — a pin survives with its link nulled, never silently deleted
- Story Timeline tool ("Timeline" in the workspace sidebar, peer of Maps) — a switcher (`TimelineSwitcher.tsx`) for Spine + named timelines (create/rename/delete, spine undeletable), H\|V orientation toggle per-timeline (hidden when swimlanes are on), swimlanes toggle + lane rows, Story-start marker chrome
- Multi-timeline membership: one pin, multiple `storyTimelineMemberships` rows, managed via `PinMembershipPopover.tsx` (checkbox per timeline + per-timeline lane field). A pin can never end up with zero memberships — `removeMembership` blocks removing the last one, and deleting a named timeline auto-preserves any pin exclusive to it onto Spine rather than orphaning it
- AI propose/accept (TL7): WB `timeline` template's own ` ```timeline-pin-proposal ` fence (mirrors `psych-proposal`), a JSON array per reply (multiple beats at once), native pins only (no chapter/lorebook/note links — the template isn't entry-anchored). `TimelinePinProposalCard.tsx` renders per-item Accept/Reject + Accept all; Accept reuses the existing `createPin` mutation unchanged (defaults to Spine)
- Opt-in chat chronology context (TL8): `aiChats.includeTimeline` (mirrors `includeMemory`), Spine-only, `{title, blurb, when}` per pin — never full linked bodies — surfaced as a `[STORY TIMELINE — established chronology]` labeled block, toggle lives in the same "Context & memory" chat disclosure as Notes/Outline/Memory. Its resolution logic lives in `storyTimelineService.getSpineChronologyExcerpt` — extracted out of `chatContextService.ts` once TL11A needed the identical logic too, rather than keeping two hand-synced copies
- Overview strip (TL9): `TimelineOverviewStrip.tsx` — a compact tick-per-pin strip above the board, grouped by the same 3 sort tiers, click-to-scroll via a `data-pin-id` attribute on `PinCard.tsx`. No new "era" entity/table — scoped down from the design doc's "era/overview strip" wording, out of proportion for a polish-tier slice
- Export as image (TL10): `TimelineBoard.tsx`'s `handleExportImage`, mirrors Story Map's own `toPng`/15s-timeout-race pattern (`html-to-image`, already a dependency) but simpler — a plain scrolling DOM board needs no `getNodesBounds`/`getViewportForBounds` math, just `toPng` against a ref'd container
- Scanner hook (TL11A): `includeTimeline` threaded through `runChapterScan`/`scanChapter`/`scanStory` exactly like `includeMemory` (`ragScanner.ts`), a `gatherTimelineContext` helper formats `getSpineChronologyExcerpt` into a `=== STORY TIMELINE (established chronology) ===` prompt block, both scanner system prompts get a one-line addition telling the model to weigh it for `"timeline"`-type issues (that issue type already existed). Toggle in both `ChapterScannerDrawer.tsx` and `RagScannerPanel.tsx`
- Bulk-suggest AI pin proposals (TL11B): `storyTimelinePins` gains `status`/`source` columns (mirrors `storyGraphEdges`); `timeline_suggest_pins` job mirrors `graphSuggestEdgesJob.ts` exactly — manual-trigger-only, reads a story's visible lorebook entries + notes, writes `status: "pending", source: "ai_suggested"` rows, never applied directly. New Pending tab (`PendingPinsPanel.tsx`, mirrors `PendingEdgesPanel.tsx`) + owner-gated "Suggest pins" button in `TimelineTool.tsx`; approve/reject routes mirror the Relationship Graph's own
- Guide (TL12): `story-timeline.mdx` registered in `GuideTabs.tsx` right after Locations & Maps, its natural neighbor as the time twin of Maps

---

## Technology Stack

- Base: JonSilver/TheStoryNexus (Express + SQLite + Drizzle + Lexical)
- Vector layer: sqlite-vec
- Graph visualization: React Flow (`@xyflow/react`)
- All model access via OpenAI-compatible endpoints, **except** the embedding feature's optional `"local-inprocess"` provider (runs directly in-process, no endpoint — see RAG Systems above)
- Local-first with optional LAN/Tailscale access
- `canvas` (native Cairo bindings) — used only by document-import PDF image extraction; the one deliberate exception to this project's usual native-binding-dependency avoidance, added 2026-07-17 by explicit user decision after the tradeoff was raised. `Dockerfile` installs the required system libs (`libcairo2-dev` etc.) in both build stages — see `DECISIONS.md`'s "Document Import" entry
- `onnxruntime-node` (via `@huggingface/transformers`, local in-process embeddings) — ships **prebuilt** native binaries (no compile step, unlike `canvas`), same lighter risk class as `sqlite-vec`'s own prebuilt binary. Needs `libgomp1` installed at runtime (Dockerfile, both stages) — see `DECISIONS.md`'s "Local In-Process Embeddings" entry

---

## Current Phase

**Foundation (original Phase 0) and P0/P1 are complete; a long tail of P2/P3 items have also shipped.** For exactly what's done and what's left, don't rely on this file's memory of it — read:

- **`docs/CURRENT_BACKLOG.md`** ← source of truth for *what's left* and current priority
- **`DECISIONS.md`** ← why/how of each shipped change, load-bearing implementation decisions

Both are kept current every session. Trust them over this section if they ever disagree.

---

## Important Constraints

- All Codex changes must be non-destructive with history
- AI edits in Codex require user approval
- Keep psychological/thematic enforcement out of scope
- Support remote access via Tailscale from work PC

---

## Instructions for Claude Code

- Always read this file first when starting work
- Follow the architectural decisions above
- Ask Hermes (via the user) before making major architectural changes
- Prioritize clean, maintainable code over cleverness
- Document any new decisions in this file or a separate `DECISIONS.md`

---

*This file is the single source of truth for the project.*