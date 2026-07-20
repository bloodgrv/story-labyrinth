# Story Nexus Fork — Current Backlog

**Last updated:** 2026-07-19 (locations/maps design locked)  
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

**Status:** Notes/Outline bridge "Core Bridge" scope (N0-N4, O1-O4) — ✅ Done (2026-07-20). C1 (project memory chat toggle) — ✅ Done (2026-07-20). C2-C5 and N5/N6 (save-as-note, note-proposal chat UX) — Not started.  
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
| N5 | Manual “Save message/selection as note” — not started |
| N6 | AI `note-proposal` → accept/reject card — not started |
| O1–O4 | ✅ Same double-gate pattern for outline items |

**Inclusion doctrine:** per-item AI flag AND per-chat toggle, both default OFF; Editor never gets these toggles.

#### Existing memory/scanner slices (any order)

| Slice | Description |
|-------|-------------|
| C1 | ✅ Opt-in **“Include project memory”** for chat / context (`entityTypes` includes `agent_memory`) |
| C2 | **“Suggest memories from this scan”** button → enqueue `distill_memory` (manual only; no silent auto-chain) |
| C3 | Scanner context may **read active** `agent_memory` when opted in (factual contradiction checks) |
| C4 | Optional: per-story **unattended** `rag_scan_story` schedule toggle (default OFF) |
| C5 | **Codex auto-compile from manuscript.** Not started — raised 2026-07-17. Today, Codex state (wardrobe/appearance/wounds/items) is either hand-typed in `CodexStateEditor.tsx`, or proposed conversationally by the World-Building Chat (`codex-proposal` fenced JSON → `codexPendingChange` → Approve/Reject, see `chatCodexService.ts`) — nothing scans manuscript chapters and proposes Codex updates unprompted. User wants this closer to *automatic*, agent-driven — "the agent should be compiling that as we go along, not the user." This is a bigger lift than C1–C4: needs a new job type (no `codex`-scanning job exists in `jobRunner.ts` today, unlike `distill_memory`/`rag_scan_*`), and a real decision on how far to push automation given the standing "no silent auto-chain, always manual-trigger + approve" precedent from Phase B (`DECISIONS.md`). Recommend shaping this the same way as C2 (manual "Suggest Codex updates from this scan/chapter" button → pending proposals through the *existing* approve/reject/edit-first pipeline) rather than a fully silent background job, unless the user explicitly wants to revisit the no-auto-chain precedent. Also note while investigating: `useReviseProposalMutation`/`reviseChatProposal` ("Edit First") already exist server-side for the *existing* chat-proposal pipeline but have no UI button anywhere (`ProposalCard.tsx` only wires Approve/Reject) — worth wiring up regardless of C5's automation scope. |

**Refs:** `docs/Notes_Outline_Chat_Bridges_Design.md`; `docs/Chat_Panel_Integrations_Design.md`; Agent design Phase C; `DECISIONS.md` Phase B (no auto-distill; no suggest UI yet)

---

### P0.4 — Chat ↔ panel integrations (selection rework + host chats)

**Status:** R0-R3 — ✅ Done (2026-07-20). Design locked for WB + Editor + Outline + Brainstorm + Research + Notes desk + generalized pattern (2026-07-18); R4 onward **not implemented**  
**Canonical design:** `docs/Chat_Panel_Integrations_Design.md`

**Doctrine:** Panel owns artifact; **chat governs** content; selection/focus owns span; Accept applies; no amnesiac one-shot as primary path.

**R0-R3 shipped 2026-07-20** — see `DECISIONS.md` "Editor Selection Rework + Codex Proposal Tray (P0.4 R0-R3)" for the full load-bearing trail, including a real correctness bug fixed in `activeChapterEditorStore.ts` (single global slot → per-chapter map) and a second pre-existing bug found and fixed in `useCreateChatMutation`/`useUpdateChatMutation`'s cache invalidation (was invalidating a key that never matched any real query). Full live Accept round-trip (real LLM reply → replace selection) could not be exercised in this dev environment — the configured AI provider returned zero content tokens for reasons unrelated to this feature's code (see that DECISIONS.md entry) — every other piece (capture, chat binding, context delivery, tray) was verified live. `chatType` split (R6-R7) deliberately deferred — neither R0-R3 nor R4/R5/R8 strictly require it.

| Slice | Description |
|-------|-------------|
| R0 | ✅ Shared FocusTarget / FocusPacket / ReworkCard shell (`src/types/rework.ts`, `src/features/rework/`) |
| R1 | ✅ **Editor:** highlight → Rework card → Editor chat (before/after/selection + full editor context) → Accept **replaces selection** |
| R2 | ✅ Buried primary floating one-shot Expand/Rewrite/Shorten behind "More"; now chips that send instructions into host chat |
| R3 | ✅ Editor Codex **tray under chat list** (this chat only, `CodexProposalTray.tsx`); Edit-before-approve wired (`useReviseProposalMutation`, previously unused); auto-accept still default OFF (unchanged — no auto-accept toggle added this pass) |
| R4 | **Lorebook:** field/selection rework → **WB chat** → targeted codex/description proposal |
| R5 | **Outline chat:** own type/rail; context pack per design §4; outline proposals (create/edit/reorder/delete) + auto-accept OFF; **retire bulk Generate button**; tray + tree badges; Codex tray; note-proposal tray; lore suggestion list |
| R6 | Auto-insert (prose) / auto-accept (Codex/outline) toggles per host, defaults OFF |
| R7 | Split `chatType` **editor** vs **outline** (separate chat lists) |
| R8 | Outline→WB handoff: tray **Open in WB** from lore suggestion cards |
| B0–B4 | **Brainstorm hub:** migrate; CTA+blurb+Guided setup+style dropdown; playbook/slots; depth-adaptive writes; durable tray checklist (**Mark done** only clears active); handoffs Outline/WB/Notes/Research opt-in |
| B5 | WB/Outline domain playbooks (shared engine); **guided start = Brainstorm pattern**; character **psych module** (MBTI/Enneagram/blurb, Grill default on); locations per Locations_And_Maps |
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
P0.1, P0.2, P0.2b, P0.3's Notes/Outline "Core Bridge" (N0-N4, O1-O4), P0.3's C1 (project memory
chat toggle), and P0.4's R0-R3 (Editor selection rework + Codex proposal tray) are all done.
Remaining work: P0.3's N5/N6 (save-as-note, note-proposal chat UX) and C2-C5 (scanner-memory
integration, distill-from-scan button, scheduled scans, Codex auto-compile); P0.4's R4 onward
(Lorebook/Outline rework, Brainstorm playbook migration, Research web search, Notes desk polish,
the Editor/Outline chatType split) — any order, pick the highest-value one first unless the user
redirects.
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
