# Chat Chrome Declutter — Drawer Rail (T10) — Design

**Project:** Story Labyrinth  
**Status:** **Shipped in full 2026-08-11** — Axes 1–6 locked 2026-08-10; slices CR0–CR8 all built. Promoted P3→P0 2026-08-11.  
**Priority:** **P3** until promoted  
**Talk list:** **T10**  
**Slices:** **CR0–CR8** (frozen)  
**Audience:** Claude Code (implementation) + Hermes (architecture)  
**Related:** `src/features/chapters/components/EditorToolsPanel.tsx` (pattern this mirrors), `src/features/chat/components/ChatInterface.tsx`/`ChatList.tsx` (shared engine every host below composes), `docs/CURRENT_BACKLOG.md`'s T8 row (adjacent but separate — see §6)

---

## Locked decisions (grill)

| # | Axis | Lock | Date |
|---|------|------|------|
| **1** | Job | **A** — Editor-style icon rail on the **five** non-Editor chat hosts (WB, Outline, Notes, Research, Brainstorm): slim icon column, **one panel open at a time**, without folding into T8. Done = same declutter pattern on all five hosts, no free live-interaction behavior lost. **Not the job:** app-wide polish (T8), redesigning the Editor's own rail, or moving entry-scoped `CodexPendingChangesPanel` (Lore Sheet Sync tray stays on the entry form). | 2026-08-10 |
| **2** | Chats mechanism | **A** — **Non-modal collapsible column** (Editor Chats / `EditorChatRail` precedent: width 0↔~300px, no backdrop). Transcript stays visible and interactive while the list is open. Not a `vaul`/Sheet modal drawer. | 2026-08-10 |
| **3** | Non-Chats open mechanism | **A** — **Modal drawers** (backdrop; blocks transcript) for Approvals, Context & memory, Guided/Playbook, and any other non-Chats rail buckets. Same class as Editor Scanner/History. Chats remain the special non-modal case (Axis 2). One rail panel open at a time still applies. | 2026-08-10 |
| **4** | Rail buckets + closed signals | **A (package)** — Host-configured icons: **Chats** (all 5); **Approvals** (Codex+Shuttle / checklist / outline-proposal trays by host) with **pending count badge** on closed icon; **Context** (hosts with toggles) with **armed summary chip** on closed icon; **Playbook/Guided** (WB/Outline/Brainstorm only). Research Story\|Global + Outline import stay **host extras** (not forced into the 4 buckets). Entry Sync tray still out (Axis 1). Unread/active on Chats not required v1. | 2026-08-10 |
| **5** | Host extras + collapse ownership | **A (package)** — (5a) Explicit **host-extras slot** on the shared rail shell: Research Story\|Global stays top chrome (chat identity, not a tool icon); Outline import stays a compact header/card affordance outside the four buckets (implementer may place in extras strip or Approvals-adjacent header — not a fake 5th bucket). (5b) **Shared rail owns** open-panel + Chats-column collapse; Context/Guided open state becomes **rail-driven** (optional persist of last-open prefs allowed, not required). Kill parallel `headerExpanded` / `contextMemoryExpanded` / per-host `railCollapsed`/`chatListCollapsed` machines for those surfaces. | 2026-08-10 |
| **6** | First paint + rollout | **B + rollout package** — **Chats column collapsed on first paint** (max declutter). All modal drawers closed. **No auto-open Approvals** when pending > 0 (badge only). Optional remember last Chats open/closed after user has toggled once; drawers never sticky-open across navigation. **Rollout order:** Notes → Outline → Brainstorm → Research → WB last. CR0 shell first; CR8 polish last. Mobile out (non-goal). | 2026-08-10 |

---

## 1. Job

The Editor's right rail (`EditorToolsPanel.tsx`) declutters the chapter view: a slim icon column, each icon opens exactly one tool on demand (Scanner, History, Outline, POV, Beats), nothing else competes for space until asked for. The five other chat hosts (World-Building, Outline, Notes, Research, Brainstorm) have no equivalent — chat list, Codex/approval tray, Context & memory toggles, and (for WB) playbook/psych controls are all composed as permanently-visible siblings, and the exact mix varies by host with no consistent chrome.

**Done means:** each of the five chat hosts gets the same "icon rail, one thing open at a time" declutter the Editor already has, without regressing any live-interaction behavior the current always-visible layout happens to support for free (see §4).

**Not the job:** app-wide polish (T8), redesigning the Editor's own rail, or moving entry-scoped `CodexPendingChangesPanel` (Lore Sheet Sync tray stays on the entry form).

*(Axis 1 locked **A**.)*

---

## 2. The precedent — two mechanisms

