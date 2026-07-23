# Chat ↔ Panel Integrations — Design

**Project:** Story Nexus Fork (`E:\StoryNexus-Fork`)  
**Status:** Design locked (2026-07-18) — implemented (R0-R8, B0-B5, S0-S5, K0-K5 all shipped; see `CLAUDE.md` "Chat System" and `docs/CURRENT_BACKLOG.md` P0.4); this doc is the original design record, may be stale on specifics  
**Audience:** Claude Code (implementation) + Hermes (architecture)  
**Related:** `docs/Notes_Outline_Chat_Bridges_Design.md`; `docs/CURRENT_BACKLOG.md` P0.3 / P1; floating toolbar `FloatingTextFormatToolbarPlugin`

---

## 0. Doctrine

1. **Panel owns the durable artifact** (chapter, lorebook entry, outline item, note).  
2. **Chat owns judgment** (multi-turn direction, continuity, what the content should be).  
3. **Selection/focus owns the span** being reworked (highlight, field, outline row).  
4. **No silent canon** unless an explicit auto-accept/auto-insert toggle is ON (default OFF).  
5. **One-shot amnesiac generates are not the primary path** when a host chat exists.

---

## 1. World-building chat — locked

| Axis | Decision |
|------|----------|
| Home | Docked in **Lorebook entry editor** only |
| Reads | Anchor entry + related + lorebook RAG + synopsis; future Notes/Outline via double-gate (non-editor) |
| Writes | Lorebook/Codex via `codex-proposal` → approve |
| Auto-accept Codex | **Toggle**, default OFF |
| Outline template | **Removed from WB** — outline work on Outline rail/chat |
| Non-goals | No chapter prose insert; no silent canon when auto-accept off |
| Descriptions | Character/location quality via lorebook/Codex proposals — not blocked by non-goals |

### Guided start (same pattern as Brainstorm) — locked 2026-07-19

WB uses the **same guided-start UX model** as Brainstorm (not a different control scheme):

```text
[ Guided setup ▾ Light | Standard | Grill-me ]

Input blurb: e.g. “Develop this entry — or run Guided setup…”
Free chat always works without guided mode.
```

| | |
|--|--|
| **Entry** | Blurb in composer **and** **Guided setup** button |
| **Style dropdown** | **Light / Standard / Grill-me** (next to button) |
| **Scope** | Playbook script follows **template** (character, location, faction, …) + **anchor entry** when present |
| **Engine** | Shared playbook runner (B5); not live in app yet |

### Character playbook — psych module (locked 2026-07-19)

| # | Decision |
|---|----------|
| **1** | **Opt-in psych module** (MBTI + Enneagram + freeform psych blurb) built through **chat**, then propose→accept |
| **2** | Derived from interview answers — not cold-assigned in message one |
| **3** | Stored on character entry (description section and/or `psychProfile` metadata) — **writing aid only** |
| **4** | **Not** scanner-enforced; not a continuity “law” pipeline |
| **5** | **When enabled:** **Grill-me defaults psych module ON**; Light/Standard stay **concrete-first** unless user turns the psych toggle **on** |
| **6** | Toggle model = **Brainstorm guided-start flow** (style dropdown + optional module toggle under Guided setup / session options) |

**Concrete vs psych split:** live Codex state stays concrete (appearance, wardrobe, …). Psych profile is backstory/profile material, not wound-tracker state.

**Location playbooks** (see `docs/Locations_And_Maps_Design.md`) use the same guided-start control; no MBTI module unless separately added.

---

## 2. Editor chat — locked

