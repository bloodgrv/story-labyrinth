# Agent Framework & Project Persistent Memory — Design Spec

**Project:** Story Nexus Fork (`E:\StoryNexus-Fork`)  
**Status:** Design only — not implemented  
**Audience:** Claude Code (implementation) + Hermes (architecture)  
**Date:** 2026-07-16  
**Supersedes / realigns:**
- `DECISIONS.md` § “RAG Index Freshness … & Agent Framework Direction” (shape kept; load-bearing gaps filled here)
- Hermes plan `Project_Persistent_Memory_Design_v2.md` (vision kept; psych/thematic scope dropped; infra mapped to this codebase)

**Related:**
- `CLAUDE.md` — Agent Framework (Planned), concrete Codex only, strong user control
- `DECISIONS.md` — ragScans pattern, RAG index freshness, codex pending approval
- Existing code: `server/services/ragScanner.ts`, `ragScanRepository.ts`, `ragRepository.ts`, `ragIndexService.ts`, `aiClientFactory.ts` (`buildClientForFeature`)

---

## 0. How to use this document

1. Read this whole file before writing schema or `jobRunner.ts`.
2. Implement **Phase A before Phase B**. Do not ship `agent_memory` writes without the control surface in Phase B.
3. Record any deviation in `DECISIONS.md` with rationale.
4. Do **not** build a manual “Run RAG Scan” UI that background jobs will obsolete (already a recorded guardrail).
5. Stay inside project constraints: single Docker container, one SQLite file, no new queue library / worker process, reuse existing patterns.

---

## 1. Goals

### 1.1 Agent Framework (operational layer)

A durable background job system that:

- Keeps the RAG index fresh (reconcile missing/stale chunks; support delete cleanup)
- Runs RAG scanners without requiring a throwaway manual-trigger UI
- Does light DB housekeeping
- Survives process restart (unlike today’s fire-and-forget `scanStory` IIFE)
- Surfaces status, progress, and failures to the user (not only server logs)

### 1.2 Project Persistent Memory (cognitive layer)

A living, **factual / concrete** project memory that:

- Evolves with the novel via propose → human approve → versioned store
- Is available to assistants/scanners **only when opted in**
- Never silently replaces Codex or bleeds into writing context by default
- Does **not** model psychology, corruption arcs, power dynamics, or themes as system-enforced state (out of scope per `CLAUDE.md`)

### 1.3 Non-goals (explicit)

| Out of scope | Why |
|--------------|-----|
| LangGraph / CrewAI / multi-agent orchestration frameworks | Wrong fit for single-container SQLite app; overkill for v1 |
| Thematic / psychological / relationship-power agent roles | Removed from project scope |
| Parallel vector store for memory | Reuse `ragChunks` + hybrid search |
| External Redis/Bull/cron daemon | Not in stack; adds ops surface |
| Silent auto-activation of agent memory into all prompts | Violates strong user control |
| Manual scan trigger UI before job runner exists | Guardrail in `DECISIONS.md` |

---

## 2. Architecture overview

```
                    ┌──────────────────────────────────────┐
                    │  Event enqueue          Schedule tick │
                    │  (CRUD / save / approve)  (setInterval)│
                    └──────────────────┬───────────────────┘
                                       │ inserts queued rows
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  agentJobs  +  jobRunner.ts (in-process, serial)                 │
│  jobTypes: reconcile_index | rag_scan_* | prune_history | …      │
│  claim → run → complete/fail | crash requeue with maxAttempts    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Phase B only
                               │ distill_memory → pending proposals
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  agentMemories (metadata + approval lifecycle)                   │
│  pending → active (user approve) | rejected | superseded         │
│  on approve → index as ragChunks entityType = "agent_memory"     │
└──────────────────────────────┬───────────────────────────────────┘
                               │ hybridSearch with entityType filter
                               │ default: lorebook_entry + chapter only
                               │ opt-in: include agent_memory
                               ▼
                    Chat / Scanner / Writing context
```

**Principle:** jobs are the rails; memory is cargo that only rides after human approval (same mental model as Codex pending changes and Concrete Beats pending status).

---

## 3. Phase A — Agent jobs (implement first)

### 3.1 `agentJobs` table

Generalize the `ragScans` precedent (`status`, progress fields, story scope, polling). Prefer **one** jobs table rather than proliferating one-off job tables.

Suggested columns (names can match project conventions):

