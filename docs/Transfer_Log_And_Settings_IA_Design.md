# Transfer Log + Settings IA — Design

**Status:** **Design locked 2026-07-21** (grill) — **shipped 2026-07-22** (S0, T0–T3). See `DECISIONS.md`'s "Transfer Log + Settings IA — S0, T0-T3, Load-Bearing Decisions" and `docs/CURRENT_BACKLOG.md`.  
**Backlog:** Done  
**Related:** `docs/Chat_Shuttle_Design.md` (H0–H7 shipped); `docs/UI_Visual_Direction.md` (Appearance / themes)

---

## Job

Story-scoped **send journal** of **desk→desk seeds** (what left chat A for desk B) — train-of-thought continuity so the user can manually find “I sent X to Research last Tuesday.”

**Not** destination chat output (e.g. full Research answer).  
**Not** the Active work tray (checklist Mark-done workflow stays separate).

---

## Locked decisions (grill 2026-07-21)

| # | Axis | Lock |
|---|------|------|
| **1** | When to log | **`proposed` + `opened`** events on the same transfer timeline |
| **2** | What counts | **All desk→desk seeds** (not shuttle-only; not destination transcripts) |
| **3** | Retention | Default UI = last **30 days**; **hard delete at 90 days** |
| **4** | Where + jumps | **Settings redesign first**; Transfers under **Logs**; **Open origin** + **Re-seed destination** |
| **5** | Settings IA | Sub-nav headings (below) — not one long scroll |
| **6** | Story scope | **Story picker** on Logs (not tied to currently open story only) |
| **7** | Storage | Dedicated **`deskTransfers`** table; `brainstormChecklist` / trays unchanged |
| **8** | Row shape | Send metadata only; chat **title snapshots**; **no** answer body |
| **9** | v1 writers | Instrument **every known seed path** day one |
| **10** | Jump behavior | Re-seed = **replay seed only** (no auto-send, no extra log event); missing chats best-effort / desk create rules |
| **11** | Build order | **Settings IA shell first**, then Transfers fills Logs |
| **12** | Non-goals | See below |

---

## Settings IA v1 (from live audit)

**Today:** single scroll in `SettingsPage.tsx` — provider key cards → Grok OAuth → Feature endpoints → Local models → TTS → Humanizer → Grammar → Recent jobs → Demo data. Theme lives in chrome `ThemeToggle`, not Settings.

**Target headings (sub-nav or tabs):**

| Heading | Contents |
|---------|----------|
| **Appearance** | Theme (+ later chrome dials). Move or deep-link `ThemeToggle` here |
| **Providers & keys** | OpenAI, OpenRouter, Gemini, Grok key cards + Grok OAuth |
| **Local** | LocalModelsCard + base local API URL |
| **Feature routing** | FeatureEndpointsCard |
| **Writing tools** | TTS · Humanizer · Grammar |
| **Logs** | **Transfers** (this design) · **Recent jobs** (move from page bottom) · room to grow |
| **Data** | Demo data delete (+ future danger-zone items) |

Per-chat toggles (auto-shuttle, notes gates, etc.) **stay on chat chrome** — not Settings.

---

## Transfer log product

### Events

- **`proposed`** — seed offered / handoff created (e.g. shuttle card persisted, handoff packet accepted into tray, promote seeded).
- **`opened`** — user actually dispatched to destination (e.g. shuttle Open → Research seed applied).

Same logical transfer may have both events (timeline / status), not two unrelated mysteries.

### Row (`deskTransfers` — name flexible at implement)

| Field | Notes |
|--------|--------|
| `id`, `storyId`, `createdAt` | required |
| `event` | `proposed` \| `opened` (extend later only if needed) |
| `kind` | e.g. `shuttle`, `brainstorm_handoff`, `notes_promote`, … — full allowlist from code inventory at implement |
| `fromDesk`, `fromChatId`, `fromChatTitleSnapshot` | origin |
| `toDesk`, `toChatId?`, `toChatTitleSnapshot?` | destination (chat id if known at send) |
| `subject` | seed text / question (**what was sent**) |
| `crumb` | optional light context |
| `sourceChecklistItemId?` | optional link to tray row |
| **Excluded** | Destination answer body / full transcript |

### UI (Settings → Logs → Transfers)

- Story **picker**
- Default list: last **30 days**; optional control to show older until 90d purge
- Search by subject / desks / date
- Row actions:
  - **Open origin** — story + desk + select origin chat (toast if gone)
  - **Re-seed destination** — replay `subject` (+ crumb) via existing pending-seed mechanisms; **no** auto `generate()`; **no** new log event on re-seed alone

### Retention

- **UI default:** `createdAt >= now - 30d`
- **Hard delete:** `createdAt < now - 90d` (on read batch and/or scheduled tick — implementer choice)
- No disk `.md` temp files as primary store

### Writers (v1 — all known seed paths)

Inventory at implement time; must include at least:

- Chat Shuttle: propose + open (Editor / Outline / WB → Research)
- Brainstorm handoff opens/seeds (Outline / WB / Notes / Research as applicable)
- Notes promote / desk seeds that cross chats
- Any other `pendingShuttleSeed` / `pendingChatComposerSeed` / lorebook seed dispatches found in code

If a path only creates a tray row and never “opens,” still log **`proposed`**.

---

## Non-goals

1. Logging full destination **transcripts** as the log’s purpose  
2. Auto-injecting sends into origin chat **messages**  
3. Using the log as a **work tray** (no Mark-done lifecycle here)  
4. Cross-story global search in v1  
5. Real on-disk temp `.md` as SoT  
6. Replacing Agent job history — **Recent jobs moves under Logs**, remains jobs  

---

## Implementation slices

| Slice | Work |
|-------|------|
| **S0** | Settings shell: sub-nav/tabs; move existing cards into IA headings; Logs placeholder; relocate Recent jobs under Logs; Appearance hosts or links theme |
| **T0** | `deskTransfers` schema + API (list by story, filter 30d, create internal); 90d prune |
| **T1** | Instrument all seed paths → write `proposed` / `opened` |
| **T2** | Logs → Transfers UI: picker, list, search, origin jump, re-seed |
| **T3** | DECISIONS.md trail; backlog → Done when shipped |

**Deps:** S0 before T2 (4d). T0/T1 can overlap S0 after schema exists, but **do not** ship Transfers only on the old single-scroll page.

---

## Acceptance criteria

- [ ] Settings is no longer one undifferentiated long scroll; headings match IA table  
- [ ] Logs contains Transfers + Recent jobs  
- [ ] Creating/opening a shuttle (and other seed paths) creates durable transfer rows  
- [ ] Story picker lists transfers for that story (30d default)  
- [ ] Open origin / Re-seed work without auto-sending the model  
- [ ] Rows older than 90d are hard-deleted; UI emphasizes 30d  
- [ ] No destination answer body stored on transfer rows  
- [ ] Checklist trays still own Active work Mark-done  

---

## Document history

- 2026-07-21 — Grill locked; this doc created  
- 2026-07-22 — S0 + T0–T3 shipped. See `DECISIONS.md`'s "Transfer Log + Settings IA — S0, T0-T3, Load-Bearing Decisions" entry.