| Axis | Decision |
|------|----------|
| Job | Writing partner + continuity clerk |
| Home | Story Editor rail only |
| chatType | **`editor` separate from Outline** (own chat list) |
| Reads | Anchor chapter + chapter RAG + lorebook + synopsis |
| Notes read | **OFF** |
| Outline read | **ON**, **current chapter’s outline only** (else nothing) |
| Writes — prose | `prose-proposal` → Accept; **auto-insert toggle** default OFF |
| Prose edit after apply | **Only in chapter** (no edit-on-card) |
| Writes — Codex | `codex-proposal` → **tray under chat list** (no popup) |
| Codex tray scope | **This chat only** |
| Codex auto-accept | Default OFF on Editor |
| Chapter anchor | Sticky at create today; live-follow optional later |

### 2.1 Selection rework (Editor) — locked

Replaces primary use of floating one-shot Expand/Rewrite/Shorten.

```text
Highlight in chapter
  → “Rework in chat” (primary)
  → REWORK CARD bound to active Editor chat
  → context: [BEFORE] + [SELECTION] + [AFTER] + full Editor context pack
  → user instructs in chat (chat governs)
  → model returns candidate (prose-proposal / selection-replace proposal)
  → Accept → replace SELECTION only
  → further edit only in chapter
```

| Rule | |
|------|--|
| Chat-bound | **Yes** — active Editor chat (create/select if none) |
| Before/after | Local window for fit; labeled; not echoed as output |
| Apply | **Replace selection**, not append-only |
| No selection | Normal prose-proposal insert at cursor/end (existing) |
| Old Expand/Rewrite/Shorten | Become **chips that send into chat** (or buried); not primary amnesiac path |
| Codex | Unchanged tray path; selection rework is prose-span focused |

**Today’s floating Generate** (`selection_specific` → immediate `insertText`) is **not chat-bound**, thin context, and is **deprecated as the primary UX** in favor of this bridge.

---

## 3. Generalized pattern: Selection / Focus Rework Bridge

**Yes — the same system should be reused** in other panels, each tied to **its host chat**.

### 3.1 Abstract pipeline

```text
1. User focuses a span or field in a PANEL
2. “Rework with chat” opens a card
3. Bind to HOST CHAT for that panel
4. Inject FOCUS PACKET:
     - target id + type
     - selected/focused text (or field value)
     - local neighbors (before/after, sibling rows, etc.)
     - host chat’s normal context assembly
5. Chat thread governs instructions + multi-turn refinement
6. Model emits a typed proposal for that target
7. Accept applies to the PANEL target (replace field / row / selection)
8. Reject discards; optional Edit-before-accept where propose/approve exists
```

### 3.2 Host matrix

| Panel surface | Host chat | Focus target | Neighbor context | Apply on Accept |
|---------------|-----------|--------------|------------------|-----------------|
| **Chapter editor** | Editor chat | Text selection (Lexical range) | Before/after in chapter | Replace selection |
| **Lorebook entry** | World-building chat | Description (and/or named fields, Codex subfields) | Rest of entry; anchor already in WB context | Propose Codex/description change (approve or auto-accept) |
| **Outline item** | Outline chat | Title and/or summary (scene/chapter row) | Parent chapter, prev/next siblings | Propose outline field update or replace fields on accept |
| **Notes** (later) | Brainstorm or Notes-capable chat | Note body / selection | Note title/type | Update note or note-proposal |
| **Research** | Research chat | N/A or pasted span | Weak story scope | Prefer not for canon writes |

### 3.3 Shared building blocks (implement once)

| Piece | Role |
|-------|------|
| `FocusTarget` | `{ kind, id, field?, range? / text }` |
| `FocusPacket` | before / selection / after + labels |
| `ReworkCard` | UI shell: target preview, chips, link to host chat |
| Host chat resolver | editor → editor chat; lorebook → WB chat; outline → outline chat |
| Typed apply adapters | `applyChapterSelectionReplace`, `applyLorebookProposal`, `applyOutlineFieldProposal` |
| Proposal kinds | extend fence types or reuse codex/prose/outline/note proposals with `target` metadata |

### 3.4 What stays different per host