| Column | Type | Notes |
|--------|------|--------|
| `id` | text PK | UUID |
| `jobType` | text | See §3.3 |
| `status` | text | `queued` \| `running` \| `completed` \| `failed` |
| `storyId` | text nullable | FK stories; null = global/housekeeping |
| `entityId` | text nullable | chapter/lorebook/memory id when scoped |
| `payload` | json | job-specific input |
| `result` | json nullable | job-specific output summary |
| `progress` | json nullable | e.g. `{ processed, total, message }` |
| `attempts` | int | default 0 |
| `maxAttempts` | int | default **3** |
| `error` | text nullable | last error message |
| `createdAt` | timestamp | |
| `queuedAt` | timestamp | |
| `startedAt` | timestamp nullable | |
| `completedAt` | timestamp nullable | |
| `lastAttemptAt` | timestamp nullable | |

Indexes: `(status)`, `(storyId)`, `(jobType, status)`, optional composite for dedup (see §3.4).

**Migration note:** Existing `ragScans` / `ragScanIssues` can remain for a transition period. Options:

1. **Dual-write / adapter (recommended short-term):** new story scans create an `agentJobs` row *and* keep writing `ragScans`/`ragScanIssues` until UI/API consumers move over; or  
2. **Job-owned scans:** `jobType: rag_scan_story` stores scan progress on the job; issues stay in `ragScanIssues` with `scanId` or `jobId` FK.

Pick one approach in implementation and document it in `DECISIONS.md`. Prefer minimal breakage of existing scan APIs.

### 3.2 `jobRunner.ts` (in-process)

**No** queue library, `worker_threads`, or second process.

On server boot (alongside Express):

```
jobRunner.start()
  → setInterval(tick, ~1000–5000ms)   // claim + run
  → setInterval(schedule, ~60s)       // enqueue due periodic jobs
```

**Claim:** atomic status flip `queued → running` where `status = 'queued'`, increment `attempts`, set `startedAt` / `lastAttemptAt`. SQLite single-writer makes a careful `UPDATE … WHERE status = 'queued'` sufficient if done in one statement.

**Crash recovery (on start):** any row left `running`:

- if `attempts < maxAttempts` → set `queued` (requeue)
- else → set `failed` with error like `Exceeded maxAttempts after crash/restart`

**Deterministic crash loop prevention:** same rule — exhausted attempts stay `failed`; never requeue forever.

**User Retry API:** set `status = queued`, reset `attempts = 0`, clear or preserve `error` (prefer clear).

### 3.3 Concurrency — strictly serial (v1)

- Process at most **one** `running` job at a time in the runner.
- Rationale: SQLite write contention; long story scans must not race lorebook/index writers carelessly; matches current simplicity of `scanStory`.

**Dedup:** at most one active (`queued` | `running`) job per `(jobType, storyId, entityId)` (treat nulls as a single sentinel in uniqueness logic). New enqueue of the same key while active is a no-op or replaces payload only if explicitly designed — default **no-op**.

### 3.4 Job types (v1)

| `jobType` | Enqueue source | Purpose |
|-----------|----------------|---------|
| `reconcile_index` | schedule tick (+ optional after bulk ops) | Find missing/stale RAG rows; reindex or remove orphans (incl. lorebook delete gap) |
| `rag_scan_chapter` | event or schedule | Chapter factual scan (reuse `ragScanner` logic) |
| `rag_scan_story` | schedule **if opt-in** + future UI/API enqueue | Story-wide scan with progress |
| `prune_history` | schedule | Light cleanup (old failed jobs, expired temp data — define narrow rules) |
| `distill_memory` | **Phase B only** | After scan (or explicit request): propose memory rows |

**Unattended story scan policy:** default **OFF** per story (or global). Background LLM spend must not surprise the user. When off, only explicit enqueue (future controlled surface / API) runs scans.

### 3.5 Scheduling (enqueue is required, not optional design)

Two paths:

1. **Event-driven:** call sites insert `queued` jobs (e.g. after operations that need reconcile; optional post-approve hooks). Prefer durable job rows over pure fire-and-forget for anything that must survive restart.
2. **Periodic `schedule` tick:** every ~60s, for each enabled periodic job type + scope, if last successful completion older than cadence **and** no active row for that key → insert `queued`.

Suggested default cadences (tunable constants, not magic UI yet):

| Job | Cadence |
|-----|---------|
| `reconcile_index` | every 15 minutes per active story (or all stories if cheap) |
| `rag_scan_story` | only if story setting enabled; e.g. daily |
| `prune_history` | daily |

### 3.6 Retry / failure policy

- Default `maxAttempts = 3`
- On handler throw: if attempts remaining → `queued` (or immediate requeue with backoff later); else → `failed` + `error`
- Handler must be **as idempotent as practical** (especially `reconcile_index`)
- Never infinite requeue on process-killing bugs

