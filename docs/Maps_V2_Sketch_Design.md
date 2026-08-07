# Maps v2 — Sketch Maps (Excalidraw) — Design

**Project:** Story Labyrinth  
**Status:** ✅ **Fully implemented (2026-08-07)** — all slices MV0–MV7 shipped in one continuous build. See `docs/CURRENT_BACKLOG.md`'s Maps v2 entries and `DECISIONS.md`'s "Maps v2 — MV0" through "— MV7" entries for the full load-bearing trail of each slice.  
**Talk list:** **Maps v2** (was parked “may fold into T5”; now its own locked design)  
**Related:** L0–L5 baseline (`Locations_And_Maps_Design.md`), Relations / story graph, place sheet `layoutMd`, Map image preset, Chat panel doctrine, T5 freeform sheets (sheets ≠ canvas), Story Timeline (time ≠ place)

---

## Context / job

Writers need to **draw places** at any scale — safehouse floor sketch, village, continent — with **AI able to draft** and the human **nudging boxes**.  

What shipped as “Story Map” (L3) is a **spatial relationship graph** between location entries (React Flow + `storyMapEdges`). That is the wrong job for “map the safehouse.” Place sheet **`layoutMd`** is a mono textarea. Map **images** are illustration only. Relations already covers **connection** graphs.

**Is this feature:** a **sketch-map editor** (Excalidraw-class) as the primary place-drawing surface, with in-app AI propose→accept into the canvas.

**Not this feature:**
- CAD walls/doors topology (Arcada-class)
- Replacing **Relations**
- Story **Timeline** (chronology)
- Freeform lore **sheets** (T5 — prose/sheet body, not the canvas)
- Image-as-SoT cartography

---

## Locked decisions (2026-08-06 grill)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Job | **Sketch maps** — “AI sketch me the safehouse, I nudge the boxes.” |
| **2** | Scale | **One canvas class**, multi-scale: room / building / village / region / continent (and free thematic maps). |
| **3** | Sidebar | **Remove** Story Map **graph** tool from the sidebar. |
| **4** | Canvas home | **Same sidebar slot** — successor tool hosts the sketch editor (label lean: **Maps**). |
| **5** | Connections | **Relations** remains the connection graph. Do **not** rebuild spatial edge UX in v1. |
| **6** | Ownership | **Hybrid:** maps may be **location-owned** (link to a location lorebook entry) **or** **free story maps** (no required location). Optional link either way. |
| **7** | SoT | **Excalidraw scene JSON** is SoT for a map. **`layoutMd`** is **export / one-shot import / legacy only** — not co-equal SoT. **Images never SoT** (unchanged). |
| **8** | L3 graph data | **Deprecate UI** for `storyMapEdges` / `storyMapLayout`. No v1 rebuild of contains/road_to board. Data may remain in DB until a cleanup slice; tool must not present the old graph as the product. |
| **9** | Tool UX | **List → canvas:** Maps tool lands on a **list/browser of maps** for the story; open one to edit. Create map (free or attach/create location). Lore location entry: **Open map** (opens or creates the location-linked map). |
| **10** | AI | **In-app only in v1** — chat proposes scene content → **Accept** → apply to Excal scene (Element Skeleton / `updateScene`). No silent writes. **MCP server out of v1 scope** (may wrap same API later). |
| **11** | Stack | Embed **`@excalidraw/excalidraw`** (MIT). Theme to SL chrome. **No tldraw** (commercial SDK license). **No** deep merge of Arcada/Spacory into Excalidraw. |

---

## Core model (illustrative)

```text
story
  └─ storyMaps[]                    # sketch documents
       · id, storyId
       · title
       · ownership:
           locationId?              # optional — location-owned when set
           # free story map when locationId null
       · sceneJson                  # Excalidraw elements + appState (SoT)
       · updatedAt, …
       · optional: thumbnail blob/path

location entry (lorebook, category location)
  · placeState.layoutMd             # legacy / export target — NOT live SoT
  · affordance: Open map → storyMap where locationId = this
  · scale / floorLabel / etc. unchanged for place sheet

Relations (storyGraphEdges)         # unchanged — people/factions/facts links
storyMapEdges / storyMapLayout      # deprecated UI; ignore in Maps v2 tool
```

