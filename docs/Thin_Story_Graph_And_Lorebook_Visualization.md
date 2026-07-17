# Thin Story Graph + Lorebook Relationship Visualization

**Project:** Story Nexus Fork  
**Status:** Design — not implemented  
**Date:** 2026-07-16  
**Audience:** Claude Code + Hermes  
**Depends on:** Lorebook, Codex, Agent Framework Phase A/B (optional integration later)  
**Does not require:** Personal_Agent_Memory_System, Mem0, Neo4j, multi-agent dreamers  

---

## 1. Why this exists

Writers of long novels need to **see and edit** how lorebook entities connect (who holds what, who is where, who knows whom, what caused what) — not only store freeform prose and hope RAG surfaces it.

Story Nexus already has a **partial** relationship model:

- `lorebookEntries.metadata.relationships?: Array<{ targetId, type, description? }>`
- Used today for **one-hop** context when a World-Building chat is anchored to an entry (`chatContextService` resolves related targets)
- Zod schema in `src/schemas/entities.ts`
- **No first-class table**, no reverse index, no graph UI, no path queries, no chapter-as-of tracking

This design upgrades that into:

1. A **visual relationship graph** of the lorebook (primary user value)
2. A **thin SQLite edge store** (so queries and the graph stay fast and bidirectional)
3. Optional later ties to chapters / agent memories (not required for v1)

---

## 2. Goals / non-goals

### Goals (v1)

- Interactive **lorebook relationship graph** per story (nodes = entries, edges = typed links)
- CRUD edges from the graph UI and/or entry editor
- Bidirectional navigation (“who points at Elena?”)
- Category-colored nodes (character / location / item / event / …)
- Click node → open existing Lorebook entry editor
- Fit single Docker + one SQLite file; no new graph DB or npm graph server

### Goals (v1.5, optional)

- AI **suggest** edges (pending approve), same HITL spirit as Codex / agentMemories
- Filter graph by category, edge type, importance, disabled entries
- Embed edge summaries into RAG text for an entry (optional)

### Non-goals

- Psychological / power-dynamic / corruption graphs as system types
- Emotional companion graph (Personal_Agent_Memory territory)
- Full causal simulator or automatic cascade rewriting of chapters
- Auto-building a dense graph from every chat message without approval
- Replacing Codex concrete state (wardrobe, wounds, items stay on the entry)

---

## 3. Architecture

### 3.1 Two-phase data strategy

**Phase G0 — Visualize what already exists (optional thin slice)**  
Build a read-only (or light-edit) graph UI that **projects** `metadata.relationships` from all story-scoped lorebook entries into a force-directed graph.  
- Zero schema migration  
- Proves UX value quickly  
- Limitations: no efficient reverse lookup at SQL level; edits still patch JSON on source entry only; asymmetric edges are easy to get wrong

**Phase G1 — Thin SQLite graph (recommended real target)**  
First-class `storyGraphEdges` (and optionally lightweight layout prefs). Lorebook entries remain nodes; **do not** duplicate entry payloads into a `graphNodes` table unless needed for non-lorebook node types later.

```
lorebookEntries (existing)     = nodes (identity, label, category, image, codex…)
storyGraphEdges (new)          = directed typed edges
storyGraphLayout (optional)    = saved x/y per node for stable canvas
```

Migrate existing `metadata.relationships[]` → `storyGraphEdges` once, then:

- **Either** stop writing relationships into metadata and treat the edge table as SoT,  
- **Or** dual-write for one release (edge table SoT; metadata kept in sync for old formatters)

**Recommendation:** Edge table becomes SoT after migration; keep a read-compat helper that still exposes `relationships[]` shape to chat/formatters so existing one-hop code keeps working without a big-bang rewrite.

### 3.2 Why not only metadata.relationships forever

| Need | JSON on entry | Edge table |
|------|---------------|------------|
| Draw full graph | O(n) load all entries + parse | Same, but cleaner |
| “Who links *to* X?” | Scan every entry’s JSON | Index on `toId` |
| Unique edge constraint | Manual | SQL unique index |
| asOfChapter / evidence | Awkward in nested JSON | Columns |
| Pending AI suggestions | Awkward | `status` column like memories |
| Delete entry cleanup | Easy to orphan targets | `ON DELETE CASCADE` from both ends if FKs used carefully |

