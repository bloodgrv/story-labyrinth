# Chat Model Routing + Chat Chrome Density — Design

**Status:** **Design locked 2026-07-21** (grill + Lean) — **shipped 2026-07-22** (MR0-MR2, CC0, CL0 all done — see `DECISIONS.md`)  
**Priority:** **P3** until promoted  
**Related:** Settings IA (`docs/Transfer_Log_And_Settings_IA_Design.md` — Providers / Local); T4 token meter; lorebook density is separate (B8 shipped)

---

## Job

1. Opening a chat should be **ready to send** on a sensible model from Settings defaults + configured keys — **not** an empty model field and a flat list of every available model.  
2. Fast **Cloud ↔ Local** switch without hunting the full catalogue.  
3. **Thinner chat chrome** — context/memory/auto toggles collapsed by default.  
4. **Dense chat list** — compact rows, not fat card-like rows.

---

## Current reality (audit 2026-07-21)

| Area | Today |
|------|--------|
| Settings | Per-provider **default model** fields exist (`defaultGrokModel`, `defaultLocalModel`, OpenAI/OR/Gemini/Grok OAuth, …). |
| Chat model | `useChatSystemPrompt` uses only `chat.lastUsedModelId`. If unset → `selectedModel` null. Picker = flat `Select` over **all** `availableModels` (`ChatSystemPromptControl`). |
| Feature endpoints | Override **jobs** (scanner, beat_detection, …), **not** chat composer default. |
| Chat chrome | Model + Edit system prompt + many Notes/Outline/memory/auto-* toggles stacked (desk-dependent) — crowded. |
| Chat list | `ChatListItem`: `p-4`, title + full date/time stack + action row — dense list not implemented (unlike lorebook Cards\|List). |

---

## Locked decisions

### Axis 1 — Model default + routing

| # | Decision | Lock |
|---|----------|------|
| **M1** | Global preferred mode | Settings sticky **`Cloud` \| `Local`** for chat generation default. |
| **M2** | Cloud default model | Active cloud provider’s **Settings default model** (e.g. Grok → `defaultGrokModel`). |
| **M3** | Primary cloud when multiple keys | **B — implicit:** last-used **cloud** provider if still configured; else fixed priority **Grok → OpenRouter → OpenAI → Gemini → Grok OAuth** (skip unconfigured). **No** separate “primary provider” dropdown in v1. |
| **M4** | Local default model | `defaultLocalModel` when mode = Local and local URL configured. |
| **M5** | New chat / missing `lastUsedModelId` | Auto-select **mode default**. Never leave empty if any resolvable default exists. |
| **M6** | Existing chat with `lastUsedModelId` | Keep if model still in catalogue; else fall back to mode default. Persist changes to `lastUsedModelId` as today. |
| **M7** | Chat control UI | Compact: **`[Cloud \| Local]`** segmented control + **current model** control. Model menu **filtered by mode** (local-only / cloud-only). Cloud menu **grouped by provider**. Full catalogue only under **More…** (optional v1). |
| **M8** | Per-desk defaults | **Out of v1** (Editor=local, Research=cloud later if wanted). |
| **M9** | Feature endpoints | Unchanged — still job overrides, not chat default. |

### Axis 2 — Context / memory chrome collapse

| # | Decision | Lock |
|---|----------|------|
| **C1** | Grouping | Notes/Outline include gates, desk-specific lore/memory gates, auto-accept / auto-insert / auto-shuttle (as applicable) live under one **“Context & memory”** disclosure. |
| **C2** | Default UI | **Collapsed** by default. |
| **C3** | Collapsed summary | Chip/text of **armed** options only (e.g. `Notes · Outline`); quiet if none. |
| **C4** | Always visible | Mode+model, composer/Send, token meter when in scope (T4). |
| **C5** | Edit system prompt | Move to **overflow (⋯)** — not a permanent primary button. |
| **C6** | Collapse state | **localStorage** global (or per desk if cheap); toggle **values** still per-chat server fields as today. |

### Axis 3 — Chat list density

| # | Decision | Lock |
|---|----------|------|
| **L1** | Layout | **Always compact list** (no Cards\|List dual mode for chats). |
| **L2** | Row | Single line: **title** (truncate) · muted **relative/short time** · edit/delete **hover/focus only**. |
| **L3** | Padding | Tight (`py-1.5 px-2` class of density); drop stacked full datetime block. |
| **L4** | Folders | Keep tree indent (B9); only leaf row chrome changes. |
| **L5** | Provider dots on rows | **Out of v1**. |

---

## Settings placement

- **Preferred mode (Cloud | Local):** Settings → **Providers** (chat default routing) — short row; Local tab still owns URL + default local model.  
- Aligns with Settings IA headings; implement can land before or after full S0 shell — do not block on Transfer log.

---

## Build slices

| Slice | Work |
|-------|------|
| **MR0** | Settings: preferred mode Cloud\|Local + persist (`aiSettings` or equivalent). |
| **MR1** | `resolveChatDefaultModel({ mode, settings, lastUsedModelId, availableModels })` helper + unit-worthy pure logic. |
| **MR2** | Chat UI: Cloud\|Local toggle + filtered/grouped model menu; wire `useChatSystemPrompt` / create-chat path. |
| **CC0** | Collapse **Context & memory**; summary chips; Edit prompt → ⋯. |
| **CL0** | Compact `ChatListItem` (+ folder leaf parity). |

**Suggested order:** MR1 → MR0 → MR2 (logic then settings then UI), parallel **CL0**; **CC0** after or with MR2 (same chrome strip).

---

## Non-goals (v1)

- Per-desk / per-chatType default mode matrix  
- Auto model routing by cost/latency  
- Replacing feature-endpoint system  
- Lorebook-style dual density for chats  
- Rewriting chat message list / trays  
- Forcing user to re-pick model every session when lastUsed is valid  

---

## Verification

- With only Grok default + Local Artemis set: new chat opens on Grok when mode=Cloud, Artemis when mode=Local — **no** empty model.  
- Toggle Cloud↔Local switches to that mode’s default (or lastUsed if still valid in that mode — Lean: **lastUsed only if it belongs to the new mode**; else mode default).  
- Model dropdown under Local shows local models only.  
- Context toggles hidden until expand; armed summary visible when collapsed.  
- Chat list rows ~one line; folders still work.  
- Existing chats with lastUsed still restore that model when available.  

### Toggle + lastUsed clarification (locked)

When user flips **Cloud ↔ Local**:

- If `lastUsedModelId` is available **and** its provider matches the new mode → keep it.  
- Else → select that mode’s default model and persist.

---

## Document history

| Date | Change |
|------|--------|
| 2026-07-21 | Lean-locked three axes: preferred Cloud\|Local mode; implicit primary cloud (B); filtered model UI; context collapse; compact chat list. Slices MR0–MR2, CC0, CL0. |
| 2026-07-22 | Shipped in full. See `DECISIONS.md`'s "Chat Model Routing + Chat Chrome Density — MR0-MR2, CC0, CL0" entry for the load-bearing trail. |
