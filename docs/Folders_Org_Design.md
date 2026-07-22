# Folders (Cosmetic Org) — Design

**Status:** **Design locked 2026-07-21** (grill) — **shipped 2026-07-21** (F0–F5)  
**Priority:** **P2** (after Lorebook browse density **B8** / L0–L3)  
**Related:** `docs/Lorebook_Browse_Density_Design.md` (list/cards compose with folder main pane)

---

## Job

User-created **folders** to organize:

1. **Lorebook entries** — per story (and series), **per category**  
2. **Chat sessions** — all chat lists, per story + **chatType**

**Cosmetic / UI only:** filing and navigation. **No** effect on RAG, Codex, agent context, or “what the model knows.”

---

## Locked decisions (grill 2026-07-21)

| # | Axis | Lock |
|---|------|------|
| **1** | Nesting | Nested folders, **max depth 3** |
| **2** | Architecture | **One folder engine** + thin UIs (lorebook tree, ChatList indent) |
| **3** | Scope | Lore: `(storyId \| seriesId) + category`. Chats: `(storyId + chatType)`. **Global** lore entries: **unfiled only** (no global folder tree v1) |
| **4** | Membership | Tree of folders + leaves; each entry/chat in **at most one** folder; `folderId` null = **Unfiled** |
| **5** | Delete folder | **Move contents** to parent folder, or **Unfiled** if deleting a root folder — **never** cascade-delete entries/chats |
| **6** | Interaction | Context/menu (new, rename, delete, Move to…) **and drag-and-drop** in v1 |
| **7** | Lorebook UI | **Folder tree sidebar** + main pane; Cards\|List applies to **leaves** in the current selection |
| **8** | Chat UI | **Nested indent** inside existing `ChatList` (collapse folders); one-column rail |
| **9** | Search | Default: whole category/desk + **path crumb**; optional **“this folder only”** |
| **10** | Export | Folders **round-trip** in story (and series) export/import; still non-AI |
| **11** | Build order | **B8 Cards\|List first**, then folders |
| **12** | Priority | **P2** |

---

## Cosmetic boundary

Folders **must not** change:

- RAG retrieval / injection  
- Codex / proposal context assembly  
- Graph semantics  
- Whether an entry is disabled / included in AI (those stay entry fields)

Folders **may**:

- Appear in export packages as org metadata so project layout survives machines  
- Affect only browse/list UI and user filing  

---

## Data model (sketch — names flexible at implement)

### `orgFolders` (or `folders`)

| Column | Notes |
|--------|--------|
| `id` | PK |
| `kind` | `lorebook` \| `chat` |
| `storyId` | set for story-scoped lore + all chats |
| `seriesId` | set for series lorebook folders (mutually exclusive with storyId per row rules) |
| `category` | lorebook only — must match entry category |
| `chatType` | chat only |
| `parentId` | null = root folder; enforce depth ≤ 3 |
| `name` | display |
| `order` | among siblings |
| `createdAt` / `updatedAt` | |

**Depth rule:** walking `parentId` chain length ≤ 3; reject deeper creates/moves.

### Leaves

- `lorebookEntries.folderId` nullable — folder must match entry’s scope + category  
- `aiChats.folderId` nullable — folder must match chat’s `storyId` + `chatType`  

**Unfiled:** `folderId IS NULL`.

### Validation

- Cannot place a Character entry in a Location folder  
- Cannot place an Editor chat in a Research folder  
- Series entry → series folder only; story entry → story folder only  
- Moving entry across category: not via folder (category change is separate); folder cleared or blocked  

---

## UI

### Lorebook

```
[ Category tabs ]
[ Tree sidebar     ] [ Toolbar: search | this-folder-only? | Cards|List | sort ]
[ Unfiled          ] [ Leaves in selection — cards or compact rows           ]
[ Folder A         ]
[   Sub B          ]
[   ...            ]
```

- Selecting a folder shows its **direct** leaves (and optionally “include subfolders” — **default direct only** for v1 unless implementer finds empty-folder UX bad; prefer **direct only** + expand to file into children).  
- **v1 selection:** show leaves in folder **and descendants** (common finder pattern) **or** direct only — **lock at implement default: folder + descendants** for fewer “where did it go?” moments; document in DECISIONS if flipped.  
- **Recommended default:** selected folder shows **all descendant leaves** (not only direct). Nested structure still visible in sidebar.

### Chats (`ChatList`)

- Same rail width; folders as collapsible indented sections  
- Chats indented under folder; Unfiled group at top or bottom (prefer **Unfiled first**)  
- DnD chat → folder; DnD folder → folder (respect depth)  
- New chat: created **Unfiled** unless “new in folder” action from folder context menu  

