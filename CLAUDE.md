# CLAUDE.md — Story Nexus Fork

**Project:** The Story Nexus Fork  
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
- Codex state (wardrobe/appearance/wounds/items) is user-typed or chat-proposed (Approve/Reject; "Edit First" exists server-side but has no UI yet) — **not** auto-compiled from the manuscript today; that's tracked as backlog item P0.3/C5, deliberately not built yet (see `DECISIONS.md`'s "Lorebook Entry Editor — Natural View" entry)
- Entry editor has a "Natural View" toggle (Advanced Settings, default on) that presents an entry as an editable prose character profile instead of the raw field form, hiding tags — same underlying form data either way

### Chat System
- Five main contexts, each its own `chatType` with its own chat list:
  - World-Building Chats (multiple focused chats with templates)
  - Research Chat (web research desk; Story mode default + Global mode toggle, P0.4 S0, see `DECISIONS.md`)
  - Main Editor Chat (writing-focused)
  - Outline Chat (structure-focused; own chat list — **not** a WB template anymore, split out P0.4 R5/R7, see `DECISIONS.md`)
  - Brainstorm Chat (project intake/orientation hub; own chat list — migrated off a separate parallel stack onto this shared one in P0.4 B0-B4, see `DECISIONS.md`)
- All Codex modifications require explicit user approval (Approve / Reject / Edit First)
- Per-chat saved prompts supported
- **Brainstorm** (P0.4 B0-B4, **implemented**) — intake/orientation hub, not a structure desk or lore factory. Composer blurb + Guided Setup button + Light/Standard/Grill-me style dropdown (prompt-driven depth, not a tracked interview state machine — confirmed with user); opt-in toggles for Notes/Outline/Memory/Lorebook/Chapter Summaries (Lorebook defaults OFF here, unlike every other chat type). Writes only through two fences — `overview-proposal` (synopsis/overview note/opt-in memory) and `handoff-packet` (Outline/WB/Notes/Research, multiple per reply) — never direct Codex/outline/prose writes. Durable tray (`brainstormChecklist` table): Open/Send/Accept perform the real write but stay in the Active queue, only "Mark done" moves an item to Done. Separate `brainstormSlots` table backs a fixed 5-slot known/unknown project-setup checklist.
- **WB + Outline guided-start, Character psych module** (P0.4 B5, **implemented**) — same Guided Setup shell (`src/features/chat/components/GuidedSetupControl.tsx`, generalized from Brainstorm's) extended to World-Building and Outline chats, each with their own style-hint text and `aiChats.wbStyle`/`outlineStyle` column. WB's Character template additionally gets an opt-in psych module toggle (MBTI + Enneagram + freeform blurb) — a `psych-proposal` fence, ephemeral accept/reject card, Accept merges into the anchor entry's `metadata.psychProfile` via the existing generic lorebook update route. Deliberately **not** Codex state and never routed through `codexPendingChanges`/`codexSnapshots` — stays a "writing aid only," never scanner-enforced, consistent with Character Codex's concrete-state-only scope above. `PsychProfilePanel.tsx` in the Lorebook entry editor renders it read-only; no manual edit form (chat propose→accept is the only write path). The S/K tracks are still open — see `docs/CURRENT_BACKLOG.md`.
- **Auto-insert / auto-accept toggles** (P0.4 R6, **implemented**) — per-chat, per-doctrine "no silent canon unless an explicit toggle is ON," default OFF (`aiChats.autoInsertProse`/`autoAcceptCodex`/`autoAcceptOutline`). Auto-insert prose is Editor-only; auto-accept Codex applies to Editor/WB/Outline; auto-accept outline (create/edit/reorder, never delete) is Outline-only. Toggle row lives in the shared `ChatInterface.tsx`; Codex auto-accept chains onto the existing proposal-creation success callback in `useChatMessageGeneration.ts`.
- **Research web desk** (P0.4 S0-S5, **implemented**) — `src/components/workspace/tools/ResearchTool.tsx`. Story mode (default, light story seasoning via title+synopsis, opt-in Notes/Lorebook) vs. Global mode (pure web, not story-bound) — each is a single-chat identity, no chat list. Live web search + page fetch via DuckDuckGo HTML scraping (`server/services/webSearchService.ts`, no API key — explicit user choice), query-driven (fires on the user's actual message text via a new `explicitQuery`/`extraContext` path, never the mount-time context fetch) rather than a static per-chat toggle like Notes/Memory. `aiChats.webSearchEnabled` (default **true**, the desk's core job) is just an off-switch. Citations render via existing markdown link rendering. Own dedicated `RESEARCH_FRAMING` system prompt (`chatContextService.ts`) — fixed a real pre-existing bug where Research silently fell through to `WORLDBUILDING_FRAMING` and could propose Codex entries, violating the "no Codex/outline/prose writes" rule.

### RAG Systems
- Vector RAG uses sqlite-vec (hybrid FTS5 + vector)
- RAG Scanner focuses on factual + concrete state consistency
- **Per-feature endpoint selection** required (writing model and scanner model can run on different machines)

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
- Explicitly not built this pass: AI edge suggestions, saved/persisted node layout, and a pending-edge approve/reject review UI (the `status` column exists for this without a schema change later, but nothing produces non-`active` rows yet). Load-bearing implementation decisions (library choice, source-of-truth rationale, a real query-cache invalidation gap found and fixed) recorded in `DECISIONS.md` under "Lorebook Relationship Graph — Library Choice, Source-of-Truth, and Load-Bearing Decisions"

---

## Technology Stack

- Base: JonSilver/TheStoryNexus (Express + SQLite + Drizzle + Lexical)
- Vector layer: sqlite-vec
- Graph visualization: React Flow (`@xyflow/react`)
- All model access via OpenAI-compatible endpoints
- Local-first with optional LAN/Tailscale access
- `canvas` (native Cairo bindings) — used only by document-import PDF image extraction; the one deliberate exception to this project's usual native-binding-dependency avoidance, added 2026-07-17 by explicit user decision after the tradeoff was raised. `Dockerfile` installs the required system libs (`libcairo2-dev` etc.) in both build stages — see `DECISIONS.md`'s "Document Import" entry

---

## Current Phase

**Foundation (original Phase 0) is largely complete.** Remaining work and priority live in:

**`docs/CURRENT_BACKLOG.md`** ← source of truth for *what’s left* (use this when the old 1–11 list disagrees with reality).

### Done (high level)
1. Fork + Docker + basic login  
2. Character Codex (dynamic state + history)  
3. Per-feature endpoint selection  
4. Vector RAG (sqlite-vec)  
5. RAG Scanner backend + job-wrapped scans + frontend (editor drawer + story-wide tool) — **done**  
6. World-Building Chat system  
7. Main Editor integration + MultiView / beats / outline / focus sessions  
8. Dashboard + tab system + persistence  
9. Project Saves — **Codex layer done**; **Story layer done** (chapter undo/restore); chapter **alternate-version tabs done** too (AI/manual drafts, compile, compare — a separate feature from linear history, both now shipped)  
10. Agent Framework — **Phase A + B done**; Phase C not started  
11. Lorebook Relationship Graph — **Phase G1 done**; AI edges / saved layout / pending UI not started  

### Next (see backlog for detail)
1. **P0.3 done** (2026-07-20) — continuity glue (memory ↔ chat/scan) fully shipped: Notes/Outline bridge, project memory chat toggle, save-as-note/note-proposal, scanner-memory integration, unattended scan schedule, Codex auto-compile
2. **P0.4 R0-R8 + B0-B5 + S0-S5 done** (2026-07-20/21) — Editor selection rework + Codex tray (R0-R3); Lorebook field rework → WB chat, dedicated Outline chat with its own `chatType` (R4/R5/R7), outline row rework + "Open in WB" lore-suggestion handoff (R8); auto-insert/auto-accept toggles per host (R6); Brainstorm Hub migrated onto the shared chat stack with Guided Setup, depth-adaptive propose, and a durable handoff/checklist tray (B0-B4); WB + Outline guided-start extended with the same shell, plus WB's Character psych module (B5); Research web desk — Story/Global mode, live DuckDuckGo web search + page fetch, citations, dedicated system prompt (S0-S5). Remaining: the Notes-desk (K) track; Chat Shuttle (H0-H7, design-locked, its S0-S2 prerequisite is now satisfied)
3. P1 polish (Agent C, Graph G1.5) and P2 bugs as needed

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