| Concern | Chapter | Lorebook | Outline |
|---------|---------|----------|---------|
| Durability of proposal | Ephemeral until Accept (or persist later) | Prefer **pending Codex** (already durable) | Prefer pending outline update or accept-in-place with undo |
| Canon gate | Accept into manuscript | Approve / auto-accept toggle | User accept; outline is plan not canon |
| Read extras | Outline-for-chapter; no Notes | Anchor entry; Notes/Outline opt-in gates | Full/local outline structure |
| Prose vs structured | Free prose replace | Description + structured Codex JSON | Short title/summary text |

### 3.5 Non-goals for the generalized bridge

- One global chat for all panels  
- Amnesiac floating generate as default on any panel  
- Auto-apply without Accept when toggles are off  
- Editor Notes read (still off)  
- Research chat as primary lorebook writer without story scope  

---

## 4. Outline chat — locked (2026-07-18)

| Axis | Decision |
|------|----------|
| **Job** | Structure partner; light continuity via Codex tray + lore **handoff to WB** (not full sheet factory) |
| **Home** | **Rail only on Outline page** |
| **chatType** | **`outline`** — own list; **not** shared with Editor |
| **Inherits** | Planning job formerly implied by WB “outline” template |

### Reads

| Source | Decision |
|--------|----------|
| Full outline tree (titles + summaries) | **ON** |
| Story synopsis | **ON** |
| Lorebook / Codex | **ON** |
| Written chapters | **Titles + summaries only** (no full body RAG) |
| Notes | **Opt-in** (double-gate) |
| Project memory | **Opt-in** |
| Anchor | **Live focused row + optional pin** |

### Writes

| Target | Decision |
|--------|----------|
| New chapter/scene items | Propose → accept + **auto-accept toggle** (default OFF) |
| Edit title/summary | Propose → accept + auto-accept toggle (default OFF) |
| Reorder | Propose → accept + auto-accept toggle (default OFF) |
| Delete | **Propose delete** → accept |
| Codex | **Tray, this chat only** |
| New lorebook entities | **Not** direct deep create — **suggested list** in tray → **Open in WB** handoff; WB governs real sheets |
| Notes | **`note-proposal`** → tray section |
| Chapter manuscript prose | **NONE** |

### Bulk Generate button

**Retired.** All structure generation goes through Outline chat (no separate `outlineGenerator` primary UX). Backend may be reused behind chat proposals.

### Approval UX

| Kind | UI |
|------|-----|
| Outline create/edit/reorder/delete | **Unified tray** (this chat) + **ghost/pending badges on outline tree** |
| Codex | Tray section, this chat only |
| Note-proposals | Tray section |
| Lore-to-WB suggestions | Tray section + **Open in WB** |
| Auto-apply outline | Default **OFF** |

### Focus / selection rework

| Rule | Decision |
|------|----------|
| Row/field → Rework card → Outline chat governs | **Yes** |
| Neighbors: parent, prev/next siblings | **Yes** |
| Accept updates target only | **Yes** |
| Span-inside title/summary (before/selection/after) in v1 | **Yes** |

### Non-goals

1. No chapter manuscript insert/edit  
2. No silent bulk wipe/replace of outline  
3. Not primary character-sheet factory (list → WB only)  
4. No full chapter body in context  
5. No auto-apply when toggles default OFF  
6. No shared chat list with Editor  

### Workflow position (product)

```text
Brainstorm (new story / broad ideas) → divide/handoff lists
    → Outline chat (spine / beats)
    → WB chat (entities from lore suggestion list)
    → Editor chat (prose)
```

Brainstorm outbox/handoff is a **later** feature; Outline assumes structure work happens here once the user is ready.

---

## 5. Brainstorm chat — locked (2026-07-18)

**Job:** Project **intake & orientation hub** — Grill-me-style assist interview → working overview → **suggested packets** handed to Outline / WB / Notes / Research (opt-in) / etc.  
**Not:** final structure desk, character-sheet factory, or manuscript writer (Editor).

### Why agent framework (beyond background jobs)

