# Notes & Outline ↔ Chat Bridges — Design

**Project:** Story Nexus Fork (`E:\StoryNexus-Fork`)  
**Status:** Design locked (2026-07-18) — not implemented  
**Audience:** Claude Code (implementation) + Hermes (architecture)  
**Related:** `docs/CURRENT_BACKLOG.md` P0.3 / continuity glue; `docs/Agent_Framework_And_Project_Memory_Design.md` (opt-in retrieval precedent); story export in `server/routes/stories.ts`

---

## 1. Problem

Notes and outline are first-class **human** tools, but models largely cannot see them:

- Default RAG = `lorebook_entry` + `chapter` only
- Story Notes (`notes` table) are never indexed or injected
- Outline is only loaded inside `outlineGenerator` (not general chat/scanner)
- Editor chat correctly stays canon-focused; other chats (brainstorm, world-building, research, general) need optional working-material context
- Story JSON export omits notes (and outline) even though they are persistent project data

---

## 2. Strata (roles, not separate products)

| Stratum | Store | Trust | Default model access |
|---------|--------|-------|----------------------|
| **S0 Capture** | Story Notes | Untrusted / contradictory OK | Opt-in only (double gate) |
| **S1 Plan** | Outline items | Intent, not canon | Opt-in only (double gate); outline-gen may keep feature-native read |
| **S2 Canon** | Lorebook + Codex + chapters | High | Default RAG (unchanged) |
| **S3 Meta** | Project memory | Distilled / approved facts | Opt-in (existing design) |

**Doctrine:** models default to **S2 only**. S0/S1/S3 require explicit includes. Working material ≠ canon until graduated (Codex/lorebook propose-approve or explicit promote).

---

## 3. Inclusion model (locked)

### Double gate — both default **OFF**

```text
item.includeInAi === true
    AND
chat.includeNotes|includeOutline === true
    → eligible for top-K retrieval into that chat
```

| Gate | Field | Default | Applies to |
|------|--------|---------|------------|
| Per-item | `includeInAi` | `false` | Each note; each outline item |
| Per-chat | `includeNotes` / `includeOutline` | `false` | Non-editor chats only |

### Which chats get toggles

| Chat type | Notes toggle | Outline toggle |
|-----------|--------------|----------------|
| Brainstorm | ✅ | ✅ |
| World-building | ✅ | ✅ |
| Research | ✅ | ✅ |
| General | ✅ | ✅ |
| **Editor** | ❌ never | ❌ never |

Editor stays **canon-only** (lorebook + chapter passages).

### Retrieval behavior

- Still **top-K by relevance**, not full dump of all armed items
- Separate context **packet**, labeled non-canon, e.g.:

```text
[STORY NOTES — working material, not canon]
Only use as ideas/constraints if relevant; do not treat as established fact
unless it also appears in Codex/lorebook.
```

- Default hybrid search entity set **unchanged**: `["lorebook_entry", "chapter"]`
- New entity types: `"note"`, `"outline_item"` — only queried when chat toggles opt in
- **Index only when `includeInAi` is true**; toggle off or delete → `removeEntityFromIndex`
- Toggle on again → re-index from current row text (RAG is derived cache, not SoT)

### RAG vs DB (load-bearing)

| Action | `notes` / `outlineItems` row | RAG chunks |
|--------|------------------------------|------------|
| Create item, `includeInAi` false | Kept | None |
| Flip `includeInAi` on | Kept | Index |
| Flip `includeInAi` off | **Kept (original form)** | **Removed** |
| Delete item | Removed | Removed |
| Edit armed item | Updated | Re-index |

**Notes/outline rows always remain in original form when un-RAG’d.** Turning AI off never deletes the project piece.

### Index hygiene

Extend existing **`reconcile_index`** job (do **not** add a separate “orphan notes agent”):

Valid RAG keys for notes = notes with matching story + `includeInAi === true`  
Valid RAG keys for outline = outline items with matching story + `includeInAi === true`

Reconcile may only add/remove/update **chunks** — it must **never** delete note/outline rows.

---

## 4. Write path Chat → Notes (locked)

Both:

1. **Manual** — “Save message / selection as note”
2. **AI propose** — fenced proposal block (e.g. `note-proposal`) → accept/reject card (same spirit as `codex-proposal` / prose proposals)

No silent auto-write of notes from chat.

Promotion Notes/Outline → Lorebook/Codex/chapters remains separate (existing propose/approve or explicit promote flows).

---

## 5. Persistence & project packaging (locked recommendations)

These are **required** once Notes/Outline are treated as first-class workflow pieces:

1. **Treat `notes` (and outline items) rows as source of truth** — already true for normal DB use; do not use RAG as SoT.
2. **Add notes (+ `includeInAi`) to story export/import** — today `GET /stories/:id/export` omits notes; fix when implementing bridges (or as a prerequisite slice).
3. **Add outline items (+ `includeInAi`) to story export/import** — same gap; same packaging logic.
4. **Do not export RAG chunks** — after import, reindex from rows and flags (`includeInAi`).
5. **Project Saves timelines stay Codex/chapter-focused** unless note/outline history is explicitly requested later — current “Project Saves” ≠ full project bundle; story JSON export/import is the portable project package that must include notes/outline.

**Also true today (do not regress):**

- Notes persist in SQLite for normal app use (survive restart; cascade on story delete)
- Admin full DB export already includes `notes`
- Chapter editor notes (`chapters.notes` JSON) are a separate field from the Notes tool table

---

## 6. Implementation slices (suggested order)

| ID | Slice |
|----|--------|
| **N0** | Story export/import: include `notes` (+ future `includeInAi`); optionally outline in same pass |
| **N1** | `notes.includeInAi` + UI toggle/badge + bulk enable |
| **N2** | RAG `entityType: "note"` — index only when eligible; remove on off/delete; reconcile_index valid keys |
| **N3** | `aiChats.includeNotes` (+ outline flag) + toggles on all **non-editor** chats |
| **N4** | `chatContextService` notes (and outline) packets when both gates pass |
| **N5** | Save message/selection as note |
| **N6** | `note-proposal` parse + accept/reject UI |
| **O1–O4** | Parallel pattern for outline items + `includeOutline` |

Scanner stays canon-only unless a later explicit mode is designed (“check against included outline”) — **not** in v1 of this bridge.

---

## 7. Non-goals (this design)

- Default-on notes/outline in any chat
- Editor chat reading notes/outline via this bridge
- Silent chat→note learning every turn
- Merging Personal Agent Memory into SN
- Project Saves snapshot timelines for every note edit (unless reopened)
- Dumping all armed notes into every prompt (always top-K)

---

## 8. Acceptance criteria (bridges v1)

- [ ] Un-armed notes never appear in any model context
- [ ] Armed notes appear only in non-editor chats with Include notes on
- [ ] Toggle off removes RAG chunks; note row unchanged and still editable
- [ ] `reconcile_index` heals note/outline index drift without deleting rows
- [ ] Story export/import round-trips notes (and outline) including `includeInAi`
- [ ] Import does not ship raw RAG chunks; reindex after import
- [ ] Manual save-as-note and note-proposal accept paths work
- [ ] Editor chat behavior unchanged (canon only)
- [ ] Decisions recorded in `DECISIONS.md` when built

---

*Locked in conversation 2026-07-18. Update this file if gates or chat scope change.*