---

## 4. Data model (Phase G1)

### 4.1 Nodes = lorebook entries (v1)

No separate node table required for v1.

Node display fields come from live entry rows:

| Field | Source |
|-------|--------|
| id | `lorebookEntries.id` |
| label | `name` |
| category | `category` |
| disabled | `isDisabled` |
| image | existing image route if present |
| scope | `level` + `scopeId` (story graph shows story-scoped + optionally series/global linked into this story’s working set) |

**Scope rule (v1):** Graph is opened **in a story context**. Include:

- Entries with `level = 'story'` and `scopeId = storyId`
- Optionally series-level entries for the story’s series (toggle)
- Optionally global entries that appear as endpoints of an edge to a story entry (toggle, default off to reduce clutter)

### 4.2 `storyGraphEdges`

| Column | Type | Notes |
|--------|------|--------|
| `id` | text PK | UUID |
| `storyId` | text not null | FK → stories, cascade delete. Graph is story-scoped even if an endpoint is series/global |
| `fromId` | text not null | lorebook entry id (application-enforced; see FK note) |
| `toId` | text not null | lorebook entry id |
| `edgeType` | text not null | allowlisted type (§4.3) |
| `label` | text nullable | optional short display override |
| `description` | text nullable | freeform note |
| `status` | text not null | `active` \| `pending` \| `rejected` (default `active` for manual) |
| `asOfChapterId` | text nullable | optional chapter grounding |
| `source` | text not null | `user` \| `import` \| `ai_suggested` \| `migrated` |
| `createdAt` / `updatedAt` | timestamps | epoch-seconds discipline if raw SQL |
| `createdByUserId` | text nullable | if multi-user matters |

**Constraints / indexes:**

- Unique active edge: `(storyId, fromId, toId, edgeType)` where status is active (or unique among active+pending — pick one; recommend unique among `active` and separately allow one `pending` per triple)
- Indexes: `(storyId)`, `(fromId)`, `(toId)`, `(storyId, edgeType)`, `(status)`
- Check `fromId != toId` (no self-loops in v1) unless you explicitly want “alias of” later

**FK note (important for this codebase):**  
Lorebook entries can be series/global scoped; story graph is story-scoped. Prefer **no real FK** from `fromId`/`toId` to `lorebookEntries` if that blocks cross-scope or hits the same ALTER/FK issues already documented for `anchorEntryId` — **or** use real FKs only when both ends are guaranteed story-level. Application-level cleanup on entry delete is already a known pattern; mirror lorebook delete handlers:

- On entry delete: delete edges where `fromId = id OR toId = id`

### 4.3 Edge type allowlist (concrete / factual)

Start small; store as text with server validation.

| `edgeType` | Meaning | Typical from → to |
|------------|---------|-------------------|
| `knows` | Is acquainted / aware of | character → character |
| `allied_with` | Working together | character → character |
| `opposed_to` | Conflict | character → character |
| `member_of` | Belongs to group/org | character → location/note (org) |
| `located_in` | Currently / typically at | character/item → location |
| `owns` / `holds` | Possession | character → item |
| `works_at` | Employment | character → location |
| `related_to` | Family/generic social (neutral) | character → character |
| `part_of` | Component / subsection | item/location → location |
| `caused` | Event causality | event → event/entry |
| `involved_in` | Participant in event | character → event |
| `mentions` | Soft link / narrative ref | any → any (prefer rare) |
| `contradicts` | Continuity conflict (often from scan) | any → any |
| `other` | Escape hatch + required description | any → any |

**Do not** add edge types for corruption stage, dominance, internalization, etc.

Symmetric types (`allied_with`, `opposed_to`, `related_to`, `knows` optional): UI may offer “create reverse edge” checkbox; storage stays directed unless you later add `bidirectional` boolean. **v1: directed only; UI can create two rows for undirected feel.**

### 4.4 Optional `storyGraphLayout`

