# Chat Chrome Declutter — Drawer Rail (T10) — Design

**Project:** Story Labyrinth
**Status:** **Design/scoping only — not built, not promoted.** Not grilled with the user yet; user has confirmed this is its own talk-list item (T10), not folded into T8.
**Priority:** **P3** until promoted
**Talk list:** **T10**
**Slices:** **CR0–CR8** (proposed)
**Audience:** Claude Code (implementation) + Hermes (architecture)
**Related:** `src/features/chapters/components/EditorToolsPanel.tsx` (pattern this mirrors), `src/features/chat/components/ChatInterface.tsx`/`ChatList.tsx` (shared engine every host below composes), `docs/CURRENT_BACKLOG.md`'s T8 row (adjacent but separate — see §6)

---

## 1. Job

The Editor's right rail (`EditorToolsPanel.tsx`) declutters the chapter view: a slim icon column, each icon opens exactly one tool on demand (Scanner, History, Outline, POV, Beats), nothing else competes for space until asked for. The five other chat hosts (World-Building, Outline, Notes, Research, Brainstorm) have no equivalent — chat list, Codex/approval tray, Context & memory toggles, and (for WB) playbook/psych controls are all composed as permanently-visible siblings, and the exact mix varies by host with no consistent chrome.

**Done means:** each of the five chat hosts gets the same "icon rail, one thing open at a time" declutter the Editor already has, without regressing any live-interaction behavior the current always-visible layout happens to support for free (see §4's non-negotiable risk).

**Not the job:** a general app-wide visual-polish pass (that's T8's own, still-unscoped, remit), redesigning the Editor's own rail, or moving `CodexPendingChangesPanel` (the entry-scoped Lore Sheet Sync tray, which lives in the entry form, not in any chat) — flagged as explicitly out of scope in §5.

---

## 2. The precedent, precisely — two different mechanisms, not one

`EditorToolsPanel.tsx` is actually two distinct patterns bundled under one rail, and the design below has to keep them separate rather than copy-pasting one shape everywhere:

1. **Icon rail + single-active-modal-drawer** (`sidebarButtons`/`DrawerType`, `SimpleDrawer`) — Tags/Outline/POV/Beats/Scanner/History. Built on `@/components/ui/drawer` (`vaul`), a **bottom-sheet with a backdrop** that blocks interaction with what's behind it. (Chapter Notes is the one exception: a right-docked `Sheet`, same backdrop-modal behavior, just different side.)
2. **A "Chats" toggle that is not a drawer at all** — `EditorToolsPanel`'s Chats button just shows/hides `EditorChatRail`, a plain sibling column (width-animated 0↔300px, **no backdrop, no modal**, transcript stays visible and interactive the whole time).

The user's own framing ("a chats button... having slide out controls like the chats slide out") reads as if all four buttons should behave like #2. They can't all safely be modal drawers — see §4, risk 1.

---

## 3. Chrome inventory (host × bucket matrix)

| Host | Chat list | Codex tray (chat-scoped) | Codex pending (entry-scoped) | Shuttle tray | Context & memory | Guided Setup | Playbook extras | Host-specific extras |
|---|---|---|---|---|---|---|---|---|
| **Editor** (reference) | ✅ 300px, non-modal | ✅ | n/a | ✅ | ✅ | — | — | — |
| **World-Building** | ✅ 300px | ✅ | ✅ **but lives in the entry form, not the chat rail** | ✅ | ✅ | ✅ | ✅ (psych prompt, Open Playbooks, playbook-pack toggle) | Entry form itself (History/Psych/Map/Timeline buttons) visually competes too, but isn't chat chrome |
| **Outline** | ✅ 300px | ✅ | n/a | ✅ | ✅ | ✅ (no extras) | — | `OutlineImportCard`, `OutlineProposalTray`, "Import structure document…" button in the chat header |
| **Notes** | ✅ 300px | ❌ (`NotesChecklistTray` instead) | n/a | ❌ | ✅ (Notes-specific toggles only) | ❌ | — | — |
| **Research** | ✅ (Story mode) / `GlobalResearchChatList` (Global mode) | ❌ | n/a | ❌ (inbound-only) | ✅ (web-search toggle only) | ❌ | — | Story/Global mode `Tabs`, shuttle-return banner |
| **Brainstorm** | ✅ 300px | ❌ (`BrainstormChecklistTray` instead) | n/a | ❌ | ✅ (Notes/Outline/Memory/Lorebook/chapter-summaries) | ✅ (no extras) | — | — |

Confirmed via `ChatInterface.tsx`'s own `usesCodexTray`/`usesShuttle` gates: Research/Notes/Brainstorm never render the Codex or Shuttle trays at all — a shared rail's button set has to be **host-configured**, not one static array like `EditorToolsPanel`'s `sidebarButtons`.

The "Context & memory" disclosure already went through one density pass (CC0) — it's collapsed by default with an "armed" summary chip when closed. It is not raw clutter today; any rail treatment of it must preserve that glanceability, not regress behind a fully-opaque drawer (§4, risk 3).

---

## 4. Proposed mechanism and non-negotiable risks

A shared `ChatToolsRail` (`src/features/chat/components/ChatToolsRail.tsx`, beside `ChatList.tsx`) — icon column + single-open-panel state, host-configured button list — composed as a sibling of `ChatInterface` in each host rail file, the same seam `ChatList`/trays already sit in today. `ChatInterface.tsx` itself should not own the rail (same reasoning `EditorToolsPanel` lives beside `StoryEditor` rather than inside the shared prose editor).

**Risks that are real product decisions, not just visual polish — must be resolved before slices are locked:**

1. **The chat list cannot become a modal drawer without losing today's free behavior.** You can currently see the transcript and switch chats simultaneously. A `vaul`/`Sheet` drawer blocks that. Recommendation: "Chats" stays the non-modal collapsible-column pattern (mechanism #2 above, formalizing `EditorChatRail`'s own precedent) — not a backdrop drawer like Scanner/History. "Approvals" (Codex/Shuttle/checklist trays) is safer as a real modal drawer, since reviewing a proposal doesn't need the transcript visible at the same time the way switching chats does.
2. **Pending-count badges must survive collapse.** Nothing forces a closed rail icon to go silent about pending items — this app already has the precedent (Relationships/Timeline's "Pending" tab live-count badge). Every tray candidate already fetches counts via React Query; wiring a badge onto the closed icon is additive.
3. **"Context & memory" must stay glanceable, not regress to a blind toggle.** Reuse the existing armed-labels summary chip on the rail's closed icon rather than hiding toggle state entirely behind a click.
4. **`CodexPendingChangesPanel` (WB's entry-scoped Lore Sheet Sync tray) doesn't fit a chat-scoped rail** — it lives in the entry form, not any chat, and reviews proposals regardless of source (chat OR the Sync job). Recommendation: leave it in the entry form, explicitly out of scope here (§1) — flagging it as a candidate for a *separate* entry-editor density pass (T8 or T5-adjacent territory), not this one.
5. **Per-host collapse-state duplication is already a mess worth fixing here.** Every host rail (`OutlineChatRail`, `NotesChatRail`, `BrainstormTool`, WB's panel) independently reinvents `railCollapsed`/`chatListCollapsed` local state to keep `ChatList` + sibling trays in sync — a shared rail component is a natural forcing function to collapse this into one hook, not purely a visual change.
6. **Host-specific extras don't fit a generic 4-icon rail.** Research's mode `Tabs` (chat *identity* selection, not a tool) and Outline's import card/button stay bespoke — the rail needs an explicit "host extras" slot rather than trying to cram everything into four buttons.
7. **Guided Setup's collapse (`headerExpanded`, local state) and Context & memory's collapse (`contextMemoryExpanded`, localStorage) are two independent mechanisms today** — worth consolidating into rail-driven state as part of this work rather than leaving both inside `ChatInterface`.

---

## 5. Non-goals (v1)

- Moving or redesigning `CodexPendingChangesPanel`'s placement (risk 4) — stays in the entry form.
- Research's Story/Global mode tabs and Outline's import entry point — stay bespoke, not folded into the 4-button rail.
- A general app-wide visual-polish pass — that's T8's own separate, still-unscoped remit (see §6).
- Mobile — none of the 5 hosts currently have a mobile-floating-menu equivalent to `EditorToolsPanel`'s own; out of scope until mobile itself is addressed (see the separate, already-flagged "Mobile responsive overhaul" backlog item).

---

## 6. Relationship to T8

T8 ("UX/UI polish cleanup") is a currently-unscoped, parked backlog item — "hierarchy, density, chrome quieting, polish... full toolbox, not a cull," explicitly waiting on a grilled/locked scope before any build. This chat-chrome redesign covers similar ground (declutter, hierarchy) but is scoped tightly to one surface family (the five chat hosts) with its own concrete mechanism (icon rail + drawers) and its own risk list. **User confirmed 2026-08-09 this stays its own talk-list item, T10 — not folded into T8.** T8 remains open for a separate, broader pass (app-wide chrome, Lorebook entry-form density including `CodexPendingChangesPanel`'s placement) whenever it gets its own grill session.

---

## 7. Proposed implementation slices

| ID | Work | Depends |
|----|------|---------|
| **CR0** | Extract the shared `ChatToolsRail` shell (icon column + single-open-panel state) as a pure refactor of the coordination logic already duplicated across the 6 rail files (`railCollapsed`/`chatListCollapsed` state, `ChatList`+tray composition) — no visual/behavior change yet, proves the shared shape | — |
| **CR1** | "Chats" button: formalize the non-modal collapsible-column pattern as the rail's own primitive (resolves risk 1 explicitly) | CR0 |
| **CR2** | "Approvals" button (Codex tray + Shuttle tray, chat-scoped hosts only): wire into rail as a real drawer, badge-count treatment (risk 2) | CR0 |
| **CR3** | "Approvals" equivalent for Notes/Brainstorm (`NotesChecklistTray`/`BrainstormChecklistTray` in the same rail slot, different content) | CR0 |
| **CR4** | "Context" button: port the existing `Collapsible` + armed-labels chip into the rail pattern, preserving glanceability (risk 3) | CR0 |
| **CR5** | "Playbook"/Guided Setup button: WB-only extras (psych prompt, Open Playbooks, playbook-pack toggle) + the shared Guided Setup shell for WB/Outline/Brainstorm | CR0 |
| **CR6** | Host-specific extras slot: Outline's import card/button, Research's mode tabs — explicit "doesn't fit the 4 buckets" handling (risk 6) | CR0 |
| **CR7** | Per-host rollout, one host at a time — suggest Outline or Notes first (fewest extra buckets) before World-Building (most complex, entry-form split per risk 4) | CR1–CR6 |
| **CR8** | Polish: badge counts, collapse-animation consistency with `EditorToolsPanel`'s own expand/collapse icon-label toggle; mobile equivalent explicitly deferred (§5) | CR7 |

**Recommended build order:** CR0 → CR1 → CR4 → CR2 → CR3 → CR5 → CR6 → CR7 → CR8.

---

## 8. References

- `src/features/chapters/components/EditorToolsPanel.tsx` — the pattern being mirrored (and the two-mechanism split to preserve, §2)
- `src/features/chat/components/EditorChatRail.tsx` — the actual non-modal "chats slide out" precedent
- `src/features/chat/components/ChatInterface.tsx` — owns Context & memory disclosure, Guided Setup collapse; any shared rail threads `selectedChat`/host flags through here unchanged
- `src/features/chat/components/ChatList.tsx` — existing per-host collapse primitive (`w-[250px] sm:w-[300px]` ↔ `w-0`) to formalize into the rail's "Chats" button
- `src/features/chat/components/CodexProposalTray.tsx`, `ShuttleTray.tsx`, `NotesChecklistTray.tsx`, `BrainstormChecklistTray.tsx`, `OutlineProposalTray.tsx` — the per-host "Approvals" bucket contents
- `src/features/lorebook/components/LorebookEntryEditor.tsx` — most complex host (WB); `CodexPendingChangesPanel`'s entry-scoped placement decision lives here (out of scope, §5)
- `src/features/outline/components/OutlineChatRail.tsx`, `src/features/notes/components/NotesChatRail.tsx`, `src/components/workspace/tools/BrainstormTool.tsx`, `src/components/workspace/tools/ResearchTool.tsx` — the other 4 hosts, each with a variant of the same duplicated rail-collapse pattern (CR0's target)

---

## 9. Document history

- **2026-08-09** — Scoped from a user complaint ("the chat surfaces are not working for me... declutter the chat window") comparing favorably to the chapter Editor's own right rail. Research pass surveyed all 5 chat hosts + the Editor precedent; user confirmed this stays its own T10 item rather than folding into the still-unscoped T8. Doc created — P3, not promoted, not grilled.
