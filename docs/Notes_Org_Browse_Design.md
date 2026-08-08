# Notes Desk Org + Browse UI (T7) — Design

**Project:** Story Labyrinth  
**Status:** **Design locked 2026-08-07, shipped 2026-08-08.** NO0–NO6 all done — see `DECISIONS.md`'s "Notes Desk Org + Browse UI — T7 (NO0-NO6)" entry.  
**Talk list:** **T7**  
**Priority:** **P3** until promoted  
**Related:** Notes desk K0–K5 (`docs/Chat_Panel_Integrations_Design.md` §7); bridges N0–N6 (`docs/Notes_Outline_Chat_Bridges_Design.md`); Lorebook browse density B8; Folders B9 (`docs/Folders_Org_Design.md`); Relations note-pins (parked on talk list — **not** this feature)

---

## Context / job

Notes desk (K*) shipped as a **working-material parking lot**: list sidebar + single editor + optional chat rail, type/pin/armed filters. At novel scale the **browse shell is still Phase‑0 skinny** next to Lorebook (tabs, Cards|List, folder tree on a large main surface).

**Is this feature:** Lorebook-shaped **organization + browse UI** for story Notes — sticky Browse, multi-open note tabs, Cards|List on the large surface, cosmetic folders, thin tags, better search/piles — without changing AI gates or inventing a Notes graph.

**Not this feature:**
- Notes-native graph / spatial board
- Relations “note pins” (parked separate talk item)
- Double-gate / Editor-never-notes / proposal doctrine changes
- Folder-aware RAG or chat context packs
- Bulk multi-select (named fast-follow)
- Lexical note body rewrite, merge-notes AI, span-in-note rework
- Types-as-folder-roots or replacing the type enum
- Multi-folder membership

---

## Locked decisions (grill 2026-08-07)

| # | Axis | Lock |
|---|------|------|
| **1** | Job | **C** — Lorebook-shaped Notes desk: Browse + multi tabs + Cards\|List + cosmetic folders |
| **2** | Org model | **C** — **Hybrid:** folders = primary *where*; type + pin + armed = filters/badges; **smart piles** virtual (not storage) |
| **3** | Open shell | **C** — Sticky **Browse** tab + closable **note tabs**; **persist open tabs + active index per story** (localStorage, Lorebook pattern); optional Chat rail unchanged |
| **4** | Browse chrome | **C** — Collapsible **folder tree** sidebar (default **expanded** on desktop) + main pane Cards\|List + toolbar |
| **5** | Folders | **C** — Full **B9 morals** extended: `orgFolders.kind = notes`, depth ≤3, one folder or Unfiled, delete = reparent (never cascade), leaf DnD + Move to…, export round-trip, **cosmetic only**. **Dismissible starter seeds** on first empty Notes visit |
| **6** | Search / piles | **B** — Search **title + body**; default whole desk + **path crumb**; optional **this folder only**. Piles: **All · Unfiled · Pinned · Armed · Recent**. No Needs-promote pile v1 |
| **7** | Leaves | **C** — Card: title · type · pin/armed · 1–2 line plain preview · folder crumb · tag chips. List row: title · type · pin/armed · crumb · tags (no body). **Click → open note tab**. Hover: pin · arm · delete · Move to… |
| **8** | AI / gates | **A** — **Org/UI only.** Double-gate, desk privilege reads, note-proposal/split/promote, `includeInAi` **unchanged**. Folders/tags **never** affect RAG or model context |
| **9** | Priority / slices | **B** — **P3**; slices **NO0–NO6**; build only on promote |
| **10** | Non-goals + tags | **C** — Non-goals as listed above; **thin optional tags** in T7 (chips, filter, search match; not a taxonomy CMS; no tag→AI) |

**Parked elsewhere:** Relations · note pins — notes as optional linked pins/leaves on the **relationship graph** later; complements Timeline multi-source pins. Talk list row; **do not build with T7**.

---

## Core model (illustrative)

```text
story
  └─ notes[]
       · id, title, content, type (idea|research|todo|other)
       · includeInAi, pinned          # existing
       · folderId?                    # NEW — null = Unfiled
       · tags?: string[]              # NEW — thin optional chips
       · updatedAt, …

  └─ orgFolders[]  where kind = 'notes'
       · scopeId = storyId
       · parentId, name, order
       · depth ≤ 3
```

**SoT:** note rows + orgFolders rows (same as lore/chat folders).  
**Not SoT:** Browse view mode, open tabs, pile selection, tree collapsed state (client prefs).

**Cosmetic boundary (same as B9):** folders and tags must not change RAG indexing, chatContext packets, Codex, or graph semantics.

---

## UI shell

```text
[ Open tabs: Browse | Note A × | Note B × | … ]     [ Import dump ] [ Chat ]

Browse (active):
  [ Tree ▾/▸ ] [ Toolbar: search | piles | type | Cards|List | this-folder-only? ]
  [ Unfiled / folders… ]   [ Cards or List of leaves in selection ]

Note tab:
  [ NoteEditor — existing body editor ]

Chat open:
  right rail NotesChatRail (focusedNoteId = active note tab if any)
```

### Open tabs

- **Browse** tab always present; not closable (or reappears if closed — implementer: prefer non-closable Browse like Lorebook browse root).
- Opening a note from Browse adds/focuses a note tab.
- Persist key e.g. `sl-notes-open-tabs:{storyId}` → `{ tabs, activeIndex }` (names flexible).
- Invalid note ids on load: drop silently.

### Browse main = home

Empty selection no longer means a dead “No Note Selected” void as the only large-pane state — **Browse owns the large surface** with Cards/List. Editor lives in note tabs.

### Folder tree