Brainstorm (and later WB/Outline playbooks) need an **assist workflow runtime**: ask loops, slot fill, confirm overview slices, handoff records. Jobs remain for scan/distill/reindex; **playbooks** are the interactive layer on top.

### Home

- **Standalone Brainstorm tool** + **empty/new-story CTA** (“Start in Brainstorm / Guided setup”)
- One real home; CTA is discoverability only

### Design tensions

| # | Topic | Decision |
|---|--------|----------|
| **1. Entry** | Free + guided | Input **blurb** + **Guided setup** button |
| **2. Overview SoT** | Mixture, depth-adaptive | Playbook chooses depth; user confirms writes |
| **3. Stack** | Migrate | Shared `chats.ts` / `ChatInterface` (`chatType: brainstorm`) |
| **4. Style** | Dropdown by button | Light / Standard / Grill-me |

### Entry UX

```text
[ Guided setup ▼ Light|Standard|Grill-me ]

“Start designing your project here — or run Guided setup for a structured interview.”
```

### Reads

| Source | Decision |
|--------|----------|
| Title + synopsis | **ON** |
| Outline (titles+summaries) | **Opt-in** |
| Lorebook | **Opt-in** |
| Chapter titles+summaries | **Opt-in** |
| Full chapter body | **OFF** |
| Notes | **Opt-in** (double-gate) |
| Project memory | **Opt-in** |
| Prior setup slots (this story) | **ON** |
| Handoff status | **ON** |

### Writes / outputs

| Target | Decision |
|--------|----------|
| Story synopsis | propose→accept |
| Overview Note(s) | propose→accept |
| Handoff → Outline | tray packet → Open/Send |
| Handoff → WB | tray packet → Open/Send |
| Handoff → Notes | tray / note-proposal |
| Handoff → Research | **opt-in** packet |
| Handoff → Editor | **later** |
| Direct outline items | **none** |
| Direct lorebook/Codex deep | **none** (seeds via handoff only) |
| Chapter prose | **none** |
| Project memory | **opt-in** propose |
| Auto-apply synopsis/notes | default **OFF** |

### Depth-adaptive mixture SoT

| Depth | Typical proposes (after confirm) |
|-------|----------------------------------|
| Light | Short synopsis; few notes; thin handoffs |
| Standard | Synopsis + overview note; solid Outline/WB seeds |
| Grill-me | Deeper slots; more notes; richer handoffs; harder questions |

Sinks: `stories.synopsis` · Notes · handoff records · transcript · project_memory only if opted in.

### Tray / approval UX

- **This chat only**
- Sections: overview proposals · handoffs (Outline/WB/Notes/Research) · slot checklist (known/unknown)
- Optional in-thread chips → tray
- **Persistence:** items are durable DB-backed checklist work
- **Open/Send/Accept do not remove from active queue**
- **Only Mark done (checkbox)** leaves the **active** queue
- Filters: **Active** (default) | **Done**
- Status examples: `pending` → `opened` → `done` (and rejected/dismissed paths as needed)

### Shared playbook engine

```text
ASK (playbook + style Light|Standard|Grill-me) → CAPTURE slots → CONFIRM slice
    → PROPOSE artifact updates (host gates) → optional HANDOFF
```

**UX shell (shared):** composer blurb + **Guided setup** button + **style dropdown** (Brainstorm pattern). Domain scripts differ (project intake vs character vs location vs outline).

**WB character:** optional **psych module** (MBTI + Enneagram + blurb); Grill-me defaults it on; Light/Standard off unless toggled.

| Chat | Playbook focus |
|------|----------------|
| Brainstorm | Whole project overview + handoffs |
| WB | Anchor entity + template script (+ psych module for characters) |
| Outline | Structure / spine |
| Editor | **No** setup grill |

### Non-goals

1. Silent full outline/lorebook build  
2. Replace Outline/WB desks  
3. Editor setup grill  
4. Auto-handoff without Open/Send  
5. Full chapter body in context  
6. Tray auto-expire on visiting destination (Mark done only)