### Search

- Default query over full category (lore) or full chatType list (chats)  
- Result row shows **path crumb** (`Cast / Antagonists`)  
- Toggle: restrict to selected folder (+ descendants)  

---

## Delete / move semantics

| Action | Result |
|--------|--------|
| Delete folder | Children folders re-parent to deleted node’s parent; leaf `folderId`s retarget to that parent or null if root deleted |
| Delete entry/chat | Unchanged existing delete; folder unchanged |
| DnD leaf onto folder | Set `folderId` |
| Folder onto folder | **"Move to…" dialog/context-menu only, not DnD** — implementation deviation from this doc's original "DnD folder onto folder" line, decided during build following `OutlineTree.tsx`'s own precedent of not unifying cross-level drag-and-drop (see its doc comment). Leaf-onto-folder DnD ships as designed; folder reparenting is a picker dialog instead, same depth/scope validation either way. |

---

## Export / import

- Include folder rows + `folderId` on entries/chats in story (and series) packages  
- Import remaps IDs; restore tree  
- Older packages without folders → all Unfiled  

---

## Non-goals (v1)

- AI/RAG awareness of folders  
- Multi-folder membership / tags-as-folders  
- Depth > 3  
- Global-level lore folder trees  
- Replacing category tabs or chatType desks  
- Notes desk “folders” unless Notes already uses `ChatList` — **if** Notes has a chat list, it gets folders via same chat engine automatically  

---

## Dependency

1. **B8** Lorebook Cards\|List (`docs/Lorebook_Browse_Density_Design.md`) — **first**  
2. Then this feature: F0–F5  

Chat folders do not strictly need B8 but **shared engine** should still land in one program after list density so lore main pane isn’t only cards.

---

## Implementation slices

| Slice | Work |
|-------|------|
| **F0** | Schema + migrations + folder CRUD API + validation (scope, depth, kind) |
| **F1** | Attach `folderId` on lore entries + chats; move endpoints |
| **F2** | Lorebook tree sidebar + DnD + menus; main pane respects selection |
| **F3** | ChatList indent tree + DnD + menus (all desks using ChatList) |
| **F4** | Search default + “this folder only” + path crumbs |
| **F5** | Export/import round-trip; DECISIONS.md; backlog Done |

---

## Acceptance criteria

- [x] User can create/rename/nest folders (≤3) in lorebook per category (story + series)  
- [x] User can same for every ChatList desk (verified via Notes rail; same shared `ChatList.tsx`, so Editor/Outline/WB/Brainstorm inherit identically)  
- [x] Entries/chats move via menu (Move to… dialog) and DnD (leaf→folder); one folder each or Unfiled  
- [x] Deleting a folder does not delete leaves — verified live: subfolder + filed entry both survive, reparented  
- [x] Search finds across folder by default; optional folder-scoped (the sidebar's "Include subfolders" toggle IS the folder-scope control — `entriesByCategory` is already folder-filtered before `SearchFilter` runs); crumbs shown on cards/rows  
- [x] Export/import preserves folder tree — verified live: story export→import round-trip, new folder id, filed entry's `folderId` correctly remapped  
- [x] No change to RAG/Codex behavior attributable to folders — `folderId` is never read by `chatContextService.ts`/RAG indexing/Codex proposal assembly  
- [x] Cards\|List still works in lorebook main pane — re-verified live after F2's changes  

---

## Document history

- 2026-07-21 — Grill locked (cosmetic org); this doc created  
- 2026-07-21 — F0–F5 shipped. `orgFolders` table (lorebook: `level`+`scopeId`+`category`, matching `lorebookEntries`' own scoping — not a separate `storyId`/`seriesId` pair as originally sketched; chat: `scopeId`=`storyId`+`chatType`), `folderService.ts` (depth/scope validation, delete-with-reparent), `folders.ts` route, `LorebookFolderSidebar.tsx` + `ChatList.tsx` folder-tree upgrade (shared `src/features/folders/` module: hooks, `folderTree.ts`, `FolderContextMenu`/`MoveToFolderDialog`/`FolderNameDialog`/`DraggableLeaf`/`FolderDropZone`). One deviation from the original design sketch: folder-onto-folder reparenting is "Move to…" only, not DnD (see Delete/move semantics table) — leaf-onto-folder DnD ships as designed. Live-verified in the Browser pane: folder CRUD, delete-reparent (both kinds), export/import round-trip, B8's Cards\|List/search/sort regression-free. See `docs/CURRENT_BACKLOG.md`'s B9 entry.