### 3.7 Status / failure API (required in Phase A)

Generalize the existing scan polling pattern:

| Route | Purpose |
|-------|---------|
| `GET /api/agent/jobs/:id` | status, progress, error, attempts, result |
| `GET /api/agent/jobs?storyId=&status=&jobType=` | list |
| `POST /api/agent/jobs/:id/retry` | user retry failed job |
| Optional `POST /api/agent/jobs` | enqueue allowed types (auth-protected; used by schedule/events more than users at first) |

**UI (minimal Phase A):** enough to see recent jobs + errors (dashboard strip, story tools, or Settings). Jobs must not fail only in logs.

### 3.8 FeatureKeys

When a job calls models, route via existing `buildClientForFeature`:

- Reuse `rag_scanner` / `embedding` where appropriate
- Add new keys only if behavior differs (e.g. `agent_memory_distill` in Phase B)

No new client factory mechanism.

### 3.9 Phase A acceptance criteria

- [ ] `agentJobs` migrated; runner starts with server
- [ ] Serial claim + crash recovery + maxAttempts work (test by killing mid-job)
- [ ] At least `reconcile_index` works and addresses orphaned chunks / missing index cases where feasible
- [ ] Story scan can run as a job (or adapter) with pollable progress
- [ ] Job list/detail API returns failures visibly
- [ ] No manual scan UI required for backend completeness
- [ ] `tsc` + oxlint clean on touched files
- [ ] Decision notes appended to `DECISIONS.md` for any schema choice that differs from this doc

---

## 4. Phase B — Project Persistent Memory

### 4.1 Design intent (from v2, realigned)

Keep from the July 2026 memory vision:

- Project-level living memory (not only static lorebook tags)
- Agents/jobs **propose** updates
- Human-in-the-loop approval
- Versioning / supersession
- UI to view, edit, prioritize, pin
- Integration with Codex, RAG, scanner, prompts

Drop / reassign:

| v2 concept | Disposition |
|------------|-------------|
| Character psychological state | **Out** — not system memory; Codex stays concrete-only |
| Relationship & power maps | **Out** as enforced tracking |
| Active motifs & themes agents | **Out** |
| Thematic / Character State / Relationship agents | **Out** |
| Continuity-style distillation | **In** as `distill_memory` job |
| Unresolved tensions | **In** if **factual** open threads |
| Narrative voice / POV rules | **In** as craft rules (`voice_rule`) |
| Key events | **In** as concrete events / established facts |
| Multi-agent orchestration | **Deferred** indefinitely |

### 4.2 Storage model (two layers)

#### A. `agentMemories` (source of truth for lifecycle)

Metadata table (names illustrative):

| Column | Notes |
|--------|--------|
| `id` | PK |
| `storyId` | nullable — null = writer/global memory (reuse prompts/aiChats convention) |
| `memoryKey` | stable key for supersession, e.g. `fact:who-holds-the-key` or UUID |
| `category` | see §4.3 |
| `title` | short label |
| `body` | freeform text (the memory content) |
| `status` | `pending` \| `active` \| `rejected` \| `superseded` |
| `sourceJobId` | nullable FK agentJobs |
| `sourceScanId` / evidence json | optional links to scan issues / chapters |
| `priority` | optional int or pin flag |
| `pinned` | bool — session/project pin |
| `createdAt` / `updatedAt` / `approvedAt` | |
| `createdBy` | `job` \| `user` \| `chat` |

**Approval is mandatory before memory becomes retrievable as active project knowledge.** Mirror Codex: Approve / Reject / Edit-then-approve.

#### B. `ragChunks` with `entityType = "agent_memory"`

On **approve** (and on edit of an active memory):

- Set `entityId` = `agentMemories.id` (or stable `memoryKey` — pick one and stick to it; **prefer row id** for FK clarity, store `memoryKey` only on metadata)
- Call existing replace/index path (`replaceChunksForEntity` / index helper) so old chunks for that entity are replaced, not accumulated forever
- On reject/delete/supersede: `removeEntityFromIndex("agent_memory", entityId)`

**Do not** write RAG chunks for `pending` memories.

### 4.3 Categories (v1 allowlist)

| Category | Meaning | Example |
|----------|---------|---------|
| `established_fact` | Must not drift | “The club’s back room has no cameras.” |
| `open_thread` | Unresolved factual/plot thread | “Where did the ledger go after ch.12?” |
| `event` | Major concrete event + consequence | “After the raid, Elena’s phone is confiscated.” |
| `voice_rule` | POV/voice constraint | “Elena chapters: close 3rd, no omniscient.” |
| `project_note` | Freeform pinned note | Writer reminders |
| `writer_pref` | Cross-project (nullable storyId) | “Prefer sparse stage direction.” |

