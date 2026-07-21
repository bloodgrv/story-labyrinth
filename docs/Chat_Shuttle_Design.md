# Cross-Desk Chat Shuttle (“Agent Chat Shuffle”) — Design

**Project:** Story Nexus Fork  
**Status:** Locked 2026-07-20 — ready when promoted; **build after Research S0–S2**  
**Backlog:** `docs/CURRENT_BACKLOG.md` P3 (+ pairs with P0.4 **S** / **K**)  
**Related:** `docs/Chat_Panel_Integrations_Design.md` (desks, Brainstorm handoffs, Research §6, Notes §7); `docs/Outline_Import_Design.md` (work-tray / B4 morals); Notes N5 save-as-note  

---

## Job

Keep each **desk chat** on-mission. When the user (or model) hits an **off-desk** intent mid-thread, **propose a shuttle** to the right desk via a **durable tray** instead of answering fully in the wrong chat and polluting craft context.

**Canonical example**

> Editor · Chapter 3 · MI6 agent confronting an adversary.  
> User: “What are the most common knives an MI6 agent would use?”  
> → **Do not** dump a research essay into Editor chat.  
> → Propose **Research** shuttle → user confirms → Research (Story mode) answers with web + cites.  
> → Optional **return packet** (summary + links) back to Editor tray.  
> → Mark done when finished.

**Also in scope:** highlight text (prose or chat) → **Note / Notes chat** without forcing a Research trip.

**Not:** full mesh of every desk to every desk in v1; silent auto-send without user confirm (except optional future pref); Research becoming a second Editor/WB.

---

## Why

- Desks already split jobs (Editor = prose craft; Research = web facts; WB = sheets; Notes = parking lot).  
- Without shuttle, users either (a) pollute Editor with wiki digressions or (b) manually retype in Research and lose thread linkage.  
- Same **B4 tray morals** as Brainstorm / Outline Import rich lane: Open does work; **Mark done** clears Active.

---

## Locked decisions (2026-07-20)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Who decides | **Propose by default** (model offers shuttle card). User confirms. Optional later pref: **always-shuttle** clear external-fact lookups. **No** silent full auto-shuttle of answers in v1. |
| **2** | Host thread content | **Brief redirect line + stub/card only** — no kit list / no full factual answer in host. Research (or target desk) does the real work after Open. |
| **3** | Return path | **Optional return packet**: summary + links from Research → **origin host tray**. User Open / Mark done. **No** auto-post into host transcript when Research finishes. |
| **4** | v1 matrix | **Outbound to Research** from **Editor, Outline, WB**. **Return only to origin host** that created the shuttle. Not full mesh. Brainstorm keeps existing handoff model (can align later). |
| **5** | Highlight → Note | **Both** chapter **prose selection** and **chat message selection** → actions: create Note and/or seed **Notes chat**. Complements N5 (whole message → note); this is **span-level**. |
| **6** | Crumb size | **Light:** question + story title + chapter title/number + ≤1–2 sentence scene crumb. **No** full chapter body, **no** full outline, **no** default lorebook dump. |
| **7** | Target Research chat | **Reuse last story-scoped Research chat** if one exists; else **create**. Do not force a new chat every shuttle. |
| **8** | Dismiss / “answer here” | **Short one-shot factual reply in host** (prefer no web tools; tag as off-desk). **Tray shuttle item remains Openable** later for a proper Research pass (dismissing the propose card ≠ destroying the shuttle). Not a full Research-grade dump in host. |
| **9** | Build order | **After Research S0–S2** (story/global mode, web+fetch, citations). Then H1–H5. **H6** (highlight→note) pairs naturally with Notes desk **K** when scheduled. Always-shuttle pref = H7 last. |

---

## Flow (Editor → Research)

```text
User message in Editor (or model classifies turn as external-fact digression)
  → Editor response: short redirect + Shuttle card
       destination: research
       payload: question text
       crumb: optional light context (story title, ch title/number, 1-line scene beat — NOT full chapter dump)
  → On user Confirm/Open:
       ensure/create Research chat (story mode default)
       seed composer or first user message with payload + crumb
       host tray item status → opened (stays Active until Mark done)
  → Research answers (S0–S5: web, cites, …)
  → Optional “Send brief back to Editor” → return packet on origin Editor tray
  → User Mark done on shuttle + return items when satisfied
```

**Always-shuttle pref (later):** skip card friction for high-confidence web lookups only; still no full answer in Editor — only stub + auto-opened tray item.

---

## Highlight → Note (both surfaces)

