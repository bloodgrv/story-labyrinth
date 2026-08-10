# Lore Sheet Inline Rework with AI (T9) — Design

**Project:** Story Labyrinth
**Status:** **Design/scoping only — not built, not promoted.** Not grilled with the user yet; the axes below are proposals with a recommended default, not locks.
**Priority:** **P3** until promoted
**Talk list:** **T9**
**Slices:** **IR0–IR6** (proposed)
**Audience:** Claude Code (implementation) + Hermes (architecture)
**Related:** `docs/Lore_Sheet_And_Sync_Design.md` (T5, FS0–FS8, shipped — this doc extends it, does not reopen it), `docs/Chat_Panel_Integrations_Design.md` §2.1/§3 (Selection Rework Bridge, R0–R3), `docs/CURRENT_BACKLOG.md`

---

## 1. Job

Today the Lore Sheet (`sheetBody`, edited via `LoreSheetEditor.tsx`'s plain `<textarea>`) has exactly two AI touchpoints, and both are whole-document: a WB chat's `sheet-proposal` fence redrafts the entire sheet (Accept replaces it wholesale, per T5's FS4 lock), and "Improve with AI" is a one-shot stateless tidy-up over the whole sheet. There is no way to select one paragraph or sentence and rework just that span — the precedent that already exists for chapter prose (Lexical selection) and the Lorebook `description` field (plain-text selection) has never been extended to the sheet.

**Done means:** a user can highlight a span of Lore Sheet text, send it to the entry's docked WB chat with before/selection/after context, and Accept splices only that span back in — the rest of the sheet is untouched, and the same live-refresh path T5's FS4 already uses (`onEntryUpdated`) keeps the open form in sync without a reload.

**Not the job:** replacing or changing FS4's whole-sheet `sheet-proposal` path (it stays as-is, this is a second, narrower mechanism alongside it), touching "Improve with AI," or reworking chapter prose / the description field (those already have their own precedent, untouched by this doc).

---

## 2. Proposed mechanism

1. **Selection capture.** `LoreSheetEditor.tsx`'s field is a plain `<textarea>`, so capture is `selectionStart`/`selectionEnd` off the DOM node — the same shape `lorebookFieldAdapter.ts`'s `captureDescriptionSelection` already uses for the `description` field, not the heavier Lexical selection path chapter prose needs. A new sibling function (`captureSheetSelection`, same file or a new `sheetFieldAdapter.ts`) does the same slice-into-before/selection/after, plus resolves which `## Section` heading the selection falls inside via the sheet's own `parseSheetHeadings` (`sheetTemplates.ts`, already imported by `LoreSheetEditor.tsx`).
2. **FocusTarget.** A new discriminated-union member on `FocusTarget` (`src/types/rework.ts`) — e.g. `"lorebook-sheet-field"` — carrying `entryId`, `selectionStart`/`selectionEnd`, `text`, and (unlike the existing `"lorebook-field"` case) a `section: string | null` so both the UI and the prompt know which section is in play.
3. **Trigger UI.** A new `LoreSheetReworkButton.tsx`, same shape as the existing `LorebookReworkButton.tsx` (~15 lines: capture selection on click, call `requestRework`). Needs `entryId`/`storyId` available where it renders — `LoreSheetEditor.tsx` today only receives `control`/`category`, so either the button moves up into `LorebookEntryEditor.tsx` next to the sheet toolbar row (next to "Improve with AI" / "Insert template"), or those two props get threaded down. Verify `LorebookReworkButton`'s actual mount point before locking this — same pattern likely already applies.
4. **Hand-off to chat.** `pendingReworkStore.ts` needs zero changes — it's already generic over `FocusTarget`/`FocusPacket`, keyed by `panel: "worldbuilding"` + `anchorId: entryId`. The new button calls `requestRework({ panel: "worldbuilding", anchorId: entryId, storyId, target, packet })` exactly like the description field's button does today, reusing the existing find-or-create-on-rework flow into the docked WB chat.
5. **A new fence, not a reuse of `sheet-proposal`.** `SHEET_PROPOSAL_INSTRUCTIONS` (`chatContextService.ts`) explicitly tells the model to return the *entire* sheet every time — that's a locked FS4 behavior. Overloading the same fence with conditional "just this bit" instructions risks the model reverting to the well-reinforced whole-sheet habit. A distinct `sheet-span-proposal` fence, gated on a `"lorebook-sheet-field"` `FocusTarget` being active for that turn (mirrors how chapter-selection rework context injection already works), keeps FS4's path completely untouched.
6. **Accept splices, not replaces.** Unlike `handleAcceptSheet`'s wholesale `data: { sheetBody: proposal }`, the new handler fetches the *current* `sheetBody` fresh (not the possibly-stale value captured at selection time), re-checks the captured `text` still matches at the recorded offsets, and — only if it still matches — does `before + newSpan + after` using those offsets as splice points. Both this handler and the existing `handleAcceptSheet` already need to (and the existing one now does) call `onEntryUpdated?.(updated)`, the live-refresh path added to fix the "had to close and reopen the tab" bug — this is generic already and needs no new code for the sub-span case.

---

## 3. Open questions / risks (not locked — flag for the user before building)

| # | Axis | Risk | Recommended default |
|---|------|------|----------------------|
| 1 | **Staleness / drift** | The user may edit the sheet themselves between capturing a selection and the model's reply landing — the stored offsets (or even the captured text) may no longer match. | Exact-text re-check at Accept time; if it doesn't match, degrade (toast + no-op) rather than fuzzy-match or silently splice at the wrong offsets. Same doctrine already accepted elsewhere in this app — `RagIssueMarkNode`'s exact-substring-only highlight match explicitly chose "a paraphrased or since-edited excerpt just silently doesn't highlight, no fuzzy matching, no stale indicator" over guessing. |
| 2 | **New fence vs. reuse** | Reusing `sheet-proposal` is less new code but risks the model defaulting back to whole-sheet output (see §2.5). | New `sheet-span-proposal` fence, kept structurally distinct from FS4's. |
| 3 | **Section-boundary crossing** | Can a reworked span cross a `## Heading` boundary? Complicates both the prompt (which section skeleton applies?) and the splice (heading text itself could get rewritten). | Scope v1 to selections within a single section only; reject (toast) a cross-section selection rather than support it. |
| 4 | **"Improve with AI" scoped variant** | Should the one-shot tidy-up pass also gain a selection-scoped mode? | Out of v1 — flag as a possible later IR7, not blocking this doc. |

---

## 4. Non-goals (v1)

- Cross-section spans.
- A scoped variant of "Improve with AI."
- Fuzzy re-matching on drift (see risk #1) — exact-match-or-degrade only.
- Any change to FS4's whole-sheet `sheet-proposal` path, chapter-prose rework, or the `description`-field rework.

---

## 5. Proposed implementation slices

| ID | Work | Depends |
|----|------|---------|
| **IR0** | New `"lorebook-sheet-field"` `FocusTarget` variant (`src/types/rework.ts`) + `captureSheetSelection` adapter, including section-boundary resolution via `parseSheetHeadings` | — |
| **IR1** | `LoreSheetReworkButton.tsx` + wherever it needs to mount (resolve the `entryId`/`storyId`-threading question from §2.3) | IR0 |
| **IR2** | `sheet-span-proposal` fence + system-prompt instructions (`chatContextService.ts`), gated on an active `"lorebook-sheet-field"` focus target | IR0 |
| **IR3** | `ReworkCard` host-hint wiring for the new target kind (reuse the existing component, new `hostHint` string only — same pattern R4 used for Lorebook's own `hostHint` prop) | IR1, IR2 |
| **IR4** | Accept-splice handler (fresh-fetch + exact-match re-check + offset splice) in `ChatInterface.tsx`, calling the existing `onEntryUpdated` path | IR2 |
| **IR5** | Live-refresh verification — confirm the existing `onEntryUpdated`/`handleEntryUpdatedFromChat` path (built for FS4) already covers this case with no further changes | IR4 |
| **IR6** | Section-boundary validation + reject-with-toast UX for cross-section selections | IR0, IR1 |

**Recommended build order:** IR0 → IR1 → IR2 → IR3 → IR4 → IR5 → IR6.

---

## 6. References

- `src/types/rework.ts` — shared `FocusTarget`/`FocusPacket` union
- `src/features/rework/adapters/lorebookFieldAdapter.ts` — closest existing precedent (`description` field, plain-text selection)
- `src/features/lorebook/components/form/LorebookReworkButton.tsx` — trigger-button precedent
- `src/features/rework/pendingReworkStore.ts` — find-or-create-on-rework hand-off (needs no changes)
- `src/features/lorebook/components/form/LoreSheetEditor.tsx` — hosts the textarea + `parseSheetHeadings`
- `server/services/chatContextService.ts` (`SHEET_PROPOSAL_INSTRUCTIONS`) — where the new fence's instructions get added, kept distinct from the whole-sheet ones
- `src/features/chat/components/ChatInterface.tsx` (`handleAcceptSheet`/`handleAcceptSheetAndSync`) — model for the new splice-based Accept handler
- `src/features/lorebook/components/LorebookEntryEditor.tsx` (`handleEntryUpdatedFromChat`) — existing live-refresh path the new handler must also use
- `src/components/story-editor/plugins/RagIssueHighlightPlugin/index.tsx` — cited staleness-handling precedent (exact-match-or-degrade doctrine)

---

## 7. Document history

- **2026-08-09** — Scoped from a user question ("is the Lore Sheet inline-editable with AI?") asked while testing T5's sheet-proposal flow. Doc created, not designed with the user yet — P3, not promoted.
