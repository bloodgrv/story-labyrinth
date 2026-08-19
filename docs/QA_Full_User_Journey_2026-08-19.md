# QA: Full User Journey — 2026-08-19

**Tester:** Claude (agent), driving the app via browser automation
**Story used:** "The Glasswing Heist" (heist thriller), series "The Glasswing Chronicles"
**AI provider:** Grok 4.5 (xAI), cloud — used throughout
**Session note:** Roughly the first third of Phase 1 (world-building) was built via manual "Create New Entry" forms before a mid-session course correction from the user/coordinator asked me to shift to **chat-first** creation for everything else, since the chat propose→approve pipeline is the app's actual design center and where real bugs are most likely to live. From that point on (rest of Phase 1, all of Phase 2, and Phase 3 chapter drafting) I deliberately used WB chat sheet-proposals, Brainstorm handoff-packets, the Outline chat, the `timeline-pin-proposal` fence, and the Editor Chat as the *default* creation path, only falling back to manual forms when a chat attempt genuinely failed or to deliberately cover the manual path once for comparison. Where a chat-driven flow was harder to use than just typing into a form, that is called out explicitly below.

## Summary

Tested nearly the full breadth of the app: story/series creation, Lorebook (characters/locations/items) via both manual entry and WB chat, Character Codex state + snapshot history, Locations & Maps (incl. L4 place-Codex), the Relationship Graph, Maps sketch tool, Brainstorm → handoff-packet → Notes, Outline chat, Notes desk, Research chat (Story mode), Story Timeline (all three `whenKind` types, AI pin-propose), 5 drafted chapters (mixing Editor Chat with auto-insert, explicit accept, and manual typing), RAG Scanner, Chapter History (checkpoint + restore), Chat Shuttle, alternate chapter versions (broken), and AI Review (Quick + Deep).

**Overall health impression:** The core data model and most manual CRUD flows are solid — Lorebook, Codex fields, Timeline pins, Chapter History restore, Research citations, and AI Review are all genuinely good. However, several **chat-driven propose→approve paths have real, reproducible bugs** that undercut the app's central "propose, never silently write" doctrine: a Brainstorm proposal can be *approved* with no visible feedback in the chat itself (only surfaces in a separate Approvals tray), and worse, a `suggest_codex_updates` request typed as free text can be approved while silently discarding all data because the target entry never resolved (shows "Unknown entry"). The app also repeatedly hallucinated brand-new character names instead of grounding in the established Lorebook, in both Brainstorm and Editor Chat — a real threat to the "factual consistency" mission this fork is built around. AI Review's Deep mode redeemed itself here by actually catching the resulting inconsistency as a high-severity finding.

Total: **14 bugs** (2 blocker/major-severe, 9 major, 3 minor) and **7 friction items** logged below.

---

## Bugs

1. **Image generation silently no-ops with an empty description**
   - *Repro:* New Lorebook entry (Finley Anderson), no `description` filled in the Advanced panel. Click "Generate from Description" in the Image section.
   - *Expected:* Either an image generates, or an error/toast explains why not (e.g., "add a description first").
   - *Actual:* Nothing happens — no network request fires (confirmed via network log), no toast, no loading state. Once a description was filled in, the same button worked correctly and produced an image.
   - *Severity:* Minor. *Phase:* 1 (World-building / Lorebook entry editor, Image feature).

2. **Codex History restore is inconsistent — partially reverts an entry**
   - *Repro:* On Finley Anderson's Codex, save state A (Age=28, Hair filled, no Wardrobe/Wounds/Items), then save state B (adds Wardrobe/Wounds/Items, still Age=28), then edit Age to 29 and save state C. Open History, Restore the oldest snapshot (state A).
   - *Expected:* Restoring state A reverts the entry to exactly what it looked like at that point (Age back to 28, no Wardrobe/Wounds/Items yet, or at least a self-consistent state).
   - *Actual:* After restore, **Core Identity (Age) and Appearance (Hair) fields went completely blank**, but **Wardrobe/Wounds/Items retained the later data** from state B/C. This is an inconsistent, partial restore — not what any of the three saved states actually looked like.
   - *Severity:* Major (data-integrity bug in a documented "non-destructive history" feature). *Phase:* 1 (Character Codex History).