Anything psychological/thematic is **not** a first-class category. Users can put free text in `project_note` if they insist; the system does not run thematic agents over it.

### 4.4 Write policy (load-bearing)

| Rule | Detail |
|------|--------|
| Who writes pending rows | `distill_memory` job; later explicit user/chat “pin as memory” |
| Who promotes to active | **User only** (API + UI) |
| Silent chat learning every turn | **Forbidden** in v1 |
| Codex overlap | Memory must not become a second Codex for wardrobe/wounds/items — those stay lorebook/`codexState` |
| Supersession | New approved memory with same `memoryKey` marks previous `superseded` and reindexes |
| Conflict | Latest approved wins for a key; no multi-agent merge engine |

### 4.5 Retrieval isolation (load-bearing)

Extend `hybridSearch` (and any wrappers like search-for-chat) with **entity type filtering**:

```ts
// Conceptual API
hybridSearch({
  storyId,
  queryText,
  queryEmbedding,
  limit,
  entityTypes?: RagEntityType[]  
  // default for writing/chat/scanner: ["lorebook_entry", "chapter"]
  // only include "agent_memory" when a feature explicitly opts in
})
```

**Default must exclude `agent_memory`.**  
If a caller omits the filter, treat as default safe set — **not** “all types.” Document that clearly in code comments.

Optional later: a compact “Project Memory summary” block injected into prompts when the user enables “Include project memory” for that chat/feature — still only `active` rows.

### 4.6 `distill_memory` job

**Trigger (v1):** after a successful `rag_scan_*` (configurable), or explicit enqueue.

**Behavior:**

1. Read scan issues + optional chapter/lorebook snippets  
2. Call model via `buildClientForFeature` (new key `agent_memory_distill` or reuse scanner)  
3. Emit structured candidates: `{ memoryKey, category, title, body, evidence }`  
4. Insert `agentMemories` rows with `status: pending` only  
5. Job `result` summarizes count proposed  

Prompt constraints for the model:

- Factual / concrete only  
- No psych diagnostics, corruption scoring, or theme tracking  
- Prefer linking to existing lorebook entities when relevant  
- Skip low-confidence noise  

### 4.7 User visibility & control (required before any memory write ships)

**API:**

| Route | Purpose |
|-------|---------|
| `GET /api/agent/memories?storyId=&status=` | list |
| `GET /api/agent/memories/:id` | detail |
| `POST /api/agent/memories` | user-created note (pending or active if user-authored — prefer active for pure user notes) |
| `POST /api/agent/memories/:id/approve` | pending → active + index |
| `POST /api/agent/memories/:id/reject` | pending → rejected |
| `PATCH /api/agent/memories/:id` | edit title/body/category/pin |
| `DELETE /api/agent/memories/:id` | delete + remove from index |

**UI (minimal):** Project Memory panel (story-scoped):

- Tabs or filters: Pending | Active | Rejected  
- Approve / Reject / Edit  
- Delete  
- Pin  
- Show source (scan/job) when present  

No graph/heatmap visualizations in v1 (v2 Phase 3 deferred).

### 4.8 Integration points

| System | Integration |
|--------|-------------|
| Character Codex | Remains concrete state SoT; memory does not write Codex without existing propose/approve path |
| Vector RAG | `agent_memory` entity type; opt-in search |
| RAG Scanner | May **read** active memory when opted in to catch contradictions against established_fact / event |
| Chat / prompts | Opt-in include; never default-all |
| Visible AI Reasoning | If reasoning display exists, may show “proposed N memories” in job/chat traces later |
| Scene Beats / Humanizer | No automatic coupling in Phase B |

### 4.9 Phase B acceptance criteria

- [ ] `agentMemories` + approve/reject/delete work end-to-end  
- [ ] Pending never appears in default hybrid search  
- [ ] Approved memories index; delete/supersede removes/replaces chunks  
- [ ] `distill_memory` only creates pending rows  
- [ ] UI can list/approve/reject without SQL  
- [ ] No psych/thematic categories or agents introduced  
- [ ] DECISIONS.md + CLAUDE.md updated to point at this design  

---

## 5. Phase C — Later enhancements (do not build now)

- Rich Project Memory panel polish (pin-for-session, prioritization UX)
- Prompt summary injection presets per chat template
- Scanner default-on for active memory contradiction checks
- Optional soft concurrency for non-overlapping job types
- Migrate fully off `ragScans` table if dual-write was used
- Cross-project `writer_pref` browsing
- Manual “suggest memories from this chapter” button
- Visualizations (timelines) — only if still desired later

