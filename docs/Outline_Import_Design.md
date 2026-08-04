# Import to Outline — Design

**Project:** Story Labyrinth  
**Status:** Locked 2026-07-20 — ready for implementation when promoted off P3  
**Backlog:** `docs/CURRENT_BACKLOG.md` P3  
**Related:** lorebook multi-format import (`documentImportService.ts`); Outline chat / `outline-proposal`; Brainstorm handoff tray; `docs/Notes_Outline_Chat_Bridges_Design.md`; `docs/Chat_Panel_Integrations_Design.md`

---

## Job

Turn a **structure / outline document** into the story’s **outline spine** (`outlineItems`: chapter → scene only), with a human gate before bulk write.

**Not this feature:** full new-story bootstrap from a bible (that’s **Brainstorm / story import** — see parked note below).

---

## Why the spine stays in the DB

Outline pain is mostly **product shape** (fixed 2-level tree, proposal lifecycle, double-gate AI), not “because SQLite.”  
`outlineItems` remain SoT so tree UI, id-stable chat edits, export/import, `includeInAi` RAG, and arcs have something durable to hang on. Import does not invent a parallel markdown-only outline.

**2-level only** (chapter → scene): existing fork bias to tractable scope; deeper headings **collapse** into summaries. Acts/Parts as real depth = separate project.

---

## Locked decisions (2026-07-20)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Intelligence | **Hybrid:** deterministic structure parse when the doc looks like an outline; **LLM normalize** into fixed chapter→scene JSON when not (or as cleanup). Same draft UI either path. |
| **2** | Entry surfaces | **Both:** drop file on **Outline chat** + Outline panel **“Import structure…”**. One pipeline. |
| **3** | Existing outline | Confirm UI: **Append** (default) / **Replace all** (hard confirm). **No** smart merge-by-title in v1. **Chat drop when outline non-empty:** agent **asks intent first**; no silent extract unless user already ordered it. Empty outline: extract immediately. |
| **4** | Formats | Same as lorebook: **PDF, DOCX, MD, TXT** — reuse `extractTextFromFile`. |
| **5** | Draft / confirm UX | **One draft model.** Dense edit/reorder in **Outline panel** draft mode. Outline chat shows compact **Review in Outline / Accept / Discard** card. |
| **6** | Row provenance | On Accept: `source: "ai_suggested"`, `status: "confirmed"`. Draft Accept is the only spine gate (no second per-row pending pass). |
| **7** | `chapterId` | **Never** set on import. Link to prose chapters later by hand. |
| **8** | `includeInAi` | Draft toggle **arm all / none**; default **none** (false). Keeps Notes/Outline bridge opt-in. |
| **9** | Depth mapping | **Collapse rules** into 2-level; extra depth folds into parent/scene **summary**. Flat lists → chapters unless structure clearly indicates scenes under chapters. |
| **10** | Promotion model | **Split (C):** **structure → spine** on Accept; **rich material → tray** for development in Outline / WB (etc.). Not full auto-cast write. |
| **11** | Spine fields on Accept | `type`, `parentId`, `order`, `title`, `summary`, optional `wordCountTarget` when obvious. |
| **12** | Rich lane (not silent DB) | Character names, arc notes, lore-ish asides: extract into **tray / handoff packets** for user-driven link/create/refine. **No** auto `outlineItemCharacters` writes; **no** auto lorebook create in v1. |
| **13** | Tray shape (rich lane) | **E for product:** durable **Import checklist** with **Brainstorm B4 morals** (Open/Send/Accept may do work; only **Mark done** / Dismiss leaves Active). Primary UI on **Outline tool** (beside structure draft); Outline chat shows count + open-tray. **Not** Codex resolve-on-approve. **Not** stuffing rows into Brainstorm-only `brainstormChecklist` as-is. |
| **14** | Tray storage / generalization | **Prefer schema aimed at app-wide work tray (B), without big-bang Brainstorm rewrite in the Import v1 PR.** Options at implement time (pick cheapest that preserves B4 morals): (1) new generalized table (`storyWorkItems` / `workChecklist`) with `source`/`surface` (`outline_import` \| `brainstorm` \| …), migrate Brainstorm later; or (2) widen `brainstormChecklist` into a neutral name + optional `chatId` + import batch id, dual-write or thin adapter for existing Brainstorm UI. **Forbidden:** second divergent lifecycle (e.g. Codex-style clear-on-accept) for the same “development queue” idea. |
| **15** | When rich rows appear | **On extract** (not gated on spine Accept). User may Dismiss junk or Open WB while still editing structure draft. Explicit **link cast → outline item** only after spine rows exist (post-Accept) via tray action. |
| **16** | Discard structure vs rich | Discarding the structure draft does **not** auto-wipe rich checklist rows; user Dismiss/Mark done, or a single confirm “discard import batch (structure + rich)”. |
| **17** | Feature endpoint | New key **`outline_import`** (“Outline Import”) in `FeatureKey` / Settings. Do **not** reuse `document_import` or the Outline chat model alone (panel path must work without a live chat). |
| **18** | Replace semantics | **Replace all** = delete **every** `outlineItems` row for the story (any status) + cascaded `outlineItemCharacters`, then insert imported tree. Hard confirm in UI. Does not delete prose `chapters`. |
| **19** | Draft / batch persistence | **Server batch is SoT** for structure draft JSON + linkage to rich checklist rows. Optional client session cache OK. Survives refresh and Outline tool unmount. |