### Implementation slices

| ID | Slice |
|----|--------|
| **B0** | Migrate Brainstorm to shared chats stack |
| **B1** | Blurb + Guided setup + style dropdown + empty-story CTA |
| **B2** | Playbook runner + slots + Light/Standard/Grill-me |
| **B3** | Depth-adaptive propose → synopsis / notes / handoffs / opt-in memory |
| **B4** | Durable tray checklist: Open/Send/Accept + **Mark done**; Active/Done filters |
| **B5** | WB/Outline domain playbooks (shared engine + **same guided-start UX as Brainstorm**). Character: psych module (MBTI/Enneagram/blurb) opt-in; Grill-me defaults ON. Location: `Locations_And_Maps_Design.md` |

---

## 6. Research chat — locked (2026-07-18)

**Job:** **Web research desk** with agent help — Gemini-search style. Look up facts, synthesize, **cite links**, discuss for the story.  
**Not:** intake hub, structure desk, lore factory, or manuscript writer.

### Home & mode

- Standalone **Research** tool  
- **Story mode (default):** light story seasoning (title + synopsis)  
- **Global mode (optional):** web (+ user paste); not story-bound  

### Reads / tools

| Source | Decision |
|--------|----------|
| Web search + page fetch | **ON** (core) |
| Links / citations in answers | **ON** (first-class) |
| Story title + synopsis (story mode) | **ON** (light) |
| Lorebook | **Opt-in** |
| Outline / chapters | **OFF** |
| Notes | **Opt-in** (prior research notes) |
| Project memory | **OFF** |
| Full manuscript RAG | **OFF** |
| Global mode | Web (+ paste) only |

### Writes

| Target | Decision |
|--------|----------|
| Research Notes (`type: research`) | **On request** — user asks or accepts note-proposal |
| Auto-save every answer | **No** |
| Lorebook / Codex / outline / prose | **None** |
| Brainstorm-style handoff packets | **None as general outbox** — copy/paste was enough for v1 Research desk; **exception:** **return-to-origin** packets when Research was opened via **Chat Shuttle** (`docs/Chat_Shuttle_Design.md`) |
| Inbound shuttle seeds | **Yes** (from Editor / Outline / WB) — see Chat Shuttle design |
| Copy-friendly answer/link blocks | **Yes** |
| Project memory | **None** |

### UX

- **Story / Global** toggle (clear)  
- Citations/links under answers; included when saved to a note  
- **No** full durable checklist tray (optional tiny “notes saved this session” is enough)  
- No auto-apply path  

### Non-goals

1. Not a second Brainstorm / Outline / WB  
2. No silent lorebook/Codex/outline/prose writes  
3. No auto-save all answers to Notes  
4. No full manuscript / heavy outline in default context  
5. No setup grill playbook  
6. Global mode does not invent story canon  

### Implementation slices

| ID | Slice |
|----|--------|
| **S0** | Story vs Global mode; bind `storyId` in story mode |
| **S1** | Web search + fetch tool path in Research chat generation |
| **S2** | Citation/link rendering in messages |
| **S3** | On-request note-proposal / “Save as research note” |
| **S4** | Opt-in lorebook + notes context toggles; keep outline/chapters/memory off |
| **S5** | Copy-friendly blocks for paste into other chats |

---

## 7. Notes desk — locked (2026-07-18)

**Job:** **B** — Working-material **parking lot + light desk**. Organize, split, refine, arm for AI, **promote** out.  
**Not:** web research, setup grill, Codex factory, or manuscript editor.

### Home

- Standalone **Notes** tool  
- **Badges:** AI-armed count, pending promote, etc.  
- Optional **Notes chat rail** (open/close) — not required for CRUD  

### Chat

| | |
|--|--|
| Presence | **Optional rail** on Notes page |
| chatType | `notes` |
| Scope | Story-scoped, own chat list |

### Reads (Notes chat)