| Column | Notes |
|--------|--------|
| `storyId` | |
| `entryId` | |
| `x`, `y` | float |
| `updatedAt` | |

Primary key `(storyId, entryId)`. If missing, client runs force layout and may persist on “Save layout”.

---

## 5. Visual relationship graph (primary UX)

### 5.1 Placement

- New workspace tool: **Relationships** / **Graph** (story-scoped), sibling to Lorebook / Memory  
- Secondary entry points:
  - Lorebook toolbar: “View graph”
  - Entry editor: “Show in graph” (focus + highlight node)

### 5.2 Canvas behavior (v1)

- Force-directed or simple d3-force / React Flow / similar — **prefer a library already easy to add**; if dependency aversion is strong, start with React Flow or a minimal SVG force layout. Record choice in DECISIONS.md.
- Nodes:
  - Size by importance if metadata.importance exists; else uniform
  - Color by `category`
  - Dim `isDisabled`
  - Thumbnail if image exists (optional polish)
- Edges:
  - Label = `edgeType` (short) + optional `label`
  - Style pending edges dashed
  - Click edge → side panel edit/delete/approve
- Interactions:
  - Drag nodes (persist if layout table exists)
  - Click node → side panel summary + “Open entry”
  - Double-click node → open Lorebook editor tool for that entry
  - Drag from node handle to node → create edge dialog (type + description)
  - Search/filter box: filter nodes by name; hide unrelated edges
  - Toggles: edge types, categories, show pending, show series/global

### 5.3 Empty / sparse states

- No edges yet: show all story entries as free nodes + prompt “Link two entries” / “Import from metadata”
- Migration banner if `metadata.relationships` still has data not in edge table

### 5.4 Accessibility / performance

- Target comfort: **~200 nodes / ~500 edges** without special work (typical personal novel lorebook)
- Above that: require filter-by-category or “neighborhood of selected node” mode (ego graph)
- v1 default view option: **ego graph** centered on last-selected entry (1-hop + optional 2-hop) to avoid hairballs

**Recommendation:** Default to **ego / neighborhood mode** with a “Show full story graph” toggle for small projects.

---

## 6. API surface