**SoT:** `storyMaps.sceneJson` (name flexible at implement).  
**Illustration:** lorebook Map/Mood image presets; optional PNG export of canvas (like old Story Map export) — never re-imported as SoT.  
**Text bridge:** export scene → markdown/ASCII into `layoutMd` or clipboard; optional “paste ASCII → propose sketch” once.

```text
AI / human edit canvas  →  sceneJson (SoT)
                              ├─ optional export → layoutMd / note
                              └─ optional feed → map image brief
Map PNG  ← illustration only
```

---

## UI surfaces

| Surface | Role |
|---------|------|
| Workspace tool **Maps** (replaces **Story Map** slot) | List of story maps → open Excal canvas; New map (free / link location / create location+map) |
| Location lore entry | **Open map**; show whether a linked map exists |
| Place sheet | Keep light fields; **Layout** field becomes legacy/export helper, not the primary map editor |
| Chat (WB / Maps-adjacent) | Propose sketch / patch scene → Accept card → write `sceneJson` |
| Export | Canvas PNG/SVG optional; story export must round-trip `storyMaps` |

**List columns (illustrative):** title, linked location name (or “Story map”), scale badge if location-linked, updated.

---

## AI (v1 in-app)

| Path | Behavior |
|------|----------|
| Propose full sketch | Fenced proposal (e.g. `map-sketch-proposal`) with Excal **element skeleton** or compact intent the server/client converts via `convertToExcalidrawElements` |
| Propose patch | Add/replace/delete elements by id / label; Accept merges into scene |
| Doctrine | **Panel owns** map artifact; chat **proposes**; **Accept only**; trays Mark-done if tray-shaped |
| Not v1 | Standalone MCP server, silent auto-apply, continuous multiplayer collab |

Prompting should allow multi-scale: “top-down ink safehouse,” “schematic village,” “continent with labeled regions” — still boxes/lines/text, not GIS.

**T5 overlap:** “ASCII stuck in chat” for **maps** is largely solved by Maps v2 Accept→scene. T5 remains **freeform sheets** + any non-map layout write-back and RAG indexing of placeState/sheet body.

---

## Migration / L3 cleanup

| Item | v1 expectation |
|------|----------------|
| Sidebar tool id | Replace `story-map` with `maps` (or keep id, change chrome — implementer; user-facing **Maps**) |
| Guide `locations-maps.mdx` | Rewrite Story Map section for sketch Maps |
| Existing `storyMapEdges` | No UI; optional later data drop migration |
| Existing `layoutMd` | Preserve text; offer **Convert to sketch** once per location when opening Maps |
| Story JSON export/import | Add `storyMaps`; keep or drop edge export per cleanup slice (document in DECISIONS at ship) |

---

## Phasing (slices — implement only after promote)

| ID | Scope | Status |
|----|--------|--------|
| **MV0** | Schema: `storyMaps` (title, storyId, optional locationId, sceneJson); API CRUD; story export/import stub | ✅ Done 2026-08-06 |
| **MV1** | Sidebar: retire graph Story Map UI; **Maps** list → empty/detail shell | ✅ Done 2026-08-06 |
| **MV2** | Embed Excalidraw; load/save sceneJson; theme; basic undo native to Excal | ✅ Done 2026-08-06 |
| **MV3** | Create flows: free map · link location · from location Open map; list metadata | ✅ Done 2026-08-06 |
| **MV4** | layoutMd bridge: export ASCII/md; optional import-once convert propose | ✅ Done 2026-08-06 |
| **MV5** | AI: map-sketch proposal fence + Accept → scene (full replace only — per-element patch/merge deferred) | ✅ Done 2026-08-07 |
| **MV6** | PNG export of canvas (SVG dropped, PNG covers the use case); Guide + kill dead graph copy | ✅ Done 2026-08-07 |
| **MV7** | Soft-deprecate leftovers (hide edges API from UI — already true since MV1; schema/route comments marked deprecated; DB drop deliberately not done, stays optional/later) | ✅ Done 2026-08-07 |