| Surface | Action |
|---------|--------|
| Editor prose selection | “Save as note” / “Send to Notes chat” (body = selection; title suggested) |
| Chat bubble selection (any host in matrix + Research/Notes as sensible) | Same |

- Default note `type`: `research` if from Research shuttle return or Research chat; else `idea` / user pick.  
- Does **not** auto-arm `includeInAi`.  
- Notes chat seed uses same composer-seed pattern as Brainstorm→Outline (`pendingChatComposerSeed` or successor).

---

## Tray shape

Reuse **B4 morals** (see Outline Import lock 13–14 / Brainstorm checklist):

| Action | Clears Active? |
|--------|----------------|
| Open / Confirm shuttle | No (`opened`) |
| Return packet arrives | No (new Active item) |
| Mark done / Dismiss | Yes |

**Storage:** same north star as Import — prefer **generalized work-checklist** (`source`: `shuttle` \| `outline_import` \| `brainstorm` \| …) rather than a third divergent lifecycle. Implement-time choice.

**Host UI:** compact tray under chat list (like Codex tray / Brainstorm checklist), filter Active/Done. Card shows destination, snippet of question, link to target chat.

---

## Relationship to Research lock (§6)

Research design currently says outbound Brainstorm-style handoffs = **none** (copy/paste). **Amend for shuttle:**

| Direction | Decision |
|-----------|----------|
| **Inbound** Research | Accept shuttle seeds from Editor/Outline/WB |
| **Outbound** from Research | **Return-to-origin** packets only (not general handoff mesh); still **note-proposal / save research note** on request (S3) |
| Research still **not** a lore/outline/prose writer | Unchanged |

S0–S5 remain the product surface that makes landing in Research worthwhile; shuttle can ship **stub + seed** before full web tools if needed, but **value** peaks when S1–S2 exist.

---

## Non-goals (v1)

1. Auto full answers in Editor “and also” shuttle  
2. Full desk mesh (Notes↔Outline↔Editor↔…)  
3. Silent canon writes from Research  
4. Stuffing full chapter text into Research context by default (crumb only)  
5. Replacing user judgment on craft questions (“what would *he* do with the knife?” stays Editor)

---

## Classification hint (non-normative)

Shuttle **candidate** when user asks external/world facts, procedures, real brands, history, tradecraft references, “what do people use for X in real life?”  

**Stay on host** when question is character motivation, prose wording, continuity with manuscript, Codex state, scene blocking.

Model **proposes**; user can Dismiss and say “answer here anyway.”

---

## Implementation slices (**H0–H7**)

Build **after S0–S2** unless explicitly prototyping. Each slice should leave the app shippable.

| ID | Slice | Delivers |
|----|--------|----------|
| **H0** | Schema/types | Work-item kinds `shuttle` / `shuttle_return`; B4 status morals; link `originChatId`, `destinationChatType`, payload JSON (question + light crumb) |
| **H1** | Editor propose path | Classify/propose card + redirect stub; no web tool dump in Editor generation path for shuttled turns |
| **H2** | Open → Research seed | Reuse last story Research chat or create; seed composer/message with question + crumb; story mode default |
| **H3** | Origin tray UI | Editor Active/Done; Open / Mark done / Dismiss-card; keep Openable after “answer here” |
| **H4** | Outline + WB hosts | Same propose/Open path as Editor |
| **H5** | Return packet | Research action “Send brief to origin” → origin tray (summary + links); no auto-transcript inject |
| **H6** | Highlight → Note | Prose + chat selection → create note and/or Notes chat seed; default unarmed |
| **H7** | Always-shuttle pref + docs | Optional pref; DECISIONS.md; backlog Done |

**Deps:** S0–S2 before calling Research shuttle complete. H6 can ship with K without full S.

---

## Acceptance criteria (v1)

- [ ] MI6-knives-style ask in Editor → propose card + redirect; **no** kit list in Editor  
- [ ] Confirm/Open → Research story chat (reuse last) seeded with question + light crumb  
- [ ] “Answer here” → short host reply; tray item still Openable  
- [ ] Return brief lands on origin tray only; Mark done clears  
- [ ] Outline + WB can propose Research shuttle  
- [ ] Prose and chat highlight → note / Notes chat  
- [ ] Research still does not write lorebook/outline/prose  

---

## Open at implement time only

| Topic | Notes |
|--------|--------|
| Exact crumb token cap | e.g. 500 chars scene crumb |
| Classifier prompt / heuristics | craft vs external fact |
| Work-tray table vs extend brainstormChecklist | same choice as Outline Import lock 14 |

---

*Design locked 2026-07-20. Build after S0–S2. Mirror in `CURRENT_BACKLOG.md`.*
