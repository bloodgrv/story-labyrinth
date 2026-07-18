# Story Nexus Fork — Current Backlog

**Last updated:** 2026-07-18  
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

Design docs that still say “not implemented” in their headers may be stale for A/B/G1 — trust this file + `CLAUDE.md` over those headers until they are refreshed.

---

## Recommended build order (from here)

```
1. Chapter content undo/restore (P0.2b, the real "Project Saves" gap) ← P0
2. Continuity glue (memory ↔ chat/scan)                                ← P0/P1
3. Graph G1.5 / Agent C only if daily pain                             ← P1
4. Bugfix pass                                                       ← P2 (anytime)
5. Nice-to-haves                                                       ← P3
```

---

## P0 — High leverage / incomplete core claims

### P0.1 — RAG Scanner frontend — ✅ Done (2026-07-18)

Editor right-rail drawer (`EditorToolsPanel.tsx`'s `"ragScanner"` drawer, chapter-scoped) and a story-wide "Scanner" sidebar tool (`RagScannerPanel.tsx`) both shipped — trigger via `POST /api/agent/jobs` (owner-only, per user decision), progress via job polling, issues list with Open/Resolved/Dismissed tabs bound to `ragScanIssues`. Not built this pass, still open if revisited: inline highlights in chapter text, full dual-write retirement of `ragScans`, auto-chaining `distill_memory`. See `DECISIONS.md` "RAG Scanner Frontend (P0.1) — Load-Bearing Decisions".

---

### P0.2 — Chapter alternate-version tabs — ✅ Done (2026-07-18), but read the note below

**This shipped a different feature than this item originally described**, per direct user correction mid-build: not linear chapter-content history/undo, but chat-branching-style alternate drafts — flat tabs next to the main chapter (`ChapterVersionsPanel.tsx`), created via AI regenerate (`GenerateVersionDialog.tsx`, new `chapter_version` feature endpoint) or manual duplicate, each independently editable (`VersionEditor.tsx`, its own autosave), with an optional side-by-side compare toggle and a one-way "Compile to Main" action. `chapterVersions` table, `server/routes/chapters.ts`'s `/versions` sub-routes. See `DECISIONS.md` "Story-Layer Chapter Versioning (P0.2) — Load-Bearing Decisions" for the full scoping trail and load-bearing choices.

**⚠️ The original problem this item was written to solve is still open**: chapters still have **zero linear undo history** and the main chapter's own autosave is still **fully destructive** (~1s debounce, no snapshots, no restore path) — nothing about the alternate-version-tabs feature above touches that. Compile itself is a new one-way, un-backed-up overwrite of `chapters.content`, which if anything adds one more way to lose the previous state, not fewer. If chapter-level undo/restore (mirroring the Codex snapshot/restore precedent) is still wanted, it needs to be scoped and built as a genuinely separate item — see the new backlog entry below.

**Refs:** `CLAUDE.md` Project Saves; `DECISIONS.md` "Project Saves — Phase 1 (Codex Layer…)" and "Story-Layer Chapter Versioning (P0.2)"

---

### P0.2b — Chapter content undo/restore (NEW — the original P0.2 problem, still unsolved)

**Status:** Not started  
**Why:** Split out from P0.2 above after that item's scope turned out to mean something else entirely (alternate drafts, not history). The original problem — chapters have zero version history and a destructive ~1s autosave, no restore path — is exactly as unsolved as it was before this session.

**Should include (scope with user before coding if ambiguous):**

- Non-destructive chapter content history (snapshots and/or versions), most likely mirroring the Codex `codexSnapshots`/restore precedent (`DECISIONS.md` "Project Saves — Phase 1")
- Restore path usable from the editor
- Clear rules vs the current ~1s autosave (when to snapshot, retention/pruning policy, manual named saves) — full-content Lexical JSON snapshots are considerably heavier than Codex's structured-field snapshots (measured ~18 bytes/word in this project's demo content), so a naive per-autosave snapshot policy needs real coalescing, not a direct copy of the Codex approach
- Decide how (or whether) this interacts with the new Compile action from P0.2 above, which is currently a real one-way overwrite with no backup

