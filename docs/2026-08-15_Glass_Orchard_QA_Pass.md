# The Glass Orchard — End-to-End QA Pass (2026-08-15)

**What this is:** a full end-to-end user-journey test of Story Labyrinth — new story through a finished 10-chapter manuscript — run live against Grok 4.5 (xAI OAuth) as the AI provider. This is the first time at this scale that most of these AI-dependent features have been exercised against a real, reachable model rather than blocked by "no AI provider reachable in this dev sandbox" (the caveat attached to nearly every prior DECISIONS.md verification entry).

**Test story:** "The Glass Orchard" — a gothic psychological mystery / slow-burn romantic suspense, created fresh for this pass and left in the dev database for inspection. 10 chapters, ~20k words, real prose throughout.

**Tags used below:** `[ERROR]` broken/crashes · `[FRICTION]` confusing/clunky but works · `[OK]` confirmed working correctly.

---

## Summary

- **6 errors**, **6 friction points**, **10 confirmed-working features**, ~20k words drafted.
- **Headline finding:** live interactive chat generation (Brainstorm, World-Building, Editor, Outline — every chat type) never consults the Feature Routing per-feature model overrides. Every brand-new chat defaulted to a dead OpenRouter model and hung silently until manually switched to Grok. Job-queue AI calls (background jobs, scans) *do* respect Feature Routing correctly — this narrows the bug specifically to the live chat model picker.
- **The good news:** once pointed at Grok, the propose→accept machinery across World-Building, Outline, the Editor, Concrete Beats, AI Review, and both RAG Scanners all held up well — several caught genuine continuity mistakes made live during the test, not planted ones.

---

## Cross-cutting / Model Routing

**[ERROR] No chat type honors the Feature Routing model override.**
Feature Routing's "Apply to all features" set Grok 4.5 on every listed row, including the two chat-labeled rows (`World-Building Chat`, `Editor Chat`). Despite that, a brand-new chat of any type — Brainstorm, World-Building, Editor, Outline — defaulted its own model picker to OpenRouter's `nvidia/nemotron-3-ultra-550b-a55b:free`, a model with no saved API key.

