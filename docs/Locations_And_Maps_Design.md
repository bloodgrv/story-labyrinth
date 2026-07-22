# Locations, Place Sheets & Story Maps — Design

**Project:** Story Nexus Fork  
**Status:** Locked 2026-07-19 — not implemented  
**Related:** `docs/Chat_Panel_Integrations_Design.md` (WB chat, playbooks), lorebook images, relationship graph  

---

## Context

WB and lorebook are **not** character-only. Categories already include `location`; WB template `locations` exists; images can be uploaded or AI-generated from description. Structured **Codex state** is still character-shaped. Maps are not a first-class tool yet.

---

## Locked decisions (2026-07-19)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Location grill | **Playbook v1** includes **locations** (Light / Standard / Grill-me) alongside characters |
| **2** | Map source of truth | **Structured nodes/edges** when present; else **layout text** (`layoutMd` / ascii). **Images never SoT** |
| **3** | Image maps | **Both:** mood/establishing shot **and** optional **top-down map preset** |
| **4** | UI home | **Both:** layout on **location entries** + dedicated **Story Map** tool (linked) |
| **5** | Place structure | **Light place sheet now**; full place-Codex (versioned like character) **later** |

---

## Location playbook (slots)

Same engine as Brainstorm/WB playbooks; location script:

1. Role in story  
2. Scale (room → plane)  
3. Sensory spine  
4. Layout bones  
5. Rules of the place  
6. Who holds it (→ faction/char handoffs)  
7. Linked places (→ graph / map edges)  
8. Story functions  
9. Open mysteries  
10. Visual / map brief (for image gen)  

**Guided start UX:** same as Brainstorm/WB — blurb + Guided setup + Light/Standard/Grill-me (`Chat_Panel_Integrations_Design.md` §1).

**Outputs:** location lorebook propose→approve; place sheet fields; layoutMd and/or map nodes; edge suggests; image brief; handoffs.

---

## Light place sheet (v1 fields — illustrative)

| Field | Notes |
|-------|--------|
| `scale` | room / building / district / city / region / … |
| `biomeOrClimate` | optional short |
| `holder` | text or link to faction/character entry |
| `dangerLevel` | optional enum/text |
| `landmarks` | list/short bullets |
| `exitsSummary` | free text if no graph yet |
| `layoutMd` | ascii/markdown layout |
| `mapGraphId` / inline nodes | link to story map subgraph when present |
| `imageBrief` | optional dedicated brief vs using description |

Exact schema at implement time; store on lorebook metadata or thin `placeState` JSON — **not** full Codex history until “C later.”

---

## Map model

```text
SoT: story map graph (nodes + edges) when user/AI has built one
Fallback SoT: layoutMd on location entry
Illustration: lorebook image (mood OR map preset) — never overrides graph/text
```

**Nodes:** often = location entries (or sub-POIs under a parent region).  
**Edges:** `contains`, `borders`, `road_to`, `portal_to`, `below`/`above`, etc. (align with graph edge types where possible).

**Story Map tool:** canvas (React Flow family OK — already used for relationships). Filter by region/parent; open location entry from node; WB chat can propose node/edge updates → approve.

---

## Image generation

| Preset | Use |
|--------|-----|
| **Mood / establishing** | Current generate-image path, description-driven |
| **Map** | Dedicated system prompt: top-down/simple labels/ink; feed layoutMd or node list + brief |

User chooses preset on generate. Regen does not delete graph/text.

---

## Phasing

| Phase | Scope |
|-------|--------|
| **L0** | Location playbook script + WB template/prompt alignment |
| **L1** | Light place sheet fields on location entries + layoutMd |
| **L2** | Map image preset + better briefs from grill |
| **L3** | Story Map tool (nodes/edges SoT) + entry link |
| **L4** | Full place Codex versioning (if still wanted) |
| **L5** | Deeper travel-time / multi-floor / export |

**Suggested order:** L0 → L1 → L2 → L3 → L4…

Depends on: shared **playbook engine** (Brainstorm B2/B5); graph patterns from G1.

---

## Non-goals (v1)

- Image-as-SoT cartography  
- Full GIS / lat-long  
- Auto-build entire continent from one grill without approve  
- Replacing relationship graph (maps **complement**; may share edge vocabulary)

---

## Acceptance (location grill v1)

- [ ] Guided location interview produces approveable location entry  
- [ ] layoutMd or equivalent captured  
- [ ] Light place fields editable on entry  
- [ ] Image: mood and map preset both reachable  
- [ ] Story Map may come in L3 without blocking L0–L2  

---

*Locked with user 2026-07-19.*
