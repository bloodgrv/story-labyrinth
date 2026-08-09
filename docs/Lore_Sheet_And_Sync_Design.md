# Lore Sheet + Sync Loop (T5) — Design

**Project:** Story Labyrinth  
**Status:** **Design locked 2026-08-08** (grill) — **not started**  
**Priority:** **P3** until promoted  
**Talk list:** **T5**  
**Slices:** **FS0–FS8**  
**Audience:** Claude Code (implementation) + Hermes (architecture)  
**Related:** Natural View (retired by this design), `documentImportService.ts`, Codex propose/tray, place sheet L0–L5, `docs/Maps_V2_Sketch_Design.md`, `docs/Story_Timeline_Design.md`, `docs/Notes_Org_Browse_Design.md`, `docs/Chat_Panel_Integrations_Design.md`, `docs/CURRENT_BACKLOG.md`

---

## 1. Job

**Sheet-first source of truth.** The primary human/AI artifact on a lorebook entry is an open **Lore Sheet** (`sheetBody` markdown with category section templates). Structured SL fields (Codex, compiled description, placeState, cross-desk handoffs) are a **derived projection**.

**Done means:** You can write or AI-fill a Maisy-class (or category-equivalent) sheet and run **Sync structured fields** so a separate parse loop proposes packs into machine fields via existing tray/card Accept gates — no file re-import required. Re-sync is first-class.

**Not the job:** Replacing Maps canvas SoT, Relations edge mining from prose, or silent auto-apply of Codex.

---

## 2. Locked decisions (grill 2026-08-08)

| # | Axis | Lock |
|---|------|------|
| **1** | Job / SoT model | **A — Sheet-first.** Open sheet is SoT; structured fields are derived projection. |
| **2** | Storage | New column **`sheetBody`** (text) on `lorebookEntries`. Product name **Lore Sheet**. |
| **2b** | Description on Sync Accept | **A3 — Narrative sections only** compile into `description`. Core Identity + Appearance stay Codex-side; not duplicated into description by default. |
| **3a** | Category scope | **All lorebook categories** get a sheet surface. |
| **3b** | Character sections | See §3 table. |
| **3c** | Unknown `##` headings | **Fold into description** on compile (preserve heading text). |
| **3d** | Wardrobe | Explicit `## Wardrobe` preferred; **Attire under Appearance** also accepted. |
| **4** | Non-character packs | Per-category section allowlists (§4). Location: **placeState always**; mirror **Place Codex when tracking** (B2). |
| **5a** | Maps | Pending card: apply **layout brief** to map — **no** silent Excalidraw `sceneJson` rewrite. |
| **5b** | Timeline | **Pending pin(s)** from When/Summary for categories `event` and `timeline`. |
| **5c** | Notes desk | Optional **link / Open in Notes** — no dual-body mirror. |
| **5d** | Missing desk target | Structured sync still applies; cross-desk steps **skip + soft notice**; cards may **offer stub create**. |
| **6a** | Sync trigger | Explicit **Sync** control + optional offer after WB sheet-authoring. |
| **6b** | Gate | Always **propose → Accept** (no silent apply). |
| **6c** | Parser | **Hybrid:** deterministic `##` split + LLM row/list extraction. Feature key **`sheet_sync`**. |
| **6d** | Accept UX | **Split:** Codex tray for description/Codex patch; **separate** cards for map brief / timeline pins / note link. |
| **6e** | Conflicts | Labeled fields (**appearance**, **customFields**): **merge by label key**. List buckets (wardrobe/wounds/items): **full replace** with diff shown. |
| **7a** | Default UI | **Sheet-first** for all categories. Advanced = machine chrome + projection preview. |
| **7a2** | Natural View | **Retired** (was same fields, prettier skin — not a real sheet artifact). |
| **7b** | Editor chrome | Markdown + **sticky section outline** + per-category **Insert template**. |
| **7c** | AI layout path | WB injects category section skeleton; **`sheet-proposal`** fence updates sheet only on Accept; **Accept & Sync** chains the parse loop (two gates, one convenience click). |
| **7d** | Empty entry | New entries **seed** `sheetBody` with empty category heading template. |
| **8a** | RAG when sheet non-empty | Index **`name + sheetBody + codex + edges`** — **skip description** to limit duplication. Else legacy description path. |
| **8b** | Anchored WB context | Full **sheetBody** (size-capped). Non-anchored: RAG. |
| **8c** | placeState in index | After Accept, include key placeState lines; **de-dupe** against sheet layout section. |
| **9a** | Migration | **Lazy on open:** seed sheet from template + best-effort reverse compile from existing description/Codex. |
| **9b** | Reverse quality | Deterministic first; optional **Improve sheet with AI**. |
| **9c** | Document import | Fills **sheetBody + structured** in one draft. |
| **9d** | Natural View pref | Removed (no keep-alive mapping required). |
| **10** | Priority | **P3** until promoted. |
| **10d** | Naming | Column `sheetBody`; product **Lore Sheet**; slices **FS\***. |