---

## Tray shape (detail)

### Morals (same as Brainstorm B4)

| Action | Clears Active? |
|--------|----------------|
| Open (WB / Outline chat / Notes seed) | **No** — sets `opened` |
| Send / apply handoff side effect | **No** |
| Mark done | **Yes** → Done tab |
| Dismiss | **Yes** → dismissed |

### Surfaces

```text
Outline panel:  [ Structure draft ]  |  [ Import tray: Active | Done ]
Outline chat:   compact card — "Structure ready · N rich items" → focus panel tray
```

### Packet kinds (illustrative v1)

| kind | Typical actions |
|------|-----------------|
| `import_cast` | Open in WB (seed) · Link to outline item (after Accept) · Dismiss |
| `import_arc_note` | Attach to item after Accept · Open Outline chat with blurb · Dismiss |
| `import_handoff` | Notes / Research / WB generic handoff (reuse `pendingLorebookSeed` / composer seed where they exist) |

Spine bulk write is **never** a checklist Accept that inserts the whole tree — that stays the **structure draft Accept** control.

### Generalization north star

User is fine with **app-wide Brainstorm-style tray** if it works. Import v1 should **not** invent a one-off status machine; it should either sit on a **neutral work-checklist** table or an **extended** B4 table so Notes K3 / future desks can share Mark-done doctrine later. Brainstorm migration can be a follow-up slice, not a blocker for Outline Import design lock.

---

## Promotion model (load-bearing)

```text
File → hybrid extract
     → draft (panel) + compact chat card
     → Accept structure  → outlineItems (Append or Replace)
     → rich packets      → tray → Outline chat / WB (user develops)
```

Agent-imputed **canon** only crosses the spine boundary via **Accept** (same moral as Approve / Mark-done).  
Rich imputation uses **tray rules**, not silent joins.

---

## Explicit non-goals (v1)

- Auto-link `chapterId` by title
- Smart merge-by-title into existing rows
- Auto-create character lorebook stubs from cast lists
- Silent `outlineItemCharacters` / arc overview fills on Accept
- Third+ outline nesting levels
- Replacing Outline chat or Brainstorm as intake hubs

---

## Open at implement time only

| Topic | Notes |
|--------|--------|
| **Generalize Brainstorm now vs later** | Under lock 14 — pick cheapest path that preserves B4 morals; prefer no big-bang Brainstorm rewrite inside first Import PR unless cheap |
| **Exact packet JSON shapes** | Finalize with parser + tray UI |
| **Max file size / text truncation** | Match or slightly raise lorebook import limits; document in DECISIONS when chosen |