---

## 6. Mapping from older docs

### 6.1 `DECISIONS.md` Agent Framework Direction

| Recorded shape | This spec |
|----------------|-----------|
| `agentJobs` generalizes `ragScans` | §3.1 |
| In-process `jobRunner.ts` | §3.2 |
| `agent_memory` via RAG | §4.2 B |
| New FeatureKeys only | §3.8 |
| Gaps: schedule, concurrency, retry, write policy, UI control, status | §3.4–3.7, §4.4–4.7 |

### 6.2 `Project_Persistent_Memory_Design_v2.md`

| v2 | This spec |
|----|-----------|
| Persistent memory store | §4 `agentMemories` + RAG |
| Agentic framework layer | §3 jobs + limited distill job (not multi-agent roles) |
| Propose → approve → version | §4.4–4.7 |
| Thematic / psych agents | Removed |
| Phases 1–3 | Reordered: jobs first (A), memory (B), polish (C) |

### 6.3 Open questions from v2 — closed for v1

| Question | Decision |
|----------|----------|
| How strict is approval? | **All** job-proposed memories pending-first; user notes may go active immediately |
| Background autonomy? | Jobs yes; memory activation **no** |
| Structured vs freeform? | Structured `category` + freeform `body` |
| Conflicting updates? | Same `memoryKey` → supersede; latest approved wins |

---

## 7. Implementation order (for Claude Code)

Work in this sequence. Stop after each phase for user/Hermes review if architecture changes.

### Step A1 — Schema + repository
- Add `agentJobs` migration + Drizzle schema  
- Repository: enqueue, claim, complete, fail, list, get, retry, crash-recover  

### Step A2 — Runner
- `jobRunner.ts`: start/stop, serial loop, schedule tick stubs  
- Wire start from server bootstrap  

### Step A3 — First real job: `reconcile_index`
- Detect missing lorebook/chapter index rows; call existing index/remove helpers  
- Fix lorebook delete → `removeEntityFromIndex` on delete path (known gap) as part of this or adjacent PR  

### Step A4 — Scan as job
- Port or wrap `scanChapter` / `scanStory` to run under job lifecycle + progress  
- Preserve `ragScanIssues` behavior  

### Step A5 — Job API + minimal status UI  

### Step B1 — `agentMemories` schema + CRUD/approve APIs  
### Step B2 — hybridSearch entityType filter (default safe)  
### Step B3 — index on approve / remove on delete  
### Step B4 — Project Memory UI (pending queue)  
### Step B5 — `distill_memory` job + prompts  

Do **not** start B until A job status is visible and serial runner is stable.

---

## 8. Coding standards (project-local)

- Match existing Express + Drizzle + SQLite patterns  
- Prefer `attemptPromise` for non-blocking call sites that enqueue jobs  
- Auth on all new routes (same as lorebook/RAG)  
- Keep files under project line limits; extract modules rather than growing god-files  
- Verify with real running server + DB where possible (project culture in `DECISIONS.md`)  
- No new dependencies for queuing  
- Ask Hermes (via user) before inventing a second memory store or multi-agent framework  

---

## 9. Suggested `CLAUDE.md` blurb (paste when implementing)

```markdown
### Agent Framework & Project Memory (Planned)
- Design: `docs/Agent_Framework_And_Project_Memory_Design.md`
- Phase A: in-process serial `agentJobs` / `jobRunner` (index reconcile, scans, prune)
- Phase B: factual/concrete project memory with pending approval; `agent_memory` RAG entity;
  hybridSearch excludes agent memory unless a feature opts in
- No thematic/psychological agent pipelines; Codex remains concrete-state only
```

---

## 10. Suggested `DECISIONS.md` addendum title

When implementation starts, append a section:

**“Agent Framework — Load-bearing decisions (addendum)”**  
summarizing: serial runner, schedule tick, maxAttempts=3, memory pending-first, hybridSearch default filter, no manual scan UI, Phase A before B.

---

## 11. One-page summary for humans

| Layer | What | User control |
|-------|------|----------------|
| Jobs | Background work that keeps index/scans healthy | See status/errors; opt-in unattended scans |
| Memory | Factual project knowledge over time | Approve/reject/edit/delete; opt-in retrieval |
| Codex | Concrete character/world state | Existing propose/approve (unchanged) |
| Chapter RAG | Text of the manuscript | Auto-index on save (existing) |

**Build jobs first. Memory second. No silent brain.**

---

*End of design spec.*