---

## 3. Character section map → targets

| Section | Sync target |
|---------|-------------|
| **Core Identity** | `codexState.customFields` (`{label, value}[]`) |
| **Physical Appearance** | `codexState.appearance` |
| **Wardrobe** (optional) | `codexState.wardrobe` |
| **Personality & Temperament** | Narrative compile → `description` |
| **Background & Lifestyle** | Narrative compile → `description` |
| **Character Motivations** | Narrative compile → `description` |
| **Wounds / Marks** (optional) | `codexState.wounds` |
| **Items / Possessions** (optional) | `codexState.items` |

Doctrine unchanged: Codex = **concrete physical + identity labels**, not personality law. Psych module stays separate writing aid (`metadata.psychProfile`), not sheet SoT v1 unless a `## Psych` section is added in a later grill.

---

## 4. Other category packs (v1)

| Category | Sheet sections (v1) | Sync targets |
|----------|---------------------|--------------|
| **location** | Overview · Scale & nature · Holder & control · Landmarks · Exits & links · Layout notes · Atmosphere | Overview / Atmosphere / extras → description; Scale / Holder / Landmarks / Exits / Layout → **placeState**; Place Codex mirror when `codexEnabled` |
| **item** | Overview · Appearance · Properties · History · Ownership | Overview / History → description; Appearance / Properties / Ownership → structured (appearance-like and/or customFields) |
| **event** | Summary · When · Where · Who · Outcome · Aftermath | Summary / Outcome / Aftermath → description; When / Where / Who → customFields; **pending timeline pin(s)** from When/Summary |
| **note** | Free `##` sections | All → description; optional **Notes desk link** |
| **synopsis** | Logline · Summary · Themes · Scope | Narrative → description; Themes → tags or customFields |
| **starting scenario** | Situation · Stakes · Opening image · Constraints | All → description |
| **timeline** | Summary · Era · Sequence notes | Summary → description; Era → customFields; **pending timeline pin(s)** — does **not** auto-create active pins |

**Out of v1 sheet sync:** story-graph edge extraction, auto-active timeline pins, Excal scene mutation, psych-as-law, user-editable section-map editor (shipped/code templates only).

---

## 5. Sync loop (architecture)

```text
sheetBody (SoT)
    │
    ├─ Save sheet (no auto machine write)
    │
    ▼
Sync structured fields  (button and/or post–sheet-proposal offer)
    │
    ├─ Deterministic ## split by category pack
    ├─ LLM extraction inside sections (sheet_sync feature)
    │
    ▼
Proposals (never silent apply)
    ├─ Codex tray: proposedDescription (narrative compile) + proposedState (+ tags if any)
    ├─ Map card: layout brief apply (pending)
    ├─ Timeline: pending pin(s)
    └─ Notes: link pointer offer
    │
    ▼
User Accept per surface → projection + optional cross-desk effects
```

**Conflict policy:** merge-by-key for labeled Codex fields; replace+diff for list buckets.

**Feature endpoint:** `sheet_sync` (mirror `document_import` / other feature keys in AI Settings).

**WB fences:**

| Fence | Writes |
|-------|--------|
| `sheet-proposal` | `sheetBody` only (after Accept) |
| Existing `codex-proposal` | Still valid for targeted reworks; bulk profile authoring prefers sheet path |
| Sync output | Reuses Codex pending pipeline + desk-specific cards |

---

## 6. Authoring UI

