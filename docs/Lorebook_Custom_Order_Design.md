# Lorebook Custom Drag Order (T13)

**Status:** ✅ **Design locked 2026-08-23** — **LO0–LO5 implemented in full (2026-08-23)**. See `docs/CURRENT_BACKLOG.md`'s "Lorebook custom drag order (T13)" row and `DECISIONS.md`'s "Lorebook Custom Drag Order (T13, LO0–LO5)" entry for the full trail; this doc is the original design record.  
**Talk list:** `docs/SN_Planning_Talk_List.md` · **T13**  
**Backlog:** P3 · slices **LO0–LO5**  
**DECISIONS:** “Lorebook Custom Drag Order (T13) — Load-Bearing Decisions”

**Related live code:**
- Sort UI: `src/features/lorebook/components/LorebookEntryList.tsx`
- Sort pref (localStorage): `src/lib/useLorebookSortOption.ts` — today `name | category | importance | created` (+ **`custom`** when built)
- Schema: `server/db/schema.ts` → `lorebookEntries` (**add** `manualOrder`)
- Folder filing DnD (≠ rank alone): `DraggableLeaf` + folder drop zones
- Reorder precedents: Outline `PATCH /api/outline/reorder`; Chapters tool dnd-kit; Timeline fuzzy `manualOrder`

---

## Axis 1 — Job ✅ LOCKED 2026-08-23

**Job:** Author-pinned **browse rank** for lorebook entries so lists match how the writer thinks about the cast/world — not A–Z noise.

| Lock | Detail |
|------|--------|
| Meaning | **Cosmetic / author rank only** — no RAG ranking, no Codex, no chat inject order, no export/EPUB law, no Relations graph layout |
| Persistence | **DB-backed** `manualOrder` on `lorebookEntries` — survives sessions and machines; **not** localStorage-only ranks |
| Sort mode | Fifth option **Custom** alongside Name / Category / Importance / Created. Existing derived sorts unchanged |
| When drag applies | Drag-reorder **only while sort = Custom**. Other sorts stay non-drag |
| Surfaces | **List and Card** views both **display** and **drag-reorder** when Custom is selected |
| Folders | Custom order works **inside folder views** and Unfiled (bucket = Axis 2) |
| Not | Second folder system; not a replacement for Importance; not AI-enforced priority |

---

## Axis 2 — Order scope bucket ✅ LOCKED 2026-08-23 (Lean A)

| Lock | Detail |
|------|--------|
| Bucket | Peers = same **`level` + `scopeId` + `category` + `folderId`** (`folderId` null = **Unfiled**) |
| Drag rewrite | Drop rewrites **only that bucket’s** `manualOrder` to dense 1..N |
| Cross-folder | Filing DnD stays; leave bucket on file-out; destination **appends** (Axis 3) |
| Multi-folder browse | Display keeps each folder group’s internal order. **Rank drag only** when visible set is a **single bucket** |
| Not | Category-wide spine; scope-wide ignoring category; dual override fields |

---

## Axis 3 — Defaults & migration ✅ LOCKED 2026-08-23 (Lean A)

| Lock | Detail |
|------|--------|
| Column | `manualOrder` **integer NOT NULL**, default `0` |
| Unranked / ties | After ranked `1..N`: `createdAt ASC`, then `id ASC` |
| New entry | **Append:** `max(manualOrder in bucket)+1` (empty/all-zero → `1`) |
| File / category change | Destination **append** |
| Source after move | **No** eager densify; densify on next Custom drag in that bucket |
| Migration (LO0) | Per bucket: existing rows **name A–Z** → dense `1..N` |
| Custom sort key | `manualOrder ASC`, then `createdAt ASC`, then `id ASC` |

---

## Axis 4 — Drag intents (reorder vs filing) ✅ LOCKED 2026-08-23 (Lean A)

| Lock | Detail |
|------|--------|
| Sort ≠ Custom | Leaf drag = **file** only |
| Custom + multi-bucket | Rank drag **off**; filing **on** |
| Custom + single-bucket | **Dual drop:** peer gap/index → reorder; folder/Unfiled → file + append |
| Affordances | Sortable grip/cursor when rank-drag eligible; folders still highlight |
| Not | Reorder-mode toggle; freeze filing on Custom; dual handles; modifier-key filing |