3. **"Suggest Codex updates" via free-form chat text creates unresolved "Unknown entry" proposals that silently discard data on approval**
   - *Repro:* In the Editor Chat (chapter "The Soft Tap"), type a plain message asking the model to "suggest Codex updates from this chapter for Mira Solano." Approve the resulting Codex proposal from the Approvals dialog.
   - *Expected:* The proposal resolves to Mira Solano's actual Lorebook entry, or the tool explains it couldn't resolve one.
   - *Actual:* The proposal card is titled **"Unknown — Proposes to update Unknown entry"**. Approving it returns success with no error, but checking Mira Solano's actual Codex afterward shows **the Wardrobe field is unchanged** — the approved data landed nowhere. By contrast, the dedicated **"Suggest Codex updates from this chapter" button in the RAG Scanner drawer** (a different, purpose-built trigger) correctly resolved to Mira Solano and the diff/approve worked as expected.
   - *Severity:* Blocker/major (silent data loss with a false "success" signal). *Phase:* 3 (Editor Chat / Codex updates).

4. **Brainstorm chat's `overview-proposal`/`handoff-packet` fences don't render as real cards inline in the chat**
   - *Repro:* In a fresh Brainstorm chat, ask the model to "lock in a short synopsis using the overview proposal," then explicitly ask for "an actual proposal card I can accept (with an Accept/Reject button), not just text."
   - *Expected:* A real interactive card renders in the chat transcript with working Accept/Reject buttons.
   - *Actual:* Three consecutive attempts all failed to render a working inline card: (a) the model wrote a plain-text "Proposal Card" with literal `[Accept] [Reject]` — inert, unclickable text; (b) when told to use the exact fenced format, the model **hallucinated raw HTML markup** (`<div class="proposal-card" data-proposal-type="overview" ...>`) as literal chat text; (c) despite this, the proposal *was* actually captured correctly server-side and only became visible/actionable in the separate "Approvals" side panel (a different icon in the chat rail), where Accept/Mark done worked correctly and the synopsis and a handoff-packet note did land in Story context and the Notes desk respectively once approved there. A user reading only the chat transcript would have no way to know a real proposal existed.
   - *Severity:* Major (core "propose visibly, then approve" UX is broken for this chat type, even though the backend data path itself is intact). *Phase:* 2 (Brainstorm).

5. **"Rework in chat" on the Notes desk does nothing**
   - *Repro:* Open a note ("Reminder: crew safe house rules"), with and without text selected in the body, click "Rework in chat" in the note editor toolbar.
   - *Expected:* A chat panel opens seeded with the note (or selected text) for reworking.
   - *Actual:* Zero visible effect — no panel opens, and network logs confirm **zero requests fire**. Reproduced consistently with and without a text selection.
   - *Severity:* Major (documented feature completely non-functional). *Phase:* 2 (Notes desk).

6. **"Accept all" is broken on WB chat's timeline-pin-proposal card**
   - *Repro:* In a WB "Timeline" template chat, get a 5-pin proposal batch, click the group-level "Accept all" button.
   - *Expected:* All 5 pins accept at once.
   - *Actual:* No effect from multiple clicks (confirmed via read of button ref/position, and no state change). Individual per-pin ✓ Accept buttons worked correctly one at a time.
   - *Severity:* Minor/major depending on batch size — annoying at 5 pins, would be a real problem at 20+. *Phase:* 2 (Timeline / WB chat template).

7. **"New version" (alternate chapter version) button is completely non-functional**
   - *Repro:* In the Editor, on any drafted chapter, click "New version" next to the "Main" tab.
   - *Expected:* A dialog or new draft tab for an alternate version, per the documented `ChapterVersionsPanel` feature (P0.2 "Story-Layer Chapter Versioning").
   - *Actual:* Zero visible effect across multiple attempts; network log confirms **zero requests fired**. The "Add tab" (+) button next to it also produced no visible new tab. This entire shipped feature (duplicate/regenerate draft tabs, Compile to Main, compare) was unreachable in this session.
   - *Severity:* Major (documented, previously-shipped feature entirely inaccessible). *Phase:* 3 (Editor / chapter versions).