**Suggested order:** MV0 → MV1 → MV2 → MV3 → MV4 → MV5 → MV6 → MV7.

Promote build only on explicit user request; design-locked ≠ started.

### Implementation clarifications (locked 2026-08-06)

| # | Question | Decision |
|---|----------|----------|
| a | `storyMaps` thumbnail (list view) | **Yes, in v1.** Rendered from the scene on save, shown in the Maps list. |
| b | MV4 "Convert to sketch" from `layoutMd` | **Dumb-but-honest.** Drops the existing `layoutMd` text verbatim into a single text element on a fresh scene — no parsing/inference of rooms or layout structure. User draws the real sketch from there. |
| c | MV5 AI proposal fence shape | **Model emits an Excalidraw Element Skeleton array directly** (rects/text/arrows/labels with x/y/width/height, etc.), converted client-side via Excalidraw's own `convertToExcalidrawElements`. No custom intermediate DSL to design, build, or keep in sync. |
| d | Sidebar tool id | **Keep the existing `story-map` id/route** — swap the component/content and relabel to "Maps," don't touch the id, to avoid churn across nav references. |

---

## Non-goals (v1)

- Arcada/Spacory/Aedifex CAD or 3D embed  
- tldraw  
- Forking Excalidraw for true custom wall element types  
- Replacing Relations or rebuilding `storyMapEdges` board  
- MCP server shipping  
- Image-as-SoT · silent AI writes  
- GIS / lat-long  
- Merging into T5 sheet redesign  

---

## Acceptance (design-level)

- [x] Sidebar **Maps** opens **list → canvas**, not React Flow location graph — live-verified MV1/MV6, confirmed unreachable via a Vite build module-count drop  
- [x] Free story map **and** location-linked map both work — live-verified MV1/MV3 (create both, "Open map" affordance, resolved location badges)  
- [x] Scene survives reload; story export/import includes maps — live-verified MV2 (draw → reload → persisted) and MV0 (full export→import round-trip, `locationId` correctly remapped)  
- [x] AI sketch propose → Accept lands on canvas; user can nudge — live-verified MV5 against a real reachable cloud model, first such verification in this project's propose→accept history  
- [x] `layoutMd` not required to edit the live map — true from MV2 onward (a map's own `sceneJson` is independent of `layoutMd`); MV4 adds an optional bridge both directions, never a requirement  
- [x] Relations unchanged; Timeline unchanged — neither touched by any Maps v2 slice  
- [x] Multi-scale sketches possible on same editor (room and continent) — Excalidraw's own pan/zoom canvas imposes no scale constraint; not separately re-verified per scale beyond MV2's live drawing test, since the canvas doesn't distinguish "room" from "continent" at the implementation level  

---

## Worked examples

**Safehouse (location-owned)**  
Location “Safehouse B-4” → Open map → AI: “top-down: entry, main room, bolt-hole, alley exit” → Accept → nudge door box.

**Continent (location-owned, scale=region/world)**  
Location “The Shattered Coast” → map with labeled regions and routes as arrows/text — still sketch SoT, not Story Map edges.

**War board (free story map)**  
Maps → New map (no location) title “Front lines — Book 2” → AI sketch theaters → optional later link to a region entry.

---

## Research anchors (OSS)

| Project | Use |
|---------|-----|
| [Excalidraw](https://github.com/excalidraw/excalidraw) MIT · `@excalidraw/excalidraw` | Embed; Element Skeleton; `updateScene`; `customData` |
| [excalidraw-mcp](https://github.com/excalidraw/excalidraw-mcp) | Pattern for AI→scene (MCP itself **not** v1 deliverable) |
| Aedifex / Arcada / Spacory | Reference only — not v1 stack |

---

*Locked with user 2026-08-06 (axes 1–11; 6C hybrid ownership, 7C JSON SoT + layoutMd secondary, 9A list→canvas, 10A in-app AI, 8+11 graph kill + Excal embed).*
