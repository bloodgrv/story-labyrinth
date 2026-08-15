# Activity Stoplight — Design

**Project:** Story Labyrinth  
**Status:** **Design locked 2026-08-14 — implemented in full 2026-08-15 (AS0–AS5).** See `docs/CURRENT_BACKLOG.md`'s Activity Stoplight row and `DECISIONS.md`'s "Activity Stoplight (AS0–AS5)" entry for the build trail.  
**Talk list:** **Activity Stoplight**  
**Backlog slices:** **AS0–AS5** (P3 until promoted)  
**Related:** `agentJobs` / `jobRunner` / Settings `RecentJobsCard`; RAG Scanner progress; future AI Review jobs; toasts (`react-toastify`)

---

## Context / job

Long-running work is often announced with a **toast** (“scan started”) then goes silent. The user switches desks and has **no persistent cue** that anything is still running, short of opening **Settings → Logs → Recent Jobs** or staying on a panel that happens to poll.

**Is this feature:** one **global activity control** in the workspace chrome — a **stoplight** (status lamp + count, expandable task list) fed by live **`agentJobs`** state.

**Not this feature:**

| Surface | Job |
|---------|-----|
| **Toasts** | Ephemeral start/finish messages (keep as-is; stoplight does not replace them) |
| **Settings Recent Jobs** | Full history / retry log — **deep link** from stoplight, not replaced |
| **Sidebar pending dots** (e.g. Timeline pins) | **HITL review backlog** (“needs you”) — different meaning from “machine busy” |
| **Per-desk spinners / rail marks** | Explicitly **out of v1** (Axis 1 = global only) |
| **Chat streaming indicators** | Local to chat rails today; **not** a v1 source (extension hook only) |

---

## Locked decisions (2026-08-14 grill)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Job | **Global activity only** — one app-chrome indicator for in-flight work. No per-left-rail working marks in v1. |
| **2** | Sources v1 | **`agentJobs`** in `queued` + `running`. **Failed** jobs remain visible (red) until user **Dismiss** or **Retry**. |
| **3** | Sources later | UI shell must allow registering more sources later (chat generate, long mutations) **without relocating chrome**. Not built in v1. |
| **4** | Visual | **Stoplight stack:** collapsed = **lamp + count**; expanded = labeled **task rows**. |
| **5** | Colors | **Amber (pulse)** = any working (queued/running). **Red** = any undismissed failed (**red wins** over amber if both). **Hidden** when idle and no undismissed failures. Optional green “just finished” flash = **off by default**. |
| **6** | Placement | Workspace **`TopBar` trailing** (near command palette / theme / settings actions cluster). |
| **7** | Coverage | **Workspace only (`/` + `TopBar`)**. Not Settings, Guide, Reader, login, or Deep Writing chrome-hide. |
| **8** | Expand actions | Row shows type label, story/chapter crumb when known, status, elapsed. **Jump** to owning surface when known. **Retry** if existing API allows. Footer: **All jobs** → Settings Logs / Recent Jobs. |
| **9** | Cancel | **No job cancel in v1** unless cancel already exists end-to-end (do not invent). |
| **10** | Transport | **Poll** existing jobs list API (same spirit as Scanner / Recent Jobs). No new websocket required v1. |
| **11** | Story focus | Prefer **current story** jobs in the list; if other stories have active jobs, show a secondary “Other stories” group or include with clear story label (implementer pick; must not hide other-story spend entirely). |
| **12** | Name | Product: **Activity Stoplight** (or short UI aria-label **Activity**). Code ids may use `activityStoplight` / `ActivityStoplight`. |

---

## UX sketch

### Collapsed (TopBar)

```text
[ ● 2 ]     amber pulse + count of working jobs
[ ● 1 ]     red + count when only failures (or working+failed — red lamp, count = working + failed or failed-only; lean: count = items currently shown as needing attention = working + undismissed failed)
```

- Hidden when count would be 0.  
- Tooltip: “2 jobs running” / “1 job failed”.  
- Click toggles popover/sheet with the stack.

### Expanded

```text
Activity
────────────────────────────────
● Scanner · Shadows… · ch. The Drop    running   0:42
● Suggest Codex updates · …            queued    —
● Graph edges                          failed    Retry | Dismiss
────────────────────────────────
All jobs →
```

- Labels: humanize `jobType` (`rag_scan_chapter` → “Chapter scan”, etc.).  
- Jump: e.g. scan → Scanner tool; unknown → no jump or Settings jobs.  
- Dismiss failed: client-local hide **or** server ack if a clean field exists — **lean: local dismiss set (session or localStorage) keyed by job id** so we don’t schema-creep; document if server-side preferred later.

### Deep Writing / Focus

TopBar hidden → stoplight **not shown** (coverage W). User accepted this gap for v1.

---

## Data

**Read path:** existing `GET /api/agent/jobs` (or the same client helper `useRecentJobsQuery` / list with status filter).  
**Filter client-side:** `status in (queued, running)` always; `status === failed` until dismissed.  
**Polling:** while any working job exists, poll aggressively (e.g. 2–3s); when only failed or idle, slow or stop. Mirror patterns in `useAgentJobsQuery` if it already speeds up on active jobs.

**Do not** create a parallel job store. Stoplight is a **view** over `agentJobs`.

---

## Relationship to other UI

| Concern | Rule |
|---------|------|
| Toast on enqueue | Keep feature-local toasts; stoplight is the persistence layer |
| Recent Jobs card | Remains history + retry home; stoplight links there |
| Pending review badges | Unchanged; different color language if needed (not amber “working”) |
| AI Review (future) | Its jobs automatically appear once enqueued as `agentJobs` |

---

## Implementation slices

| Slice | Work | Depends |
|-------|------|---------|
| **AS0** | Shared types/helpers: job type → label; status → lamp color; dismiss-failed store (local) | — |
| **AS1** | `useActivityJobs` (or extend `useAgentJobsQuery`): poll, filter working+failed, current-story grouping | AS0 |
| **AS2** | `ActivityStoplight` collapsed lamp+count + popover list UI | AS1 |
| **AS3** | Mount on workspace `TopBar` trailing; idle hide | AS2 |
| **AS4** | Row actions: Retry (existing mutation), Dismiss failed, jump-to-tool map, **All jobs** → `/settings` Logs anchor | AS2 |
| **AS5** | Guide blurb (Settings/Guide or workspace tip) — optional thin | AS3 |

**Order:** AS0 → AS1 → AS2 → AS3 → AS4 → AS5.

**Reuse:** `RecentJobsCard` label/retry patterns, `agentJobsApi`, owner-gated job visibility (stoplight should no-op or empty for non-owners if jobs API is owner-only — **match API auth**; editors who can’t list jobs simply don’t see the control).

---

## Pitfalls

- Do **not** put working spinners on every sidebar tool in v1 (Axis 1 = A).  
- Do **not** conflate with Timeline pending-pin dots.  
- Do **not** mount only inside Scanner — must be TopBar global for workspace.  
- Do **not** claim Settings/Guide coverage (locked **W**).  
- Do **not** invent job cancel.  
- Do **not** block on websockets.  
- Do **not** leave a permanent green “all good” lamp (idle = hidden).  
- Build only after **promote**.

---

## Document history

| Date | Change |
|------|--------|
| 2026-08-14 | Design locked from Hermes grill. Global TopBar stoplight; agentJobs; workspace-only; stack UI. |