Root cause, pinpointed during the pass: job-queue AI calls (`agentJobs` — e.g. Relationship Graph's `graph_suggest_edges`, the story-wide RAG Scanner) *do* correctly read Feature Routing and reach Grok on the first try. Only the live interactive chat's own model resolution (`resolveChatDefaultModel` / the per-chat Cloud model picker) ignores Feature Routing entirely, falling back to a separate "last selected model per provider" state instead.

Repro: new story → any chat type → New Chat → model picker shows a dead OpenRouter entry, not Grok.

Suggested fix: new-chat model resolution should check the relevant Feature Routing row (World-Building Chat / Editor Chat) first, and for chat types with no Feature Routing row (Brainstorm/Outline/Notes/Research) fall back to the "Global default" instead of an arbitrary last-picked-provider model.

**[ERROR] A dead model hangs forever with no visible error.**
Sending a message on that stale model sat on "Generating…" for a full minute, then 504-timed out invisibly — no toast, no error state, nothing in server logs. The spinner never stopped until the model was manually switched and the message resent.

```
console: Streaming error: {status: undefined, code: 504, ...}  — never surfaced to the UI
```

**[FRICTION] Large generations run 2–3 minutes with no progress signal.**
A static "Generating…" indicator, no token count, no cancel button. Not a bug on its own, but a first-time user watching that for three minutes could reasonably assume the app had hung.

---

## Brainstorm

**[ERROR] The propose → approve loop never actually fires with a real model.**
Three escalating prompts on Grok 4.5 — general brainstorming, an explicit "propose a synopsis and hand off to World-Building/Outline," and a maximally explicit "formally propose this as a proposal I can accept" — all returned excellent, well-structured prose. None used the `overview-proposal` or `handoff-packet` fence the Approvals tray depends on. Checked after each: no active proposals, no handoffs, and the 5-slot setup checklist (Premise/Genre&Tone/Protagonist/Setting/Conflict&Stakes) stayed "unknown" on every slot despite the replies covering all five exhaustively.

This means the durable-tray mechanic this feature was built around (Open/Send/Accept/Mark done) is currently unreachable with a real model — a user has no way to one-click accept a synopsis or hand off a roster; they'd have to manually copy-paste everything. Every prior verification of this feature (per DECISIONS.md) was done by hand-inserting checklist rows to simulate model output — this may be the first real end-to-end run, and it doesn't survive contact.

Suggested fix: strengthen `chatContextService.ts`'s `overview-proposal`/`handoff-packet` fence instructions (a stricter format example, or a nudge keyed off "accept"/"lock in"/"propose"), and add a regression test that runs against a real model rather than only manual-row simulation.

---

## World-Building & Outline

**[OK] Lore Sheet propose → accept → sync works cleanly.**
Unlike Brainstorm, the WB chat's `sheet-proposal` fence fired correctly — it interviewed for missing concrete details first (matching the "interview-style world-building" design intent), then produced a real proposal card on a follow-up with details supplied. "Accept & Sync" correctly wrote the sheet body and produced a well-structured Codex diff (wardrobe/wounds/items as added lists, appearance/customFields as changed-value pairs) that approved cleanly — confirmed via direct textarea inspection that the full sheet body landed.

**[OK] Outline's 40-item proposal auto-persisted correctly.**
Asking for a 10-chapter outline with summaries returned a full 40-item AI-suggested tree (10 chapters × ~3 scenes each) that auto-persisted as real pending outline rows, exactly per design ("create auto-persists as a pending tree row").

**[FRICTION] No bulk-accept for outline suggestions.**
"Reject All Suggestions (N)" exists; nothing mirrors it for accepting. With a real 40-item AI-generated outline, a user has to click Accept 40 times individually. After accepting all of them by hand, the reject-all counter also stayed stuck at a stale "(3)" — likely a cache not invalidating alongside the per-item accept mutations. Cosmetic, but could make a user think 3 items are still pending when they aren't.

**[FRICTION] New Lorebook entries don't open their own tab after creation.**
Clicking Create drops back to whichever tab was open before (Browse, or an unrelated entry) instead of the entry just created. Breaks the natural create-then-keep-working flow.

**[OK] Relationship Graph "Suggest relationships" job ran cleanly.**
Job-queue path correctly respected Feature Routing and reached Grok (in contrast to the live-chat bug above). Zero suggestions produced, plausible given only 2 sparse character entries existed at the time. Settings > Logs > Recent Jobs correctly showed it "completed." The Activity Stoplight also correctly surfaced an unrelated stale failed job from the pre-existing demo story under its own "Other stories" section, confirming cross-story surfacing works as designed.

---

## Writing Ten Chapters

**[OK] Rework in chat and AI-continue both hold up exactly as designed.**
AI-continue via Editor chat produced a genuinely on-voice continuation; the "Accept" prose-proposal card correctly appended it to chapter content. "Rework in chat" on a manually-selected sentence correctly captured the selection with before/after context, and "Accept" spliced the reworked sentence back into precisely its original position — verified the surrounding paragraph was untouched.

**[OK] Concrete Beats and the chapter-level RAG Scanner both impressed.**
Suggest Beats on Chapter 1 (~600 words) correctly identified 24 well-categorized beats (Character Movement/Sensory Detail/Environmental Detail/Physical Action/Dialogue Tag/Wardrobe-Item Change) with accurate excerpt anchors; Accept/Reject-All both worked correctly. The RAG Scanner (Memory+Timeline context on) found two real, legitimate continuity issues actually introduced while writing — not planted: a state-mismatch (a mystery tool overlapping with an existing Codex item) and a genuine contradiction ("the ravine" vs. the established orangery containment-mishap fact). Both had accurate excerpt citations from chapter and codex/timeline sources with correctly-worded suggested fixes. Resolve/Reopen worked cleanly.

**[ERROR] Humanize selection can merge two words with no space.**
Ran "Humanize selection" on a paragraph containing "the one photograph." The rewrite landed in place but collapsed those two words into `onephotograph` — confirmed via direct DOM text inspection (`innerText.includes('onephotograph')` → true), not a rendering artifact.

Repro: select a span crossing "the one photograph" → Humanize selection → check for the missing space. Root cause is either the model dropping the space in its rewritten output with no post-processing normalization, or a splice-boundary bug where the replacement text is inserted without checking adjacent-word spacing.

**[ERROR] MultiView split can mislabel a pane's tab.**
With Chapter 2 open, "Split right" opened a second pane correctly labeled Chapter 2 — but the *original* pane's tab kept reading "Chapter 1" while silently showing Chapter 2's text. Verified via `PUT /api/chapters/:id` network calls that both panes correctly saved Chapter 2's edits to Chapter 2's real chapter ID, and Chapter 1's stored content (re-fetched directly) was untouched — **not data loss**, but a tab that lies about which chapter you're looking at is its own kind of dangerous, especially given this project's own prior "MultiView cross-chapter content-loss" incident (B11, `DECISIONS.md`).

Repro: open Chapter 2 in the Editor → click "Split right" → observe the left pane's tab still reads "Chapter 1" while its body shows Chapter 2's text.

**[FRICTION] Adding a chapter tab doesn't focus it.**
Picking a chapter from "Add tab" grows the tab strip but leaves the previous chapter active and focused, including its top-bar breadcrumb. Nearly typed Chapter 4's opening into Chapter 3's still-focused editor before noticing the tab strip had silently grown a 4th tab. Not data-lossy this time, but a real trap for the same "which chapter am I looking at" confusion as the MultiView bug above.

**[OK] Chapter History checkpoints correctly.**
A named manual save ("Save Version") sat correctly alongside the pre-existing auto-checkpoint on Chapter 10, both showing correct timestamps and content previews.

**[OK] All 10 chapters have real, full-length prose** (~1,800–2,400 words each, ~20k words total).

---

## Post-Writing Desks

**[OK] AI Review (Quick mode) is the strongest result of the whole pass.**
Ran over all 10 chapters (~20k words) on Grok 4.5. Returned 8 well-tagged findings (High/Medium/Low × Dev/Continuity). Several were real developmental-editing catches not consciously planted: an unresolved "who struck the glass panel" plot-logic gap at the midpoint, a "the mysterious tool's origin is never explained" dangling setup, a too-fast reunion/complicity pacing note — and, most impressively, **a genuine continuity slip actually made while writing**: chapters 9 and 10 both said "a decade" of Aleksander's silence/choices while the rest of the manuscript consistently established "seven years." The model caught both instances with exact quotes. Resolve action confirmed working (finding correctly moved to the Resolved tab).

**[OK] Story-wide RAG Scanner caught a second genuine contradiction.**
Chapter-by-chapter loop across all 10 chapters (Memory+Timeline context on) caught a cross-chapter contradiction actually written: Chapter 1 explicitly names "a strict boundary at the orangery door" in the arrival terms, but Chapter 5 says Mira had walked past that same door "a dozen times without understanding what it was" — directly contradictory. Precise citations from both chapters, well-worded suggested fix.

**[OK] Project Memory manual "New Note" works correctly.**
A user-authored note ("Elise's captivity duration — seven years, not a decade") landed directly in the Active tab (not Pending), consistent with the design's model where user-authored notes bypass the scan-proposal approval gate meant only for AI-sourced suggestions.

**[FRICTION] EPUB export throws quiet console errors.**
Triggering "Download as EPUB (Kindle)" produced 10 repeated console errors ("LoadChapterContent - Failed to load content: Unexpected end of JSON input") with nothing shown to the user. **Verified this is NOT data loss** — fetched all 10 chapters directly via `GET /api/chapters/story/:id` afterward and confirmed every chapter's stored content is intact, correctly sized, valid Lexical JSON matching what was written. Most likely cause: an accumulation of idle background MultiView tabs (many were left open while writing) each independently attempting to reload content and racing on an empty-string edge case, unrelated to the actual export data path (which reads from the API/DB directly, not live editor state). Still worth a look — a silent failure loop like this should surface something to the user even when harmless.

---

## Not covered this pass (time-boxed out)

- AI Review Deep mode (only Quick mode tested)
- Maps AI-sketch generation (map created, canvas verified, AI-sketch not exercised)
- Chat Shuttle live round-trip
- TTS playback
- Full Codex Secrets add/reveal flow (panel UI confirmed rendering, no secret added)
- Name Generator pack install
- Full story JSON export/import round-trip

---

## Confirmed working, for the record

- Login/session persistence, story creation
- Providers & keys / Feature Routing configuration itself (the override table is correctly saved and displayed — the bug is only that live chat ignores it)
- Lore Sheet propose→accept→sync (World-Building)
- Outline AI-suggested tree generation and per-item accept
- Relationship Graph "Suggest relationships" job
- Editor AI-continue and Rework-in-chat
- Concrete Beats AI suggestion + accept/reject
- Chapter-level and story-wide RAG Scanner (Memory + Timeline context)
- AI Review Quick mode
- Project Memory manual notes
- Chapter History (manual save + auto-checkpoint)
- Activity Stoplight cross-story job surfacing

---

*Test story "The Glass Orchard" left in the dev database for inspection. Full findings log also published as an interactive artifact: "The Glass Orchard QA Pass."*