**Do not** conflate with full git-like branching unless explicitly requested (the backlog previously referenced a `2026-06-26_Versioning_Branching_Design.md` doc for this — confirmed during P0.2's work that **no such file exists in the repo**; there is no prior design to reconcile against, this would be scoped fresh).

**Refs:** `CLAUDE.md` Project Saves; `DECISIONS.md` "Project Saves — Phase 1 (Codex Layer…)" and "Story-Layer Chapter Versioning (P0.2)" (for what NOT to re-derive — the alternate-drafts data model is unrelated)

---

### P0.3 — Continuity glue (memory + scanner + writing loop)

**Status:** Not started (pieces exist in isolation)  
**Why:** Project memory, graph, and scanner backend don’t yet form a daily continuity loop.

**Small, high-value slices (any order):**

| Slice | Description |
|-------|-------------|
| C1 | Opt-in **“Include project memory”** for chat / context (`entityTypes` includes `agent_memory`) |
| C2 | **“Suggest memories from this scan”** button → enqueue `distill_memory` (manual only; no silent auto-chain) |
| C3 | Scanner context may **read active** `agent_memory` when opted in (factual contradiction checks) |
| C4 | Optional: per-story **unattended** `rag_scan_story` schedule toggle (default OFF) |
| C5 | **Codex auto-compile from manuscript.** Not started — raised 2026-07-17. Today, Codex state (wardrobe/appearance/wounds/items) is either hand-typed in `CodexStateEditor.tsx`, or proposed conversationally by the World-Building Chat (`codex-proposal` fenced JSON → `codexPendingChange` → Approve/Reject, see `chatCodexService.ts`) — nothing scans manuscript chapters and proposes Codex updates unprompted. User wants this closer to *automatic*, agent-driven — "the agent should be compiling that as we go along, not the user." This is a bigger lift than C1–C4: needs a new job type (no `codex`-scanning job exists in `jobRunner.ts` today, unlike `distill_memory`/`rag_scan_*`), and a real decision on how far to push automation given the standing "no silent auto-chain, always manual-trigger + approve" precedent from Phase B (`DECISIONS.md`). Recommend shaping this the same way as C2 (manual "Suggest Codex updates from this scan/chapter" button → pending proposals through the *existing* approve/reject/edit-first pipeline) rather than a fully silent background job, unless the user explicitly wants to revisit the no-auto-chain precedent. Also note while investigating: `useReviseProposalMutation`/`reviseChatProposal` ("Edit First") already exist server-side for the *existing* chat-proposal pipeline but have no UI button anywhere (`ProposalCard.tsx` only wires Approve/Reject) — worth wiring up regardless of C5's automation scope. |

**Refs:** Agent design Phase C; `DECISIONS.md` Phase B (no auto-distill; no suggest UI yet)

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

---

## P3 — Nice-to-haves / old roadmap (not current foundation)

| Item | Notes |
|------|--------|
| Name generator | Design: Hermes `Name_Generator_Design.md` / skill reference |
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
Read CLAUDE.md, docs/CURRENT_BACKLOG.md, and DECISIONS.md "Project Saves — Phase 1" and
"Story-Layer Chapter Versioning (P0.2)".
Implement P0.2b: chapter content undo/restore. This is NOT the alternate-draft-tabs feature
P0.2 already shipped (ChapterVersionsPanel.tsx / chapterVersions table) — that's a separate,
unrelated data model. This is linear history for the main chapter's own content, most likely
mirroring the Codex codexSnapshots/restore precedent.
Scope with non-destructive history + restore usable from the editor; define interaction with
current ~1s autosave (coalescing/retention — full Lexical JSON snapshots are heavy) and with the
existing one-way Compile action from P0.2.
Do not build full git branching. Record decisions in DECISIONS.md; update CURRENT_BACKLOG.md when done.
```

---

## Document map

| Doc | Role |
|-----|------|
| `CLAUDE.md` | Architecture + constraints + high-level done flags |
| `DECISIONS.md` | Why/how of each shipped change |
| `docs/CURRENT_BACKLOG.md` | **This file** — remaining work + priority |
| `docs/Agent_Framework_And_Project_Memory_Design.md` | Agent A/B design (A/B shipped; C backlog) |
| `docs/Thin_Story_Graph_And_Lorebook_Visualization.md` | Graph design (G1 shipped; G1.5+ backlog) |
| Hermes `.hermes/plans/*` | Historical designs; may be stale vs CLAUDE |

---

*Update this file whenever a P0/P1 item ships or priority changes.*
