# Lorebook Browse Density (Cards ↔ List) — Design

**Status:** **Design locked 2026-07-21** (grill) — **shipped 2026-07-21** (L0–L3)  
**Priority:** **P2** (UX debt / scale)  
**Touch surface:** primarily `LorebookEntryList.tsx` + `LorebookBrowsePanel` toolbar  

---

## Job

Let the user switch Lorebook **Browse** between **card grid** and **compact list** so novel-scale entry counts stay scannable. Keep existing search, sort, category tabs, and open-as-tab behavior.

---

## Locked decisions (grill 2026-07-21)

| # | Axis | Lock |
|---|------|------|
| **1** | Default | **Smart:** if **no** saved pref and current category count ≥ **N**, default **List**; else **Cards**. User toggle overrides and sticks. |
| **2** | Threshold N | **12** (per **selected category** count, not whole lorebook) |
| **3** | Pref scope | **Global** `localStorage` (all stories share one cards/list choice) |
| **4** | List row | Thumb (if image) · **name** · level badge · importance · up to **2–3** tag chips (truncate). **No** category chip while category tab filters. **No** description line on row. |
| **5** | Row actions | Enable / delete on **hover/focus** (desktop). Touch: always-visible or compact overflow as implementer fit — must remain reachable. |
| **6** | Toggle chrome | Segmented **Cards \| List** control on the same toolbar row as sort (beside search/sort). |
| **7** | v1 non-goals | See below |
| **8** | Priority | **P2** |

---

## Unchanged (v1)

- Category tabs (desktop) / select (mobile)
- Search: name, description, tags (`SearchFilter`)
- Sort: name · category · importance · created (same control for both views)
- Show disabled switch
- Click → `onOpenEntry` → entry tab (not inline dialog)
- Card grid layout/content when Cards selected
- Schema, editor, RAG, Natural View — **untouched**

---

## Behavior detail

### Preference key

Suggested: `sn-lorebook-browse-view` = `"cards" | "list"`.

- If key **missing**: apply smart default from category count ≥ 12.  
- If key **set**: always use stored view (ignore N until user clears storage).  
- Changing category does **not** reset a stored preference. Smart default only re-evaluates when pref is absent (e.g. first visit or after clear).

### Smart default edge cases

- Empty category → Cards (or empty state; irrelevant).  
- Count crosses 12 later with **no** pref yet → next mount of that browse session can recompute; once user toggles, stick forever.  
- Implementer may recompute smart default only on first paint when pref absent (simplest).

### List row

- Single horizontal row, ~32–44px target height.
- Tags: show first 2–3; overflow as `+N` or ellipsis — no wrapping to multi-line body.
- Disabled entries: same opacity treatment as cards.

### Cards view

- Keep existing `md:grid-cols-2 lg:grid-cols-3` card content (description clamp, full tag wrap, header actions as today — or optionally align card actions to hover later; **not required**).

---

## Non-goals (v1)

1. **Virtualized** list (react-window etc.) — add only if real scroll jank at scale  
2. Clickable **column-header** sorting  
3. **Multi-select / bulk** delete  
4. **Folder / nested tree** browse  
5. Changes to entry **editor** or tab open behavior  
6. **Per-category** or per-story saved view mode  

### Parked nice-to-haves (post-v1)

- Column-header sort  
- Multi-select / bulk delete  
- Virtualization if needed  

**Folders / nested tree:** **promoted** to own design — `docs/Folders_Org_Design.md` (P2 **B9**, after this B8 ships). Not part of L0–L3.  

---

## Implementation slices

| Slice | Work |
|-------|------|
| **L0** | `localStorage` pref + segmented Cards \| List control in list toolbar |
| **L1** | `LorebookEntryRow` compact layout; branch render list vs grid |
| **L2** | Smart default when pref absent (category count ≥ 12) |
| **L3** | Touch action affordance check; quick pass on Linear chrome spacing |

**Est. size:** small–medium; localized to lorebook browse components.

---

## Acceptance criteria

- [x] User can switch Cards ↔ List; choice persists across reloads (global)  
- [x] First visit / no pref: List when selected category has ≥ 12 entries, else Cards  
- [x] List rows are clearly denser than cards; no description block on row  
- [x] Search + sort work identically in both views  
- [x] Open entry, enable, delete still work  
- [x] No schema or editor regressions  

---

## Document history

- 2026-07-21 — Grill locked; this doc created  
- 2026-07-21 — L0–L3 shipped: localStorage pref + segmented toggle, `LorebookEntryRow`/`LorebookEntryCard` split, smart default, hover/touch row actions. Live-verified in Browser pane. See `docs/CURRENT_BACKLOG.md`'s B8 entry.
