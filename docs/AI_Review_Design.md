# AI Review — Design

**Project:** Story Labyrinth  
**Status:** **Core v1 (AR0–AR4) shipped 2026-08-15** — schema, Quick review job, findings list UI + actions, Editor entry point. **AR5 (Deep staged mode) and AR6 (Guide page) still open.** See `DECISIONS.md`'s "AI Review — Core v1 (AR0–AR4)" entry.  
**Talk list:** **AI Review**  
**Backlog slices:** **AR0–AR6** (P3 until promoted)  
**Related:** RAG Scanner (`ragScans` / factual only); chapter **Scribble** (`chapters.notes` / `ChapterNotesEditor`); Editor chat rework; Project Memory; Story Timeline; Concrete Beats; Grammar/Humanizer (stay off this desk)

---

## Context / job

After (or while) writing the novel, the author wants an AI that acts like a **human manuscript editor**: reading the work, flagging problems and things to be aware of — not only hard Codex fact checks.

**Is this feature:** a workspace **AI Review** desk that runs **Quick** or **Deep** review over a **user-selected chapter set** (a couple of chapters or the **whole book**), produces a **durable findings list**, and routes findings into existing writer surfaces (chapter scribble, Editor chat seed).

**Not this feature:**

| Surface | Job |
|---------|-----|
| **RAG Scanner** | Factual continuity vs Codex / prior chapters / opt-in memory & timeline (`contradiction`, `state_mismatch`, `timeline`, …). Proof-oriented. **Stays separate.** |
| **Grammar / LanguageTool** | Live spelling/grammar/style marks in the editor |
| **Humanizer** | Prose rewrite tool — **not on this desk** |
| **Editor selection rework / chat** | Where the author **rewrites** after a finding |
| **Concrete Beats** | Tags on existing prose for tracking |
| **Lore Sheet Sync / Codex compile** | Structured state proposals |

**Doctrine:** desk **judges**; other surfaces **rewrite**. No silent chapter patch. No psych/theme **enforcement** (MBTI/corruption meters). Soft craft awareness ≠ Scanner law.

---

## Locked decisions (2026-08-14 grill)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Job | **Manuscript editor pass** — human-editor suggestions on the author’s prose. Multi-chapter or whole book. |
| **2** | Lens | **Layered tags:** `dev` + soft `continuity` + elevated **`voice`** (voice drift) on by default; `line` optional/off by default. Hard Codex facts → **Scanner**. |
| **3** | Run | **D:** **Quick** = one-shot; **Deep** = staged loop (map → cross-chapter → **voice pass** → merge/dedupe). Manual trigger only. `agentJobs`. |
| **4** | Lore | **Yes, selective.** Quick: synopsis + **RAG top hits** for entities in selection. Deep: RAG + optional cast sheets/Codex, Project Memory, spine Timeline (opt-in). **Never** default full-lorebook dump. Full-bible audit = possible later mode only. |
| **5** | Lifecycle | **Durable queue:** Open / Dismissed / Resolved (Scanner-shaped). Re-run does not casually wipe Dismissed. Filter by chapter + tag. |
| **6** | Home | Product name **AI Review**. **New sidebar tool** + Editor **“Review this chapter”** (pre-scopes current; multi-select on desk). Scanner remains its own tool. |
| **7** | Multi-select | **Yes on the desk** — any subset or Select all / whole book. Editor entry starts with current chapter checked. |
| **8** | Writes on desk | **None.** No Humanizer, no one-click prose fix, no auto Codex. |
| **9** | Actions | Open chapter · Dismiss/Resolve · Copy · **Add to chapter scribble** · **Send to Editor chat** (seed only). |
| **10** | Notes path | **No direct “Save as Note”** on findings. User promotes via existing **Scribble → Send to Notes**. |
| **11** | Storage | **Separate** tables/prompts from `ragScans` / `ragScanIssues` (do not overload factual Scanner trust). |
| **12** | Name | Display **AI Review** (not “Editor Review” / “Edit Letter” as primary label). |

---

## Finding model (illustrative)

```text
aiReviews[]                    # one run / session
  · id, storyId
  · mode: quick | deep
  · chapterIds[]               # selection at run time
  · status: running | completed | failed
  · jobId?
  · createdAt, completedAt
  · options: { includeMemory?, includeTimeline?, includeLine?, castEntryIds? }

aiReviewFindings[]
  · id, reviewId, storyId
  · chapterId?                 # primary locus
  · tag: dev | continuity | voice | line
  · severity: low | medium | high
  · title, description         # what + why it matters
  · excerpt?, excerptStart?, excerptEnd?  # best-effort
  · direction?                 # optional editorial suggestion (not a patch)
  · status: open | dismissed | resolved
  · createdAt
```

Implementer may collapse naming (`manuscriptReviews` etc.) if clearer in schema — product label stays **AI Review**.

**Evidence:** chapter excerpt + optional short lore/RAG labels when used; not required to mirror Scanner’s full evidence array v1.

---

## Run modes

### Quick

1. User selects chapters (or all).  
2. Job assembles: chapter texts (bounded) + synopsis + hybrid RAG hits for names/places in selection.  
3. Single LLM pass → JSON findings → persist → list UI.  

### Deep (staged, fixed steps — not open agent swarm)

