# Story Timeline — Design

**Project:** Story Labyrinth  
**Status:** ✅ **Fully implemented (2026-08-07)** — all slices **TL0–TL12** shipped. See `docs/CURRENT_BACKLOG.md` Story Timeline (T6) row and `DECISIONS.md` TL* entries for the load-bearing trail.  
**Talk list:** **T6** (closed / shipped)  
**Related:** Place maps — L0–L5 (`Locations_And_Maps_Design.md`) + **Maps v2 sketches** (`Maps_V2_Sketch_Design.md`); lorebook `event`/`timeline` categories, WB `timeline` template, RAG scanner `timeline` issues, Chat panel doctrine (`Chat_Panel_Integrations_Design.md`), Notes bridges  

---

## Context / job

Writers need a **visual chronology** for in-world time: prior missions, people met, formative events **before** the manuscript “now,” and beats during the book — without burying order inside freeform lore prose.

**Example:** Lizzy spy novel, FP POV. Career of prior ops and relationships that pressure page-one-forward continuity. Prologue may sit **before** Chapter One; **Story starts** is not “first row in the chapter list.”

**Not this feature:**
- Codex / chapter **History** (save/restore snapshots)
- Story **Map** (place)
- A second encyclopedia (full prose lives in lore/notes/chapters)

**Is this feature:** a **placement + order layer** (pins with when/order, links, memberships) plus a visual board.

---

## Locked decisions (2026-08-06 grill)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Job | **Flexible** chronology system — writer tracks what they care about (full spine + scoped/personal/multi-POV clocks). Not backstory-only forever; not History/Map. |
| **2** | Containers | **Hybrid:** default **story spine** timeline + **named timelines** (e.g. “Lizzy — prior ops,” cover-vs-truth). Same interaction model; different boards. |
| **3** | Pins / sources | **Multi-source pins:** `chapter` · `lorebook` · `note` · `native` (no link yet). Brainstorm is **not** a direct source — use Note handoff. **AI proposes** pins/placements → **Accept only** (no silent writes). |
| **4** | Time model | Primary: **relative to Story-start anchor** + always-allowed **fuzzy phrases** (“6 years before,” “that winter”). **Optional civil dates** (“1890,” full dates) when known. Mixed OK. |
| **5** | Visual | **Horizontal \| Vertical** view toggle (same data). **Optional swimlanes** when the writer wants tracks. Cards\|List energy — not one permanent layout. |
| **6** | Placement UX | **Both:** board-first create **and** library “Place on timeline…” from chapter/lore/note. AI = third door. |
| **7** | Pin identity | **One pin SoT**; **multi-timeline membership** (same beat on spine + named timeline without duplicate drifting copies). Optional lane id per membership or per pin (implementer choice; must support swimlanes). |
| **8** | AI context | **Opt-in** (armed toggle / chat include — default **off**). When on: **compact chronology** — order, when, titles, short blurbs, link names — **not** full linked bodies (those via normal RAG). |
| **9** | UI home | **Story Timeline** workspace tool (peer of Story Map) + **Place on timeline** affordances on chapter / lore / note. |
| **10** | Scope | **Fat pre-launch design (D):** include swimlanes UI, era/overview strip, export image, scanner hook, bulk “suggest from lore/notes/chapters” propose flow. **Implement in slices** (TL0…); do not one-shot megapr. |
| **11** | Story-start anchor | **Not** “first chapter in list.” Default/preferred: anchor to **Chapter One** (manuscript’s ch.1), leaving room for **prologue** (and other front matter) **before** Story-start on the line. **Also:** manual Story-start marker override (writer can place/move anchor without renumbering chapters). Both: chapter-one convenience + manual control. |
| **12** | Existing lore types | Keep lorebook categories **`event`** and **`timeline`** as **content types** (prose/entries). This tool is the **clock/board**. Pins may link those entries; do not replace categories with the canvas. WB `timeline` template remains a chat helper; evolve later to propose timeline pins. |

---

## Core model (illustrative)

```text
story
  └─ timelines[]          # spine isDefault=true; + named
       └─ (view prefs: orientation, swimlanes on/off, focus span)

pins[]                    # story-scoped SoT
  · id, title, blurb?
  · when: { kind: relative|fuzzy|civil|mixed, ... }
  · sortKey / order among peers when when ties
  · link?: { type: chapter|lorebook|note, id }
  · memberships[]: { timelineId, laneId? }
  · markers?: story_start contribution is timeline-level, not every pin

timeline.storyStart
  · mode: chapter_one | manual_pin | manual_time
  · chapterId? when mode binds to Chapter One
  · override always allowed
```

**SoT:** pin records + memberships + story-start config + lane labels.  
**Illustration only:** export PNG/SVG of the board (same doctrine as Story Map images).

**Prologue:** may exist as a chapter pin **before** Story-start; Story-start marker aligns with Chapter One unless manually moved.

---

## Time representation

| Form | Example | Notes |
|------|---------|--------|
| Relative to start | `yearsBefore: 6`, `T-6y`, `afterStart: chapterSpan` | Primary structured form |
| Fuzzy | `"years before Vienna"`, `"childhood"` | Always storable; sort may need manual order |
| Civil | `1890`, `2019-03-14` | Optional; never required |
| Order | explicit rank among unresolved fuzzies | Required fallback |