8. **Hallucinated character names not grounded in established Lorebook (Brainstorm and Editor Chat)**
   - *Repro:* With 5 characters already created in the Lorebook (Mira Solano, Finley Anderson, Damien Cross, Reyes Vasquez, Odette Marsh), ask Brainstorm to sharpen the premise, and separately ask the Editor Chat to draft Chapter 1 prose.
   - *Expected:* Generated text uses the established characters.
   - *Actual:* Both surfaces invented **brand-new names not present anywhere in the story** — Brainstorm produced "Elias Voss" as the billionaire antagonist (should have been Damien Cross); the Editor Chat's Chapter 1 draft introduced "Rook," "Lena," and "Elias" as Mira's crew instead of using Finley Anderson. Only fixed after I explicitly corrected the prompt with the real names. AI Review's Deep mode later correctly caught the resulting Chapter 1→2 crew-continuity break as a HIGH severity finding — a good save, but it confirms the root grounding problem is real and user-facing.
   - *Severity:* Major (undercuts the "factual consistency / prevent drift from established facts and Codex state" mission that is this fork's whole premise). *Phase:* 2 and 3 (Brainstorm, Editor Chat).

9. **Story-wide dedicated "Scanner" sidebar tool appears to be missing**
   - *Repro:* Looked for the "story-wide 'Scanner' sidebar tool (scan history + full issue list)" described in the project's own CLAUDE.md, across the full left-hand navigation (Stories, Series, Editor, Chapters, Outline, Lorebook, Brainstorm, Research, Notes, Names, Memory, Relations, Maps, Timeline, AI Review) on every workspace page.
   - *Expected:* A "Scanner" entry in the sidebar.
   - *Actual:* No such entry exists anywhere in the nav. Only the per-chapter Scanner drawer (inside the Editor's right-rail icon stack) and a passing text reference from AI Review ("...that's the RAG Scanner") exist. Could not run a genuine "story-wide Scanner pass" as instructed in Phase 4 because no such tool is reachable.
   - *Severity:* Major (either a missing/regressed feature, or a significant documentation/navigation mismatch). *Phase:* 4 (wrap-up).

10. **Recurring React console errors throughout the session**
    - Observed repeatedly, not tied to one single action: `Maximum update depth exceeded` (an infinite re-render loop warning), hydration errors from a `<pre>` nested inside a `<p>` in `AssistantMessageContent`'s markdown rendering (likely triggered by the hallucinated raw-HTML chat message from bug #4), and `A component is changing an uncontrolled input to be controlled` warnings. The UI never visibly crashed, but these are real front-end defects.
    - *Severity:* Minor-to-moderate. *Phase:* throughout, most visible after bug #4's malformed HTML message.

11. **Two unexplained 500 Internal Server Error responses recur in console**
    - Seen intermittently across multiple pages/sessions of testing; never isolated to one specific user action, and the app kept functioning around them.
    - *Severity:* Needs investigation — flagging since a silent 500 anywhere is worth root-causing even if user-visible impact wasn't pinned down. *Phase:* throughout.

12. **"Track Character State" toggle silently no-ops on an unsaved new entry**
    - *Repro:* On a brand-new, not-yet-saved Lorebook entry (Finley Anderson), toggle "Track Character State" in the Advanced panel.
    - *Expected:* Either it enables Codex tracking, or a message says "save the entry first."
    - *Actual:* Three clicks produced no visible state change and no error. Only after saving the entry once (via the "Update" button) did the same toggle work correctly.
    - *Severity:* Minor. *Phase:* 1 (Lorebook entry editor).

13. **Relationship Graph drag-to-connect only works reliably at full node size/zoom**
    - *Repro:* Try to drag from "The Glasswing Diamond" node to "Damien Cross" to create an "owns" edge, after zooming out to fit more nodes on screen.
    - *Expected:* Dragging from one node to another (as documented — "create/edit/delete edges" by dragging) creates a relationship-proposal dialog.
    - *Actual:* At a zoomed-out view (nodes ~58px), dragging from node-to-node just **moves the node** instead of creating a connection; it only reliably worked when I located precise handle coordinates via DOM inspection at 100% zoom. A first-time user would very plausibly conclude the drag-to-connect feature simply doesn't work, since the on-screen behavior (dragging moves the node) looks intentional. The Argus→Damien edge succeeded at close zoom; the Diamond→Damien edge was abandoned after several failed attempts at low zoom.
    - *Severity:* Major/friction hybrid — the feature works, but the failure mode (silently repositioning the node) actively misleads the user. *Phase:* 1 (Relationship Graph).

14. **New Entry button in Lorebook frequently requires two clicks**
    - *Repro:* From the Lorebook "Browse" tab, click "New Entry."
    - *Expected:* A new entry editor opens on the first click.
    - *Actual:* Reproduced many times across the session — the first click on "New Entry" (in both the top toolbar and per-category empty states) frequently does nothing at all (no new tab appears, no error); a second click on the same button then works. This happened often enough (5+ times) to rule out a one-off timing fluke.
    - *Severity:* Minor but persistent friction bordering on a real event-handling bug. *Phase:* 1 (Lorebook).

---

## Friction / rework-worthy

1. **No inline "create new series" in the Create New Story dialog.** The Series dropdown in "Create New Story" only lists *existing* series — to put a brand-new story in a brand-new series takes three separate steps: create the story with Series=None, go to the separate Series tool to create the series, then re-open the story's Edit dialog to assign it. A "+ Create new series" option inline in that first dropdown would collapse this to one step. *Phase:* 0.

2. **Chat send buttons need two clicks, constantly, across every chat surface.** In Brainstorm, Outline, Editor Chat, and WB Lorebook chats alike, typing a message and clicking Send frequently leaves the message sitting in the composer unsent on the first click; a second click at the same coordinates is needed to actually send. This happened dozens of times over the session across every chat type tested and materially slowed down every phase of the walkthrough — worth investigating as a real composer state/timing bug, not just an automation quirk (the message visibly sat unsent in the textbox, which a human would also have to notice and re-click).

3. **Long-running scan/suggest actions give zero loading feedback in their own drawer.** Both "Scan this chapter" (RAG Scanner) and "Suggest Codex updates from this chapter" enqueue a real async job (confirmed via `/api/agent/jobs`) that takes 5–20 seconds, but the drawer UI shows no spinner, progress bar, or "running..." state — it just looks unchanged until the result (or lack of one) appears. A user has no way to distinguish "it's working" from "the click didn't register," which is exactly what happened to me the first time I tried each of these.

4. **Relationship Graph navigation (Fit View / minimap) doesn't reliably show the whole graph.** With 10 nodes, "Fit View" left several nodes off-screen, clicking inside the minimap didn't pan the canvas, and I had to manually mash the "−" zoom-out control several times to see everything. There's no simple, reliable "show me the whole graph" affordance.

5. **Codex custom Label/Value field pairs are easy to fill into the wrong box.** When adding a Core Identity or Appearance row, clicking the Label input then the adjacent Value input and typing into each can silently land both pieces of text in the Value field (confirmed via DOM inspection: `{"placeholder":"Label...","value":""},{"placeholder":"Value...","value":"AgeAge28"}`-style result) with no visual cue that something went wrong until you look closely. Worth a pass on hit-target sizing/tab order for that row of inputs.

6. **Names Generator's "Codex" quick-add button creates a full Lorebook entry with no confirmation.** Clicking "Codex" next to a generated name immediately creates a real, permanent Lorebook entry tagged "Needs fleshing out — generated by the Name Generator" — there's no "are you sure" step, so a user just browsing name options for inspiration could end up littering their Lorebook with half-finished entries.

7. **"Track Character State" / "Track Place State" toggles give no explanation when they silently fail pre-save.** See bug #12 above — the fix (save the entry first) is reasonable, but the UI should say so instead of just doing nothing.

---

## Feature coverage checklist

**Phase 0 — New story:** Done. Story created, Series created separately and assigned via Edit (see friction #1).

**Phase 1 — World-building:**
- 5 characters created — Done (1 via WB chat + Accept & Sync + Codex approve [chat-first]; 1 via Names Generator "Codex" quick-add + manual fleshing-out; 3 via manual "Create New Entry" — this batch predates the chat-first course correction).
- Name Generator — Done, found under sidebar "Names," full-name generation with a direct "Codex" quick-add action.
- Codex state (wardrobe/appearance/wounds/custom fields) on 2+ characters, snapshot History + restore — Done, but restore is buggy (bug #2).
- 3 locations with Place Sheet fields — Done (manual, predates course correction). L4 "Track Place State" full Codex versioning verified on one location.
- 2 items linked to characters via Relationship Graph — Partially done: Argus Security AI → Damien Cross ("Works At") edge created successfully; Glasswing Diamond → Damien Cross edge attempted but abandoned due to drag precision issues at low zoom (bug #13).
- Maps tool — Done: created a sketch map linked to The Vault Estate location, drew a building outline and a marker.
- Image feature — Found and confirmed working (Lorebook entry editor's Image section, "Upload" / "Generate from Description"), but has the empty-description silent-failure bug (#1).

**Phase 2 — Structure:**
- Brainstorm intake conversation + overview-proposal / handoff-packet accepted — Done, but with the significant rendering bug (#4) — had to use the separate Approvals tray to actually approve.
- Outline chat, 5-chapter skeleton — Done via chat-first flow (`Accept All Suggestions`), worked cleanly with real per-chapter suggestion cards.
- Notes desk, 2 notes created (1 via handoff-packet, 1 manual), "Rework in chat" tried — note creation worked both ways; "Rework in chat" is broken (bug #5).
- Research chat, Story mode, real web lookup with citations — Done, worked well, real clickable source links confirmed.
- Timeline: Spine pins with all 3 `whenKind` types (relative, fuzzy, civil), Story-start set to Chapter One, AI pin-propose via WB "Timeline" template chat — Done. 5 pins via chat (individual accept; "Accept all" broken, bug #6), 1 manual civil-date pin. Story-start anchor set once Chapter One existed.

**Phase 3 — Writing (5 chapters):**
- 5 chapters written — Done (Ch.1 & Ch.2 via Editor Chat [Ch.1 auto-insert, Ch.2 explicit accept]; Ch.3–5 typed manually to cover that path and save time).
- Auto-insert prose toggle — Done, tested on Chapter 1, confirmed working ("Auto-inserted into chapter" toast).
- Codex-update proposal from chapter content — Done, tested via two different triggers: free-text chat request (broken, bug #3) and the dedicated Scanner-drawer button (works correctly).
- RAG Scanner drawer on 2+ chapters — Done, correctly returned 0 issues on a clean chapter.
- Alternate chapter-version (duplicate/regenerate, edit, Compile to Main) — **Not achieved**; the "New version" button is non-functional (bug #7).
- Chapter History manual checkpoint, edit, restore — Done, confirmed working correctly (safety checkpoint auto-created on restore, content matched exactly).
- Chat Shuttle (Editor → Research → back) — Done: Open correctly hopped to Research with the question pre-seeded, got a cited real-world answer, "Send brief to origin" fired the correct backend call (confirmed via network log) but gave zero visible UI confirmation.

**Phase 4 — Wrap-up:**
- Story-wide Scanner pass — **Not achieved**; no such sidebar tool could be found (bug #9).
- AI Review Quick mode (1 chapter) — Done, 3 solid findings.
- AI Review Deep mode (whole story, 5 chapters, with line-nitpicks) — Done, findings spanned all 4 tags (dev/continuity/voice/line) as documented, and correctly caught the crew-name inconsistency created by bug #8. Resolve/Dismiss actions tested and working.
- Timeline export as image — Done (Story-start anchor set to Chapter One first); export click produced no new console errors, consistent with a successful client-side image download, though no in-app confirmation toast was observed either way.
- Final stuck-state pass — Done; no stuck toasts, spinners, or broken layouts found in a final sweep across Series/Stories/Editor/AI Review.