`EditorToolsPanel.tsx` bundles two patterns:

1. **Icon rail + single-active-modal-drawer** (`SimpleDrawer` / `vaul`) — backdrop blocks interaction behind (Scanner, History, etc.).
2. **Chats toggle** — non-modal sibling column (`EditorChatRail`, width 0↔300px, no backdrop).

**Axis 2 A** = Chats uses #2. **Axis 3 A** = all other rail buckets use #1.

---

## 3. Chrome inventory (host × bucket)

| Host | Chat list | Codex tray (chat) | Entry Sync tray | Shuttle | Context | Guided | Playbook extras | Host extras |
|---|---|---|---|---|---|---|---|---|
| **Editor** (ref) | ✅ non-modal | ✅ | n/a | ✅ | ✅ | — | — | — |
| **WB** | ✅ | ✅ | ✅ **entry form only — out of T10** | ✅ | ✅ | ✅ | ✅ | entry form chrome |
| **Outline** | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | — | import card/button, proposal tray |
| **Notes** | ✅ | checklist tray | n/a | ❌ | ✅ | ❌ | — | — |
| **Research** | ✅ / Global list | ❌ | n/a | inbound only | web-search | ❌ | — | Story\|Global tabs |
| **Brainstorm** | ✅ | checklist tray | n/a | ❌ | ✅ | ✅ | — | — |

Button sets are **host-configured**. Context armed-chip glanceability must survive (CC0).

---

## 4. Mechanism + locked risks

Shared `ChatToolsRail` (`src/features/chat/components/ChatToolsRail.tsx`) beside `ChatList` — sibling of `ChatInterface`, not inside it.

1. Chats = non-modal column (Axis 2)  
1b. Non-Chats = modal drawers (Axis 3)  
2. Approvals closed icon = pending badge (Axis 4)  
3. Context closed icon = armed summary chip (Axis 4)  
4. Entry Sync tray out (Axis 1)  
5. Rail owns collapse; Context/Guided rail-driven (Axis 5b)  
6. Host-extras slot for Research tabs + Outline import (Axis 5a)  
7. First paint: **Chats collapsed**; drawers closed; no auto-open Approvals (Axis 6 B)

---

## 5. Non-goals (v1)

- Entry-scoped `CodexPendingChangesPanel` placement (T8 / later)  
- Folding Research tabs or Outline import into the four generic icons (they use host-extras)  
- App-wide polish (T8)  
- Mobile floating menu  

---

## 6. Relationship to T8

T10 is **not** a T8 slice. T8 remains parked for broader hierarchy/density/chrome including entry-form density. User direction 2026-08-09 + Axis 1.

---

## 7. Frozen slices

| ID | Work | Depends |
|----|------|---------|
| **CR0** | Extract `ChatToolsRail` shell — pure refactor of duplicated collapse coordination | — |
| **CR1** | Chats non-modal column; **default collapsed**; optional remember after first toggle | CR0 |
| **CR2** | Approvals modal (Codex+Shuttle) + pending badge | CR0 |
| **CR3** | Approvals slot for Notes/Brainstorm checklists | CR0 |
| **CR4** | Context modal + armed chip on closed icon | CR0 |
| **CR5** | Playbook/Guided modal (WB extras + shared Guided) | CR0 |
| **CR6** | Host-extras slot (Outline import; Research Story\|Global) | CR0 |
| **CR7** | Rollout: **Notes → Outline → Brainstorm → Research → WB** | CR1–CR6 |
| **CR8** | Polish / animation parity with EditorToolsPanel; mobile deferred | CR7 |

**Build order:** CR0 → CR1 → CR4 → CR2 → CR3 → CR5 → CR6 → CR7 → CR8.

---

## 8. References

- `EditorToolsPanel.tsx`, `EditorChatRail.tsx`, `ChatInterface.tsx`, `ChatList.tsx`
- Trays: `CodexProposalTray`, `ShuttleTray`, `NotesChecklistTray`, `BrainstormChecklistTray`, `OutlineProposalTray`
- Hosts: `LorebookEntryEditor`, `OutlineChatRail`, `NotesChatRail`, `BrainstormTool`, `ResearchTool`

---

## 9. Document history

- **2026-08-09** — Scoped; T10 kept separate from T8; P3, not promoted.
- **2026-08-10** — Full grill Axes **1–6 locked**. Chats collapsed first paint. CR0–CR8 frozen. **Not promoted.**
- **2026-08-11** — Promoted P3→P0; CR0–CR8 all built and live-verified across all 5 hosts. **T10 shipped in full** — see `docs/CURRENT_BACKLOG.md`'s CR0–CR8 entries for the per-slice build trail.