---

## Parked sibling — Brainstorm / new-story import

**Not the same feature as Import to Outline.**

| | Import to Outline (this doc) | Brainstorm / story import (parked) |
|--|------------------------------|-------------------------------------|
| **Job** | Structure file → **spine** (`outlineItems`) with Accept | File as **head start** on creating a story — develop via chats/trays |
| **Promotion** | Split: structure→DB, rich→tray | Closer to **tray-heavy / B-flavor**: little or no bulk spine commit until user builds it |
| **Home** | Outline chat drop + Outline panel | Likely **Brainstorm** (intake hub) ± story create flow |
| **Status** | **Locked** (design) | **Note only** — not designed; do not fold into OI slices |

When picked up: own design pass (formats, what becomes synopsis/note/memory/lore handoffs vs outline, empty-story CTA). Point back here so structure-bulk and intake-bootstrap stay separate.

---

## Implementation slices (OI0–OI8)

Promote off P3 only when scheduled. Each slice should leave the app shippable.

| ID | Slice | Delivers |
|----|--------|----------|
| **OI0** | Schema + types | `outlineImportBatches` (or equivalent): storyId, status (`extracting`/`ready`/`accepted`/`discarded`), structureDraft JSON, mode default, includeInAiArm flag, source filename, timestamps. Rich work items table **or** generalized work-checklist rows with `source=outline_import` + `batchId`. |
| **OI1** | Feature endpoint | Add `outline_import` to `FeatureKey`, labels, admin UI, `buildClientForFeature`. |
| **OI2** | Extract pipeline | Reuse `extractTextFromFile`; deterministic structure parse; LLM normalize via `outline_import`; collapse-to-2-level; emit structureDraft + richPackets; `POST .../outline/import` (multipart) → creates batch + rich rows. |
| **OI3** | Batch API | GET batch, PATCH structure draft (edits/reorder/mode/arm), POST accept (append\|replace transaction), POST discard batch (optional wipe rich), checklist status Mark done/Dismiss/Open. |
| **OI4** | Accept write path | Append: bulk insert chapters/scenes with orders after max sibling; Replace: delete all story outline items then insert; set `ai_suggested`+`confirmed`, `includeInAi` from arm flag; never `chapterId`. |
| **OI5** | Outline panel UI | “Import structure…” picker; draft pane (tree edit, Append/Replace, arm toggle, Accept/Discard); Import tray Active/Done beside draft; wire handoffs (`pendingLorebookSeed`, etc.). |
| **OI6** | Outline chat entry | File drop + attach; empty outline → extract; non-empty → agent asks unless user already specified mode; compact Review/Accept/Discard card bound to batch. |
| **OI7** | Cast link action | Post-Accept tray action: link resolved character ↔ outline item (+ optional arcNote write). No auto-link on extract. |
| **OI8** | Polish / verify | Tool-switch persistence; Replace hard confirm; tsc/oxlint; live file round-trip; DECISIONS.md + backlog → Done. |

**Out of slices:** Brainstorm story-import; Brainstorm table migration unless done cheaply under OI0; smart merge; auto lorebook create.

---

## Acceptance criteria (v1)

- [ ] PDF/DOCX/MD/TXT upload from panel and Outline chat produce same batch shape  
- [ ] Hybrid path yields editable 2-level draft  
- [ ] Append default; Replace wipes all outline rows + links after confirm, not chapters  
- [ ] Accept writes spine only; rich items remain until Mark done/Dismiss  
- [ ] `includeInAi` default false unless arm-all  
- [ ] Non-empty chat drop asks before extract  
- [ ] Refresh / leave Outline tool / return → batch still loadable  
- [ ] `outline_import` endpoint selectable in Settings  

---

*Design locked 2026-07-20. Update when implementation starts or user reopens an axis. Mirror priority in `CURRENT_BACKLOG.md`.*