| Source | Decision |
|--------|----------|
| Note list (titles/types/filters) | **ON** |
| Focused note full body (+ pin) | **ON** |
| Title + synopsis | **ON** (light) |
| Other story notes | **All story notes** (desk privilege — not limited to armed) |
| Lorebook | **Opt-in** |
| Outline | **Opt-in** |
| Chapters / web / manuscript | **OFF** |
| Project memory | **OFF** |

**Other chats** still require Notes **double-gate** (`includeInAi` + per-chat include). Editor **never** reads Notes by default.

### Writes

| Target | Decision |
|--------|----------|
| Human CRUD + types | **Yes** |
| `includeInAi` + bulk arm/disarm | **Yes** (default unarmed) |
| Title/body rework (+ span-in-note) | **Yes** via Notes chat (R0 pattern) |
| Split dump → many notes | **Propose→accept** |
| Merge | Later / propose |
| Promote → WB | Handoff seed list + Open in WB |
| Promote → Outline | Handoff + Open in Outline |
| Promote → synopsis | Propose→accept |
| New notes via note-proposal | **Yes** |
| Deep Codex / chapter prose | **None** |
| Auto-arm / auto-promote | **OFF** |

### Tray / UX

- Light tray (this chat only): splits, note-proposals, promote handoffs  
- **Open** does not clear; **Mark done** leaves active queue  
- List filters: type, armed, search; pin/overview flag for overview notes  
- **Import dump → Notes** supported (align with N0/import work)  

### Types

Keep: `idea` | `research` | `todo` | `other`

### Non-goals

1. Not web Research desk  
2. Not Brainstorm setup grill  
3. Not primary Codex factory  
4. Not manuscript editing  
5. Not default Editor context  
6. No auto-arm / auto-promote  
7. No silent multi-store writes  

### Implementation slices

| ID | Slice |
|----|--------|
| **K0** | Badges + filters + pin/overview; export notes (N0) |
| **K1** | Optional Notes chat rail (`chatType: notes`) + desk context pack |
| **K2** | Rework + split proposals |
| **K3** | Light tray + Mark done; promote → WB/Outline/synopsis |
| **K4** | Import dump → Notes |
| **K5** | Wire N1–N6 double-gate for *other* chats (if not already) |

---

## 8. Acceptance criteria (selection rework v1 — Editor)

- [ ] Highlight → Rework opens card bound to active Editor chat  
- [ ] Before/after/selection injected; full Editor context pack used  
- [ ] Multi-turn chat can refine before Accept  
- [ ] Accept replaces selection only  
- [ ] No Accept → manuscript unchanged  
- [ ] One-shot floating generate is not the primary path  
- [ ] Codex tray remains separate, this-chat scope  

---

## 9. Implementation slices (rollup)

| ID | Slice |
|----|--------|
| R0 | Shared FocusTarget / FocusPacket / ReworkCard |
| R1–R2 | Editor selection rework; bury one-shot generate |
| R3 | Editor Codex tray (this chat) + edit-before-approve |
| R4 | Lorebook field rework → WB |
| R5–R8 | Outline chat full lock; retire bulk Generate; tray+tree; →WB handoff |
| R6–R7 | Auto toggles default OFF; split editor vs outline chatTypes |
| N0–N6 / O* | Notes/outline AI gates, RAG bucket, export |
| K0–K5 | **Notes desk:** badges, optional chat, rework/split, promote tray, import |
| B0–B5 | Brainstorm migrate, guided setup, playbooks, durable Mark-done tray |
| S0–S5 | Research Story/Global, web+citations, save note on request |

**Suggested build order:** R0→R1→R2→R3 → R7 → R5/R8 → R4 → N/K notes desk+gates → B0–B4 → S0–S3 → B5 playbooks.

---

*Locked pieces: WB (§1), Editor (§2–2.1), generalized rework (§3), Outline (§4), Brainstorm (§5), Research (§6), Notes desk (§7).*