1. **Map** — per-chapter beat/function notes (internal or lightweight rows).  
2. **Cross-chapter** — dev + soft continuity compare across selection.  
3. **Voice** — dedicated voice-drift pass (character + narrative).  
4. **Merge/dedupe** — one findings list for the run.  

Optional Deep toggles (default off unless product sets sensible defaults later): include active Project Memory, spine Timeline excerpt, focused cast Codex/sheet for appearing characters.

**Whole book:** may chunk for context limits; still **one merged list** per run.

---

## UI home

### Sidebar tool — AI Review

- Chapter multi-select + Select all  
- Quick | Deep  
- Run (owner-gated job, progress like Scanner)  
- Findings list: filters (status, tag, chapter), severity  
- Per-finding actions (below)  
- Empty state: *“Dev, soft continuity, and voice notes on the chapters you pick.”*

### Editor entry

- Control: **Review this chapter** → opens AI Review tool with **current chapter** selected (user can add more before Run).

### Not on this desk

- Humanizer  
- Factual Scanner controls (optional **link** “Open Scanner for these chapters” is a later nicety, not v1 requirement)  
- Direct Notes create  

---

## Actions (v1)

| Action | Behavior |
|--------|----------|
| **Open chapter** | Navigate to chapter; highlight excerpt when substring/offsets match (best-effort, same degrade posture as Scanner marks). |
| **Dismiss** / **Resolve** | Queue hygiene; only these leave Open (mirrors Scanner/tray morals for status). |
| **Copy** | Markdown block of the finding. |
| **Add to chapter scribble** | **Append** dated structured block to that chapter’s existing Scribble (`chapters.notes`). Do not wipe. Multi-chapter / missing chapterId: append per linked chapter or confirm. Uses existing scribble save path. |
| **Send to Editor chat** | Seed Editor chat composer (chapter-bound when possible) with brief — **does not auto-send**. User edits/sends; rewrite Accept stays on existing Editor paths. |

**Bulk (selected rows):** Dismiss/Resolve; scribble-append each to its chapter; optional one summary seed to Editor chat (“work this punch list”).

### Scribble append shape (lean)

```text
--- AI Review · voice · high · 2026-08-14 ---
Issue: …
Why it matters: …
Excerpt: "…"
Direction: …
```

### Editor-chat seed shape (lean)

```text
[AI Review — voice | high]
Chapter: 12 — …
Issue: …
Why it matters: …
Excerpt: "…"
Direction (optional): …
```

### Explicitly out of v1

- Save as Note (use Scribble → Send to Notes)  
- Propose Project Memory (v1.5 candidate: continuity-only + confirm)  
- One-click prose patch / fix proposals from the list  
- Humanizer  
- Outline handoff  
- “Fix all” agent  

---

## Relationship to Scanner

| | AI Review | RAG Scanner |
|--|-----------|-------------|
| Trust | Editorial judgment / awareness | Fact vs established concrete context |
| Tags | dev, continuity, voice, line | contradiction, state_mismatch, timeline, other |
| Tables | Own | `ragScans` / `ragScanIssues` |
| Lore | RAG assist for judgment | Retrieval for proof |
| Output | Things to be aware of + optional direction | Evidence + suggestedFix |

Do **not** broaden Scanner’s system prompt into style/dev and call AI Review “done.”

---

## Implementation slices

| Slice | Work | Depends |
|-------|------|---------|
| **AR0** | ✅ Schema `aiReviews` + `aiReviewFindings` (status, tags, chapterId, excerpt fields); types. Story export/import inclusion **not done this pass** — documented omission, see `DECISIONS.md` | — |
| **AR1** | ✅ Job `ai_review_quick` + runner wiring + feature endpoint key `ai_review`; chapter multi-select shell tool. Triggering reuses the generic `POST /api/agent/jobs` (owner-gated), same as Scanner — no dedicated trigger route | AR0 |
| **AR2** | ✅ Findings list UI + Open/Dismiss/Resolve/Copy + status + tag filters | AR1 |
| **AR3** | ✅ Actions: scribble append + Editor chat composer seed | AR2 |
| **AR4** | ✅ Editor “Review this chapter” entry + sidebar registration/labels | AR1 |
| **AR5** | Deep staged job + voice stage + richer lore opt-ins — **not started** | AR1–AR2 |
| **AR6** | Guide page (`ai-review.mdx` or under advanced) — **not started** | AR2+ |

**Reuse:** `jobRunner` / `agentJobs`, hybridSearch, chapter notes scribble API, Scanner list UX patterns, Editor chat seed patterns (`pendingChatComposerSeed` / rework seed precedents).  
**Do not reuse:** `ragScanIssues` rows for craft findings.

**Suggested order:** AR0 → AR1 → AR4 (entry) → AR2 → AR3 → AR5 → AR6.

---

## Pitfalls

- Do not put Humanizer or rewrite Accept on this desk after lock **#8**.  
- Do not add direct Save as Note after lock **#10**.  
- Do not full-lorebook dump every run.  
- Do not invent a second scratch pad — **chapter Scribble only**.  
- Do not merge into Scanner tool/mode without a new grill.  
- Do not auto-chain Deep after Quick or auto-run on save.  
- Do not enforce psych profiles.  
- Build only after **promote**; lock ≠ implement.

---

## Document history

| Date | Change |
|------|--------|
| 2026-08-14 | Design locked from Hermes grill (Axes 1–7 + actions). Product name **AI Review**. No Notes direct send; scribble → Notes. No Humanizer on desk. |