---

## Axis 5 — Search & filters under Custom ✅ LOCKED 2026-08-23 (Lean A)

| Lock | Detail |
|------|--------|
| Eligible | Custom + single bucket + **empty** search |
| Search active | Show matches in Custom order; **rank drag off** |
| All categories | Rank drag **off** |
| Show disabled | Disabled keep `manualOrder`; drag on when otherwise eligible |
| Filtered merge reorder | **Out of v1** |

---

## Axis 6 — Cards under Custom ✅ LOCKED 2026-08-23 (Lean A)

| Lock | Detail |
|------|--------|
| Display | Grid chrome, ordered by Custom |
| Drag model | Linear **1..N** row-major; dnd-kit **`rectSortingStrategy`** |
| Escape hatch | Vertical stack of cards if rect+folder collision is too hard — still cards, not List rows |
| Not | 2D pinboard / x,y fields; not cards-display-only |

---

## Axis 7 — API + slices ✅ LOCKED 2026-08-23 (Lean A)

### API

| Lock | Detail |
|------|--------|
| Route | `PATCH /api/lorebook/reorder` |
| Body | `{ orderedIds: string[] }` — full desired order for **one** bucket |
| Server | Load by ids; require shared `level+scopeId+category+folderId`; else **400**; txn write `manualOrder = 1..N`; touch `updatedAt` |
| Create / file / category move | Append `max+1` in destination bucket |
| General PUT | **Not** primary reorder path — do not rely on client-sent `manualOrder` for drag (prefer reorder route only; strip/ignore free-form order on CRUD if needed to avoid mass-assignment footguns) |
| Types | `LorebookEntry.manualOrder: number`; sort option `"custom"` |
| Client | RQ invalidate lorebook lists on reorder + folder assign |

### Slices

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **LO0** | Schema `manualOrder` + migration name A–Z → 1..N per bucket; types + API read | ✅ Done |
| **LO1** | `PATCH .../lorebook/reorder` + append on create/file/category change | ✅ Done |
| **LO2** | Sort option **Custom** + client sort (no drag yet) | ✅ Done |
| **LO3** | List + Cards drag when eligible; dual-drop; disable rules (multi-bucket / search / All categories) | ✅ Done |
| **LO4** | Polish: grip/cursor, errors, empty bucket; vertical-card escape hatch if needed | ✅ Done — escape hatch evaluated live and not needed; `rectSortingStrategy` had no collision issue against the folder sidebar |
| **LO5** | Optional short Guide blurb (Custom sort + folder drag; search disables reorder) | ✅ Done |

### Out of v1

- RAG / Codex / chat / export / Relations ordering  
- Filtered-merge drag while search  
- 2D pinboard positions  
- Category-wide custom spine (no folder in bucket key)

---

## Implementer notes

1. Folder filing already uses dnd-kit — extend carefully so Custom single-bucket sortable + folder droppables share one `DndContext` (or documented dual-context) without breaking B9 filing.  
2. `useLorebookSortOption` localStorage must accept `"custom"` and tolerate unknown legacy values → default `name`.  
3. Export/import: include `manualOrder` in story lorebook round-trip if other entry fields already round-trip (keep cosmetic rank portable).  
4. Do **not** change hybridSearch ranking or scanner priority by `manualOrder`.

---

## Decision log

- **2026-08-23 — Axis 1 Job:** Cosmetic DB Custom; List+Cards; within folders; no AI/export/Relations meaning.  
- **2026-08-23 — Axis 2 Scope:** Bucket `level+scopeId+category+folderId`; single-bucket rank drag.  
- **2026-08-23 — Axis 3 Defaults:** NOT NULL int default 0; append create/move; migrate name→1..N; no source densify on file.  
- **2026-08-23 — Axis 4 Drag intents:** Dual drop by target.  
- **2026-08-23 — Axis 5 Filters:** Search / All-categories → no rank drag.  
- **2026-08-23 — Axis 6 Cards:** Grid + linear 1..N rect strategy; vertical-card escape hatch.  
- **2026-08-23 — Axis 7 API+slices:** `PATCH /lorebook/reorder` + LO0–LO5; full design lock.
