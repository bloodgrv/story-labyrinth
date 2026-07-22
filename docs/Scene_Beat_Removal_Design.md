# Scene Beat Removal — Design

**Status:** **Design locked 2026-07-21** (grill + Lean) — **shipped 2026-07-22 in full** (SB0-SB8, including the table drop — see `DECISIONS.md`)  
**Priority:** **P3** until promoted  
**Related:** Concrete Beats stay (`docs` guide + `src/types/beats.ts`); Editor chat / selection rework stay; Lexical T2 (`docs/Lexical_Editor_Design.md`) independent

---

## Job

Remove the **Scene Beat** feature (inline AI generation cards in the manuscript: Alt+S, `SceneBeatNode`, `sceneBeats` table). It cluttered the editor and collided naming with **Concrete Beats**.

Writers generate prose via **Editor chat**, selection rework, and remaining prompts — not via embedded generator widgets in chapter body.

---

## Locked decisions (2026-07-21)

| # | Axis | Lock |
|---|------|------|
| **1** | Outcome | **Remove** Scene Beats entirely (UI, Lexical node, API, DB table, export/import). |
| **2** | Keep | **Concrete Beats** (tags/marks/detect). Editor chat. Selection rework. |
| **3** | Chapter JSON migration | **A** — on load (and any parse path): convert `scene-beat` nodes to a **plain paragraph** containing the **command text**. Do not discard silently; no permanent “dead” node class. |
| **4** | Prompt rows | `promptType: "scene_beat"` → treat as **`other`** (migrate label/filter); **do not** hard-delete user prompt rows. |
| **5** | Replacement product | **None** required. No Scene Beat v2. Optional later: slash → prefill Editor chat (separate feature if ever wanted). |
| **6** | Build order | **SB0–SB8** below; **SB1 before SB6** (migrate chapters before drop table). |
| **7** | Priority | **P3** until promoted / user says build. |
| **8** | Non-goals | See below. |

---

## What is Scene Beat (inventory for implementers)

| Layer | Touchpoints (non-exhaustive; re-grep at implement) |
|--------|-----------------------------------------------------|
| Editor | `SceneBeatNode`, `nodes/scene-beat/**`, `SceneBeatShortcutPlugin`, Insert dropdown, SlashCommand, `PlaygroundNodes`, ChapterReader node list |
| API/DB | `schema.sceneBeats`, `/api/scenebeats`, story + series export/import, demo seed, admin import/export |
| Prompts | `promptType: "scene_beat"`, system prompts, PromptForm/List, promptParser / lore resolvers (`useMatchedSceneBeat`, scene-beat-matched entries) |
| Types/docs | `SceneBeat` in `story.ts`, README screenshot, UPSTREAM/CLAUDE, DECISIONS naming notes, Lexical design node list |

**Not this feature:** `concreteBeats`, `BeatMarkNode`, `beatDetector`, Concrete Beats panel/guide.

---

## Migration detail (lock 3)

1. When loading chapter Lexical JSON (and import paths that parse chapter content), find nodes with type **`scene-beat`** (confirm exact type string in `SceneBeatNode` at implement).  
2. Replace each with a **paragraph** (or equivalent text node parent) whose text is the beat’s **command** string (empty command → empty paragraph).  
3. Generated prose already in adjacent nodes is untouched.  
4. After successful content migrate for a story/chapter set, delete orphaned `sceneBeats` rows (or drop table in SB6 after global migrate).  
5. Export: stop emitting `sceneBeats`. Import: ignore `sceneBeats` key if present (forward-compat with old backups).

**Failure mode to avoid:** Unregistering `SceneBeatNode` without migration → chapter open crash.

---

## Build slices

| Slice | Work |
|-------|------|
| **SB0** | This doc + backlog (done on lock). |
| **SB1** | Load/import migration: `scene-beat` → plain paragraph (command text). Smoke demo + chapters with beats. |
| **SB2** | Remove user entry points: Alt+S plugin, Insert/Slash/toolbar affordances (node may remain until SB3 if load still needs it — prefer SB1 first then full delete). |
| **SB3** | Delete editor surface: node, `scene-beat/`, shortcut plugin, ChapterReader registration, nodes index. |
| **SB4** | Remove `/api/scenebeats`, client hooks, API client methods. |
| **SB5** | Story/series export-import, demo seed JSON, admin dump — no `sceneBeats`. |
| **SB6** | Drizzle migration: **drop `sceneBeats` table** (only after SB1+SB5). |
| **SB7** | Prompts: `scene_beat` → `other` in UI/filters; strip scene-beat-only parser/resolvers/toggles. |
| **SB8** | Docs/README/guide cross-links/DECISIONS note/Lexical design inventory — removed; Concrete Beats only. |

---

## Non-goals

- Removing or renaming **Concrete Beats**  
- Building a replacement inline generator  
- Coupling to Lexical LE0–LE3 or dep pack 3  
- Deleting user custom prompts that were typed `scene_beat`  
- Rewriting Editor chat as part of this work  

---

## Verification

- Open chapter that previously had Scene Beats → no crash; command visible as normal paragraph  
- New chapter: no Alt+S / Insert Scene Beat  
- Story export JSON has no `sceneBeats`; import of old export ignores them  
- Concrete Beats mark/suggest/accept still works  
- `tsc` + lint clean on touched paths  

---

## Document history

| Date | Change |
|------|--------|
| 2026-07-21 | Lean-locked + fork lock: remove Scene Beats; migration A (command → paragraph); prompts → other; SB0–SB8; P3. |
| 2026-07-22 | Shipped SB0–SB8 in full, same day. SB6 (drop `sceneBeats` table) was held back initially — drizzle schema migrations run unconditionally before any JS boot-time sweep, so dropping the table in the same release as the content-migration sweep isn't provably safe without knowing whether another deployment has real Scene Beat data — then run after the user confirmed (via `AskUserQuestion`) no other install has real data. Migration `0047_misty_tempest.sql` applied and verified. See `DECISIONS.md`'s "Scene Beat Removal — SB1-SB8" entry for the full trail. |