All routes authenticated; mutations use same editor rules as lorebook (`requireAuth` + `blockViewerMutations` unless you decide owner-only — prefer **editor-level**, like memories/Codex).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/stories/:storyId/graph` | `{ nodes, edges }` for canvas (active by default; `?includePending=1`) |
| `GET` | `/api/stories/:storyId/graph/neighborhood/:entryId` | Ego graph depth=1\|2 |
| `POST` | `/api/stories/:storyId/graph/edges` | Create edge |
| `PATCH` | `/api/graph/edges/:id` | Update type/description/status |
| `DELETE` | `/api/graph/edges/:id` | Delete |
| `POST` | `/api/graph/edges/:id/approve` | pending → active |
| `POST` | `/api/graph/edges/:id/reject` | pending → rejected |
| `PUT` | `/api/stories/:storyId/graph/layout` | Batch save node positions |
| `POST` | `/api/stories/:storyId/graph/migrate-from-metadata` | One-shot import |
| Optional | `POST` | `/api/stories/:storyId/graph/suggest` | AI propose pending edges (v1.5) |

Response node DTO should be **display-ready** (id, name, category, isDisabled, imageUrl?) so the canvas does not N+1.

---

## 7. Integration points

| System | Integration |
|--------|-------------|
| **Lorebook form** | Replace or supplement metadata.relationships editor with edge-backed list (“Links from this entry” / “Links to this entry”) |
| **Chat context** | Keep one-hop include; implement via edge table query instead of JSON parse |
| **LorebookFormatter / prompts** | Format edges from edge table |
| **Entry delete** | Cascade-delete incident edges in the same handler as image/RAG cleanup |
| **RAG index** | Optional: append “Relationships: …” lines into indexed lorebook text on edge change (fire-and-forget reindex entry) — nice, not required for v1 graph UI |
| **Agent memories** | Later: `caused` / `contradicts` edges from approved facts — do not block v1 |
| **RAG scanner** | Later: suggest `contradicts` pending edges from issues — Phase G2 |
| **Personal agent** | May consume `GET …/graph` later; not in scope |

---

## 8. AI suggestions (Phase G1.5 — only after graph UI works)

- Job type or one-shot route: `suggest_graph_edges` for a story or entry
- Model returns `{ fromId, toId, edgeType, description, confidence }[]` using **existing entry ids only**
- Insert as `status: pending`, `source: ai_suggested`
- User approves on graph (dashed edges) or list
- Prompt constraints: factual/concrete links only; no psych/power types; prefer precision over volume

Do **not** auto-activate.

---

## 9. Migration from `metadata.relationships`

1. For each lorebook entry in story scope with `metadata.relationships`:
   - For each rel: insert edge `fromId=entry.id`, `toId=rel.targetId`, `edgeType=normalize(rel.type)`, `description=rel.description`, `source=migrated`, `status=active`, `storyId=…`
2. Skip if target missing
3. Dedup on unique key
4. After success: either strip relationships from metadata or leave read-only legacy until dual-write ends
5. Tooling: button “Import legacy relationships” + server log of skipped orphans

Normalize freeform `type` strings into allowlist where possible; unknown → `other` + preserve original in description prefix.

---

## 10. Implementation order (for Claude)

### Slice 1 — Graph read API + UI over **legacy metadata** (optional fast win)
- Aggregate relationships client- or server-side
- Read-only canvas + open entry
- Validates UX before migration

### Slice 2 — `storyGraphEdges` schema + CRUD API + delete cleanup  
### Slice 3 — Migration endpoint + make edge table SoT for chat one-hop  
### Slice 4 — Full interactive graph (create edge by drag, edit panel, filters, ego mode)  
### Slice 5 — Layout persistence  
### Slice 6 (optional) — AI suggest pending edges + reindex-on-edge-change  

**Minimum lovable product:** Slice 2–4 (skip Slice 1 if you prefer not to build throwaway read path).

---

## 11. Acceptance criteria (v1)

- [ ] Open Relationships tool for a story; see lorebook entries as nodes  
- [ ] Create / edit / delete typed edges; refresh persists  
- [ ] Reverse links visible (B shows edge from A→B)  
- [ ] Delete lorebook entry removes its edges; no orphan UI ghosts  
- [ ] Pending edges (if any) do not behave as active for chat one-hop until approved  
- [ ] Legacy metadata relationships migratable without data loss for valid targetIds  
- [ ] No psych/power edge types introduced  
- [ ] `tsc` + oxlint clean; DECISIONS.md notes library choice + SoT decision  

---

## 12. Library choice (decide at implement time)

Prefer one:

| Option | Pros | Cons |
|--------|------|------|
| **React Flow** | Excellent node graph UX, edges, controls | New dependency |
| **d3-force + SVG/canvas** | Lightweight, full control | More custom code |
| **vis-network** | Quick graphs | Heavier feel / styling fights |

Record the choice and bundle size impact in DECISIONS.md. Do not invent a full graph editor from scratch unless dependencies are forbidden.

---

## 13. Suggested CLAUDE.md blurb (when starting work)

```markdown
### Lorebook Relationship Graph (Planned)
- Design: `docs/Thin_Story_Graph_And_Lorebook_Visualization.md`
- Thin SQLite `storyGraphEdges`; nodes are existing lorebook entries
- Visual story-scoped relationship graph; concrete edge types only
- Edge table becomes SoT for links; migrate from metadata.relationships
- AI edge suggestions are pending-only (same HITL as Codex/memory)
```

---

## 14. Relation to Agent Framework Phase C

This is **not** required for Phase C of agent jobs/memory. It is a **separate feature track** that:

- Delivers the visual lorebook map you want
- Optionally later feeds scanners / memory / personal agent
- Should not block or be blocked by prompt-injection polish on agent memory

---

## 15. One-line summary

**Lorebook entries are the nodes; a thin SQLite edge table is the truth for links; the product surface is an interactive relationship graph with human-controlled (and later AI-suggested pending) edges — no psych graph, no external graph DB.**

---

*End of design.*
