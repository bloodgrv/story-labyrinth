# Story Nexus Fork — Current Backlog

**Last updated:** 2026-07-16  
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

Design docs that still say “not implemented” in their headers may be stale for A/B/G1 — trust this file + `CLAUDE.md` over those headers until they are refreshed.

---

## Recommended build order (from here)

```
1. RAG Scanner UI                          ← P0
2. Story-layer Project Saves (chapters)    ← P0
3. Continuity glue (memory ↔ chat/scan)    ← P0/P1
4. Graph G1.5 / Agent C only if daily pain ← P1
5. Bugfix pass                           ← P2 (anytime)
6. Nice-to-haves                           ← P3
```

---

## P0 — High leverage / incomplete core claims

### P0.1 — RAG Scanner frontend

**Status:** Not started  
**Why:** Backend + agent jobs can run scans; **nothing in `src/`** consumes scan/issues APIs. `CLAUDE.md` still describes a collapsible right rail + inline highlights — that UX was never built. Old guardrail (“don’t build a throwaway manual scan button before agent framework”) is **lifted**: jobs own execution now.

**Should include:**

- Enqueue `rag_scan_chapter` / `rag_scan_story` via existing job API (or thin wrappers)
- Progress surface (job +/or `ragScans` poll)
- Issues list (open / dismiss / resolve) bound to `ragScanIssues`
- Placement: editor right rail and/or story tool (match CLAUDE intent where practical)
- Optional later: inline highlights in chapter text

**Out of scope for first UI slice:** full dual-write retirement of `ragScans`; auto-chain `distill_memory` after every scan.

**Refs:** `DECISIONS.md` (RAG Scanner; Agent Phase A); `docs/Agent_Framework_And_Project_Memory_Design.md`

---

### P0.2 — Project Saves — Story layer (chapter versioning)

**Status:** Not started  
**Why:** Codex layer is done. Chapters still have **zero version history** and **destructive autosave** — the largest remaining half of “Project Saves.”

**Should include (scope with user before coding if ambiguous):**

- Non-destructive chapter content history (snapshots and/or versions)
- Restore / compare path usable from the editor
- Clear rules vs current ~1s autosave (when snapshot, retention, manual named saves)

**Do not** conflate with full git-like branching unless explicitly requested (`2026-06-26_Versioning_Branching_Design.md` is a separate, larger design).

**Refs:** `CLAUDE.md` Project Saves; `DECISIONS.md` “Project Saves — Phase 1 (Codex Layer…)”

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
Read CLAUDE.md and docs/CURRENT_BACKLOG.md.

Implement the next P0 item only: P0.1 RAG Scanner frontend.
- Use existing agent job APIs for rag_scan_chapter / rag_scan_story (do not invent a parallel scan runner).
- Surface progress + ragScanIssues (list, dismiss/resolve).
- Prefer editor right rail and/or story-scoped tool per CLAUDE.md UX intent.
- Do not auto-chain distill_memory. Do not build dual-write retirement.
- Record load-bearing UI/API choices in DECISIONS.md. Update CURRENT_BACKLOG.md when done.
```

For chapter versioning instead:

```text
Read CLAUDE.md, docs/CURRENT_BACKLOG.md, and DECISIONS.md Project Saves — Phase 1.
Implement P0.2 Story-layer chapter versioning only.
Scope with non-destructive history + restore usable from the editor; define interaction with current autosave.
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