1. **Default:** Lore Sheet editor (markdown, outline, Insert template).  
2. **Advanced / machine:** level, tags, importance, status, type, disabled, folder, raw Codex, history, image, place form extras as needed.  
3. **Retire** `NaturalEntryView` and its pref (`useNaturalEntryView`).  
4. New entry: seed empty headings for `category`.  
5. Existing entry first open after feature ship: lazy reverse compile into `sheetBody` if empty.

---

## 7. RAG / context

| Situation | Indexed / injected text |
|-----------|-------------------------|
| `sheetBody` non-empty | `name + sheetBody + formatCodexState + relationship edges` (**omit description**) |
| `sheetBody` empty | Legacy: `name + description + codex + edges` |
| placeState after sync | Include key lines; de-dupe vs Layout notes in sheet |
| WB chat anchored to entry | Full sheetBody (cap); plus normal proposal instructions for sheet mode |

Update `buildLorebookEntryText` in `ragIndexService.ts` accordingly; reindex on sheet save and on Sync Accept.

---

## 8. Migration & import

| Path | Behavior |
|------|----------|
| Lazy open | If `sheetBody` null/empty → template + deterministic reverse (Codex → Identity/Appearance/…; description → Overview or Personality block) |
| Improve sheet | Optional LLM pass (`sheet_migrate` or same `sheet_sync` reverse mode) |
| Document import | Draft includes **sheetBody** (reconstructed markdown from source) **and** structured fields (today’s shape) |
| Natural View | Delete codepath; no dual skin |

---

## 9. Non-goals (v1)

1. Silent auto-apply of Sync  
2. AI directly rewriting Excalidraw map scene from sheet  
3. Auto-active timeline pins (pending only)  
4. Dual-body mirror between lorebook `note` category and Notes desk artifacts  
5. PsychProfile as continuity law / scanner enforcement  
6. Story-graph edge extraction from sheet prose  
7. Keeping Natural View alongside Sheet  
8. Per-user custom section-map editor  
9. Deep mobile-first sheet polish beyond workable  
10. Replacing Codex snapshot / history model  

---

## 10. Implementation slices

| ID | Work | Depends |
|----|------|---------|
| **FS0** | Schema: `sheetBody` text nullable (+ optional `sheetSyncedAt` / dirty flag if implementer wants cheap dirty UX); Drizzle types; API CRUD pass-through | — |
| **FS1** | Category templates; sheet editor (outline + insert); default sheet-first UI; retire Natural View; seed on create + lazy open hook | FS0 |
| **FS2** | Deterministic reverse compile; optional Improve-sheet AI | FS1 |
| **FS3** | `sheet_sync` hybrid parse → Codex tray proposals; description A3 narrative compile; conflict merge rules | FS0–FS1 |
| **FS4** | `sheet-proposal` fence; WB skeleton inject; Accept & Sync chain | FS3 |
| **FS6** | RAG C1 + placeState de-dupe in `buildLorebookEntryText`; reindex hooks | FS0, FS3 |
| **FS5** | Cross-desk: map layout-brief pending card; timeline pending pins; note link pointer + stub offer | FS3 |
| **FS7** | Document import writes sheetBody + structured | FS1, FS3 |
| **FS8** | Diff UX, empty states, soft notices, template polish | FS3–FS5 |

**Recommended build order:** FS0 → FS1 → FS2 → FS3 → FS4 → FS6 → FS5 → FS7 → FS8.

---

## 11. Acceptance criteria (when promoted)

- [ ] Every category can create/edit a Lore Sheet with seeded headings  
- [ ] Natural View is gone; no regression on tags/level/Codex history in Advanced  
- [ ] Sync never silent-writes Codex/description; tray Accept required  
- [ ] Character Maisy-shaped sections map correctly to Codex + narrative description  
- [ ] Location Sync updates placeState; Place Codex when tracking; map card does not mutate scene without Accept  
- [ ] Event/timeline Sync can create **pending** pins only  
- [ ] Note category can link to Notes desk without cloning body  
- [ ] RAG uses sheetBody path when present; anchored WB sees sheet  
- [ ] Lazy migration produces a non-empty sheet from an old description+Codex entry  
- [ ] Document import lands a sheet + structured draft  

---

## 12. Document history

- **2026-08-06** — T5 parked on talk list / backlog (freeform sheets + write-back; maps split to Maps v2).  
- **2026-08-08** — Full grill locked (Axes 1–10). This doc created. P3 FS0–FS8. Not started until promote.