- Reuse `src/features/folders/` patterns (sidebar, DropZone, Move dialog, depth validation).
- Extend `folderService` / routes: `kind: 'notes'` (+ `notes.folderId`).
- Selection shows **folder + descendant** leaves (B9 lore default).
- Tree collapsible; desktop default expanded.

### Starter seeds (first empty visit)

Offer once when story has **zero notes folders** (and preferably few/no notes — implementer: folders empty is enough):

| Seed name (default) |
|---------------------|
| Research |
| Continuity |
| Scene scraps |
| Promotions |
| Archive |

Dismissible; full rename/delete; never forced schema. Optional “Set up starter folders” if user dismissed.

### Smart piles (virtual)

| Pile | Rule |
|------|------|
| All | No pile filter |
| Unfiled | `folderId` null |
| Pinned | `pinned` |
| Armed | `includeInAi` |
| Recent | e.g. updated in last 14 days (implementer constant; document in DECISIONS) |

Piles compose with folder selection + type filter + search (AND). If confusing, folder selection + pile Unfiled = empty when viewing a folder — acceptable; prefer clearing pile when picking a folder or show empty state copy.

### Tags (thin)

- Optional list of short strings on the note.
- UI: chip input on editor + chips on card/row.
- Filter: click chip or “tag:” / multi-select chips in toolbar (implementer lean).
- Search matches tag strings.
- No global tag admin, no colors required v1, no AI.

### Density

- Segmented **Cards | List** (B8 pattern).
- Pref: global or per-desk localStorage (`sl-notes-browse-view`); smart default optional (≥12 notes → List if no pref) — nice, not required.

### Chat rail

Unchanged morals: optional open/close; `chatType: notes`; desk privilege `allNotes` + `focusedNote`; focused note = active note tab’s id when a note tab is focused, else last Browse selection if any.

---

## AI / bridges (unchanged)

| Rule | Status |
|------|--------|
| `includeInAi` + `includeNotes` double-gate | Unchanged |
| Editor never Notes | Unchanged |
| Notes desk always-on list/focus reads | Unchanged |
| note-proposal / note-split / promote tray | Unchanged |
| Save message as note / H6 highlight→note | Unchanged; new notes default Unfiled, unarmed, no tags |
| Folders/tags in RAG entity text | **No** — do not append folder path into index text for retrieval bias |

---

## Export / import

- Story export includes `notes.folderId`, `notes.tags` (or equivalent), and `orgFolders` rows with `kind: notes`.
- Import remaps folder ids; missing folders → Unfiled.
- Older packages without note folders/tags → Unfiled, empty tags.
- Still **no** RAG chunk export.

---

## Phasing (slices — implement only after promote)

| ID | Scope |
|----|--------|
| **NO0** | This design locked; gap audit vs live NotesTool/NoteList/folders engine |
| **NO1** | Open-tabs shell: sticky Browse + multi note tabs + per-story persist; wire editor into tabs |
| **NO2** | Browse main Cards\|List + toolbar (type, pin, armed); leaf chrome + hover actions; click → tab |
| **NO3** | Folders: schema `notes.folderId` + `orgFolders.kind=notes`; API; tree sidebar; DnD/Move; export/import |
| **NO4** | Title+body search; path crumbs; this-folder-only; smart piles All/Unfiled/Pinned/Armed/Recent |
| **NO5** | Thin tags (schema + UI + filter/search); starter folder seeds + empty-state |
| **NO6** | Guide blurb + DECISIONS.md + backlog Done |

**Suggested order:** NO0 → NO1 → NO2 → NO3 → NO4 → NO5 → NO6.

Tags may land in NO5 as above, or earlier if schema batch with NO3 is cheaper — do not block folders on tags polish.

### Fast-follow (named, not T7 blocking)

| ID | Scope |
|----|--------|
| **NO-FF1** | Bulk multi-select: arm / move / type / delete |
| **NO-FF2** | Needs-promote pile / richer promote surfacing |
| **Relations note pins** | Separate talk-list item — graph leaves, not Notes desk |

---

## Non-goals (v1)

1. Notes-native graph or board view  
2. Relations note-pins implementation  
3. Multi-folder membership  
4. Folders or tags affecting RAG / chat context  
5. Bulk multi-select (FF)  
6. Changing double-gate / Editor Notes access  
7. Merge notes, span-in-note rework, Lexical notes body as editor parity project  
8. Replacing type enum; forcing types = folder roots  
9. Global tag taxonomy CMS  

---

## Acceptance (design-level)

- [ ] Browse is the large-pane home with Cards|List  
- [ ] Multiple notes open as tabs; Browse sticky; tabs survive reload per story  
- [ ] Folders nest ≤3; Unfiled; delete reparents; export/import round-trips  
- [ ] Search hits body; crumbs; optional folder scope  
- [ ] Piles All/Unfiled/Pinned/Armed/Recent  
- [ ] Thin tags on notes; filter/search; no AI effect  
- [ ] Hover pin/arm/delete/Move; click opens tab  
- [ ] Chat rail + gates + proposals behave as today  
- [ ] No Notes graph shipped  

---

## Worked example

Writer dumps research from Research desk → many `research` notes land Unfiled.  
Browse → Cards → search body “Nightingale” → open two notes in tabs.  
Move both into folder `Research / Ops` (or one-by-one until bulk FF).  
Pin “Nightingale file summary”; arm it for WB chat double-gate later.  
Tag `lizzy`, `prior-ops`.  
Relations later may pin the note onto a character edge — **not** T7.

---

## Document history

- **2026-08-07** — Design locked (grill axes 1–10). Job C; org hybrid C; shell C; browse C; folders B9+seeds C; search/piles B; leaves C; AI A; P3 slices NO0–NO6; thin tags in; graph out; Relations pins parked on talk list.