Sorting pipeline (implementer detail): civil when present → relative-to-start → fuzzy bucket + manual order → stable id.

---

## Views

| Control | Values |
|---------|--------|
| Orientation | `horizontal` \| `vertical` (per-timeline or user pref; same pins) |
| Swimlanes | off \| on; lanes are writer-defined labels on that timeline |
| Overview | era/decade (or relative-band) **strip** + detail span (fat scope) |
| Board switcher | Spine \| named timeline list |

---

## Create / place / AI

1. **Board:** click empty time / drag → native pin or link picker.  
2. **Sources:** Chapter / Lorebook entry / Note → **Place on timeline** (choose timeline(s), when, lane).  
3. **Chat:** fenced proposal (e.g. `timeline-pin-proposal`) → card → Accept/Reject; optional bulk suggest job → many proposals, still HITL.  
4. **Doctrine:** panel owns timeline artifact; chat governs; trays Mark-done morals if proposals are tray-shaped; **no** auto-commit.

Brainstorm desk: create/save **Note**, then place — no direct brainstorm checklist → pin pipeline required in v1.

---

## AI / RAG

| Path | Behavior |
|------|----------|
| Default chat context | Timeline **off** |
| Armed include | Compact ordered list for selected timeline(s) or spine (+ optional focus window) |
| Payload | when · title · blurb · source type · display name of link — **not** full description bodies |
| Scanner | Prefer real pin order + story-start when flagging `timeline` issues (hook in fat scope) |
| Bulk assist | Job or chat action: suggest pins from lore/notes/chapters → proposals only |

Re-index: pins themselves are light; optional `timeline_pin` entity type **or** fold compact lines into a single story-level chronology chunk when armed — choose at implement so hybridSearch doesn’t drown in stub pins. Prefer **on-demand assembly** for chat include over indexing every stub pin as full RAG entities unless proven needed.

---

## UI surfaces

| Surface | Role |
|---------|------|
| Workspace tool **Story Timeline** | Main canvas (mirror Story Map tool thickness) |
| Chapter UI | Place on timeline; show marker if chapter is Story-start / pinned |
| Lorebook entry | Place on timeline (any category; `event` natural) |
| Note | Place on timeline |
| Chat | Propose pins; optional include chronology toggle |
| Export | Image export of current view |

---

## Phasing (slices — fat design, ordered build)

| ID | Scope |
|----|--------|
| **TL0** | Schema: timelines, pins, memberships, story-start; spine created with story |
| **TL1** | Story Timeline tool shell; list/board CRUD pins; story-start (Chapter One default + manual) |
| **TL2** | Time model UI (relative + fuzzy + optional civil); sort |
| **TL3** | Multi-source Place… (chapter, lore, note); open link from pin |
| **TL4** | H\|V toggle; pan/zoom or scroll; Story-start marker chrome |
| **TL5** | Named timelines + multi-membership |
| **TL6** | Swimlanes UI |
| **TL7** | AI pin proposal fence + Accept cards |
| **TL8** | Opt-in chat chronology block |
| **TL9** | Era/overview strip |
| **TL10** | Export image |
| **TL11** | Scanner hook + bulk suggest proposals |
| **TL12** | Guide + polish |

**Suggested order:** TL0 → TL1 → TL2 → TL3 → TL4 → TL5 → … (TL6+ can parallel after TL5 where safe).

Promote build only on explicit user request; design-locked ≠ started.

---

## Non-goals

- Replacing lorebook `event` / `timeline` entry types  
- Image/export as SoT  
- Silent AI timeline rewrites  
- GIS / real-world map time scrubbing  
- Merging companion (Ricordo/PAM) life timeline into story DB  
- Treating Codex snapshot History as story chronology  

---

## Acceptance (design-level)

- [ ] Spine + at least one named timeline  
- [ ] Pin before Story-start (prior mission) and chapter pins including prologue **before** Ch.1 anchor  
- [ ] Story-start defaults to Chapter One, manually movable  
- [ ] Same pin on spine + named timeline via membership  
- [ ] Place from lore + note + chapter + native  
- [ ] H and V views; swimlanes toggle  
- [ ] AI propose→accept; opt-in compact context  
- [ ] Export image; scanner/bulk as sliced fat scope  

---

## Worked example (Lizzy spy)

| Pin | When | Link | Memberships |
|-----|------|------|-------------|
| Training / first kill | 12y before start | note or lore | Lizzy — prior ops |
| Mission Nightingale | 6y before | lore `event` | prior ops + **spine** |
| Met handler R. | 6y before (after Nightingale) | lore character | prior ops |
| Prologue — cold open | before start | chapter prologue | spine |
| **Story starts** | T-0 | → Chapter One | spine marker |
| Ch.1 | at/after start | chapter | spine |
| Reveal: Nightingale file | during ch.4 | chapter or note | spine |

AI armed on Editor: sees ordered compact list so FP voice doesn’t “forget” Nightingale preceded the handler meet.

---

*Locked with user 2026-08-06 (axes 1–12).*
