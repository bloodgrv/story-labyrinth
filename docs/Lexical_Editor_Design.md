# Lexical Editor (T2) — Design

**Status:** **All T2 axes now locked/shipped as of 2026-07-28.** Plugin-add axis shipped 2026-07-22 (LE0-LE3, see `DECISIONS.md`'s "Lexical Editor Deepen — LE0-LE3" entry). CodeHighlight/TreeView/collab-residue, list "done" bar, toolbar/mobile/selection/rework polish (scoped subset), and the upgrade breakage/compat matrix all shipped 2026-07-28 — see their own `DECISIONS.md` entries.  
**Priority:** Done — this document's build scope is complete. Future Lexical version bumps should start from the compat-matrix section below.  
**Talk list:** T2  
**Related:** story editor home `src/components/story-editor/`; export paths under `src/utils/export/`; bugs B1 (word count), B2 (beat marks) are separate P2 debt

---

## Job

Deepen/polish the **existing** Lexical stack for long-form fiction — **not** a rip-and-replace, not full Lexical Playground parity.

This document locks the **plugin-add** grill axis. Upgrade breakage plan, list “done” bar, toolbar/mobile/selection polish remain open T2 axes. **KDP export alignment (T3)** is separately **design-locked** — see `docs/Amazon_KDP_Export_Design.md` (not part of Lexical build scope; may touch shared export converters only).

---

## Baseline (live check 2026-07-21)

| Item | Value |
|------|--------|
| Direct pkgs | `lexical`, `@lexical/react`, `rich-text`, `list`, `link`, `code`, `table`, `markdown`, `hashtag`, `overflow` — **^0.39.0** (installed **0.39.0**) |
| Latest npm (then) | **0.48.0** |
| React | **19.2.3** — satisfies Lexical 0.48 peer `react`/`react-dom` **≥18** |
| Shell | Playground-style; namespace `"Playground"`; `PlaygroundNodes` + `PlaygroundEditorTheme` |
| Related | `yjs` + `y-websocket` (playground collab residue only); `react-markdown` separate from Lexical markdown |

### Registered nodes (`PlaygroundNodes`)

**Upstream:** Heading, Quote, List/ListItem, Code/CodeHighlight, Table*, Hashtag, AutoLink, Link, Overflow, HorizontalRule, Mark  

**SN custom:** Image, InlineImage, Collapsible*, PageBreak, Layout*, SpecialText, BeatMark, GrammarMark

### Main Editor plugins (mounted today)

RichText, History (shared), AutoFocus, Hashtag, AutoLink, Link, ClickableLink, HR, TabIndentation, MarkdownShortcut, Images, InlineImage, Collapsible, PageBreak, Layout, DragDropPaste, DraggableBlock, Floating format/link, ContextMenu, TabFocus, Toolbar + SN: Load/Save chapter, RegisterActiveEditor, WordCount, LorebookTag, BeatMarkSync, GrammarCheck.

(SceneBeat node, SceneBeatShortcut, and SlashCommand plugins removed — see `docs/Scene_Beat_Removal_Design.md`.)

**Gap that motivated this axis:** Toolbar already dispatches list/checklist **commands** and list **nodes** are registered, but **`ListPlugin` / `CheckListPlugin` are not mounted** in `Editor.tsx`. Table **nodes** are registered; **`TablePlugin` is not mounted**.

Other surfaces: lighter `VersionEditor`; read-only `ChapterReader`; export `convertLexicalToHtml` / `convertLexicalToMarkdown` / PDF.

---

## Locked decisions — plugin-add axis (grill + Lean, 2026-07-21)

| # | Axis | Lock |
|---|------|------|
| **P1** | ADD v1 | Mount **`ListPlugin`** + **`CheckListPlugin`** on the **main Editor rich-text path** |
| **P2** | Tables | **C** — keep table **nodes** for chapter JSON **load-compat**; **no** `TablePlugin`; **no** new table insert UX |
| **P3** | SKIP | CharacterLimit / max-length product UI; product multiplayer **Collaboration**; **TableOfContents**; **AutoEmbed** (YouTube/Figma/etc.); **ClearEditor** as a user-facing feature |
| **P4** | DEFER | CodeHighlight mount polish; TreeView productization; playground toys (emoji, mentions, sticky, poll, speech-to-text, etc.) |
| **P5** | Not this axis | SN customs (beats, grammar marks, lore tags, slash) — already product surface; polish on later T2 axes |
| **P6** | Implement pairing | Prefer **Lexical 0.39 → 0.48** with **all** `lexical` / `@lexical/*` on the **same** version in the **same slice** (or immediately before mounting List/CheckList) |
| **P7** | Priority | **P3** until user promotes |
| **P8** | Non-goals (this axis) | See below |

### Tables options (locked = C)

| Option | Meaning |
|--------|---------|
| A | Tables in-scope → `TablePlugin` + insert UX + export rules |
| B | Tables out-of-scope → strip/hide table affordances over time |
| **C** | **Nodes only for load-compat; no plugin; no new insert** ← **locked** |

---

## Non-goals (this axis)

- Full Lexical Playground feature parity  
- Product real-time collab / Yjs as a shipped multiplayer product  
- Auto-embed social/media blocks in manuscript  
- Character caps on chapter body  
- Outline-style TOC inside the chapter editor (Outline desk owns structure)  
- Rip-and-replace editor framework  
- Starting code before this axis was locked (now locked — build only when promoted / user says build)

---

## Suggested implement slices (when building)

| Slice | Work |
|-------|------|
| **LE0** | Bump **all** Lexical packages to **0.48.x** together; fix compile/type breaks; smoke load/save + basic typing |
| **LE1** | Mount `ListPlugin` + `CheckListPlugin` in main `Editor.tsx` rich-text path |
| **LE2** | Smoke lists/checklists: toolbar, Enter/Tab behavior, markdown shortcut if already wired; chapter reload |
| **LE3** | Export spot-check HTML/MD/PDF with lists; no TablePlugin under lock C |

Do **not** add `TablePlugin` under lock C. Do **not** mix Lexical package versions.

**Risk surface:** custom nodes + chapter JSON load/save + HTML/MD/PDF export. Expect API churn especially around 0.45 selection/reconcile in the upgrade range.

---

## Locked decisions — CodeHighlight/TreeView/collab-residue (2026-07-28)

| Axis | Lock |
|------|------|
| CodeHighlight | **Leave as-is** — nodes stay registered for load-compat only (same posture as Tables lock C); no insert UX, no highlighting polish |
| TreeView | **Removed** — was fully dead residue (`showTreeView` setting only ever toggled a cosmetic CSS class, no actual `<TreeViewPlugin>` was ever mounted anywhere in this fork) |
| Collab residue | **Removed entirely** — `yjs`/`y-websocket` deps, `collaboration.ts`, and the dead `CollaborationPlugin`/`isCollabActive` branch in `ImageComponent.tsx` (unreachable: nothing in the app ever set `isCollabActive` true). Real-time multiplayer collab was already SKIP'd on the plugin-add axis; this just finishes removing its vestigial scaffolding |

See `DECISIONS.md`'s "Lexical Editor — CodeHighlight/TreeView/Collab-Residue (T2 quick decisions)" entry for the full trail.

---

## Locked decisions — list "done" bar (2026-07-28)

| Item | Lock |
|------|------|
| Nested list creation | **Confirmed working, no build needed** — `ListPlugin` + `TabIndentationPlugin` are architecturally sufficient (Tab at true block-start indents into a real nested `<ul>`/`<li>` structure via `ListItemNode.setIndent()`'s `$handleIndent` override; mid-line Tab correctly inserts a literal tab character instead, matching Word/Docs convention — this is upstream Lexical's own `$indentOverTab` logic, not app code). Live-verified with real editor-created content. |
| Markdown export nesting | **Fixed** — was producing syntactically invalid output (a nested list's items concatenated onto the parent item's line with no newline/indentation). `convertLexicalToMarkdown.ts` now recurses with depth-aware 2-space GFM indentation. |
| PDF/plain-text checklist state | **Fixed** — `extractPlainTextFromLexical` (`lexicalUtils.ts`) never read a `listitem`'s `checked` field at all, silently dropping check state in PDF export. Now prefixes `☑ `/`☐ `, matching `convertLexicalToHtml.ts`'s existing glyph convention. |
| Markdown chapter import | **Out of scope** — no Markdown-file-to-Lexical-content path exists anywhere in the app today (only live-typing shortcuts create lists as you type; `documentImportService.ts`'s `.md` handling is Lorebook-only and discards structure into prose). "MD round-trip guarantees" from this axis's original wording is moot without an import leg — not building one without a real requester. |

See `DECISIONS.md`'s "Lexical Editor — List 'Done' Bar (T2)" entry for the full trail.

---

## Locked decisions — toolbar/mobile/selection/rework polish (2026-07-28)

Scoped down from the full "toolbar / mobile / selection / rework polish" axis to a concrete, real subset identified via investigation (touch support and the upgrade-breakage matrix stayed out — see below).

| Item | Lock |
|------|------|
| Toolbar overflow on narrow viewports | **Fixed** — `docs/plan-mobile-styling-issue-58.md` diagnosed this (word count, Maximize button scrollable out of reach) but it was never actually implemented. The trailing action cluster (word count/Focus/Maximize) in `ToolbarPlugin/index.tsx` is now `sticky right-0`, so it can never scroll out of reach regardless of toolbar overflow. |
| Link-insert invalid-URL default | **Fixed** — a standing `TODO` in `utils/url.ts` (`FloatingLinkEditor.tsx`'s edit input defaulted to `"https://"`, submittable as-is). Default changed to empty + placeholder, submission guarded against empty/whitespace-only values, and the now-unneeded `"https://"` special-case removed from `validateUrl`. |
| Breakpoint consolidation | **Partial, targeted** — `EDITOR_NARROW_VIEWPORT_PX = 1025` extracted (`shared/environment.ts`) and used in `Editor.tsx`; `isSmallWidthViewport` wired into `ToolbarPlugin` to gate the word-count label (replacing a mismatched 640px Tailwind breakpoint); `FloatingTextFormatToolbarPlugin/index.css`'s stray `1024px` aligned to `1025px`. The floating toolbar's own `640px` breakpoint (a real, distinct "phone-only, shrink further" concern, already matching Tailwind's `sm`) was deliberately left alone — not every breakpoint in the editor is the same "mobile mode" concept. |
| Touch support (floating toolbar drag-fade, rework selection capture) | **Out of scope** — no evidence of it being a real pain point; bigger lift with no current requester. |
| Live rework Accept E2E verification | **Partially closed** — the core previously-blocking gap (no reachable AI provider, "zero content tokens" documented since P0.4 R0-R3) is confirmed resolved this session: a live message send to a chapter-anchored Editor rework chat produced a real, fresh LLM response. The full `prose-proposal` fence → Accept → replace-selection path was **not** cleanly reproduced in this session — the one live attempt landed in a pre-existing, message-history-polluted chat from an earlier session and the model didn't emit the fenced format that turn (model-behavior variability, not a code defect). Worth a clean re-attempt (fresh chat, no stale history) next time this comes up, but not chased further this pass. |

See `DECISIONS.md`'s "Lexical Editor — Toolbar/Mobile/Selection/Rework Polish (T2)" entry for the full trail.

---

## Upgrade breakage / custom-node compat matrix (2026-07-28)

Insurance documentation for the *next* Lexical version bump — not a build task, no code changes of its own except one real bug the audit surfaced (see "Leaf-TextNode export bug" below, fixed same pass). Closes the last open T2 axis.

### Baseline (frozen 2026-07-28, current)

All at **0.48.0** in lockstep (per LE0's own pairing lock). Declared direct dependencies:

`lexical`, `@lexical/code`, `@lexical/hashtag`, `@lexical/link`, `@lexical/list`, `@lexical/markdown`, `@lexical/overflow`, `@lexical/react`, `@lexical/rich-text`, `@lexical/table`

**Undeclared ("phantom") dependencies — imported directly in `src/` but never listed in `package.json`, resolved only because npm hoists them as transitive deps of the packages above:** `@lexical/mark` (all three MarkNode subclasses), `@lexical/selection`, `@lexical/utils`. Also present transitively but unused by this app's own code post collab-residue-removal: `@lexical/yjs`, `@lexical/extension` (the latter backs `TabIndentationPlugin` internally). **Risk:** nothing pins these to 0.48.0 explicitly — a future `npm install` that changes hoisting, or `@lexical/react` internally dropping/changing its own dependency on one of them, could silently break the build with no `package.json` diff to explain why. Not fixed this pass (declaring phantom deps explicitly is a legitimate future hygiene item, low urgency) — flagged here so the *next* bump's author checks these three didn't drift from `lexical` core's own version first.

### Custom node inventory

| Node | Base class | Persisted? | Known risk on a future bump |
|------|-----------|------------|------------------------------|
| `BeatMarkNode` | `MarkNode` (`@lexical/mark`) | Yes (in `chapters.content`) | `MarkNode`'s own serialization/wrap-unwrap API (`$wrapSelectionInMarkNode`/`$unwrapMarkNode`) is the one already hit by real churn once — re-verify signature compat first |
| `GrammarMarkNode` | `MarkNode` | No — ephemeral, stripped pre-save (`stripEphemeralMarks.ts`) | Same `MarkNode` API surface as above |
| `RagIssueMarkNode` | `MarkNode` | No — ephemeral, stripped pre-save | Same `MarkNode` API surface as above |
| `LayoutContainerNode` / `LayoutItemNode` | `ElementNode` | Yes | `canIndent()`/indent-serialization contract |
| `CollapsibleContainerNode` / `CollapsibleContentNode` / `CollapsibleTitleNode` | `ElementNode` | Yes | Same `ElementNode` contract as Layout* |
| `ImageNode` | `DecoratorNode<JSX.Element>` | Yes | `DecoratorNode`'s `decorate()`/portal-rendering contract — the category most prone to breaking across majors in upstream Lexical's own history |
| `InlineImageNode` | `DecoratorNode<JSX.Element>` | Yes | Same `DecoratorNode` contract |
| `PageBreakNode` | `DecoratorNode<JSX.Element>` | Yes | Same `DecoratorNode` contract |
| `SpecialTextNode` | `TextNode` | Yes | Leaf-text detection in hand-rolled export walkers — see below, already bit once |
| `HashtagNode` (upstream, not subclassed) | `TextNode` | Yes | Same leaf-text detection risk as `SpecialTextNode` |

### Known breaking changes already hit going 0.39 → 0.48 (historical reference)

Recorded in full in `DECISIONS.md`'s "Lexical Editor Deepen — LE0-LE3" entry; summarized here as the first place to check before the next bump:

1. **`@lexical/react/LexicalContextMenuPlugin` removed outright**, replaced by `LexicalNodeContextMenuPlugin` — a fully different declarative API (`items`/`$onSelect`/`$showOn` vs. the old render-prop `menuRenderFn`), not a deprecation with a compat shim. `ContextMenuPlugin/index.tsx` was rewritten from scratch against the new API.
2. **Update-listener return-value semantics changed**: a listener returning a non-`undefined`, non-function value (e.g. `true`) is now treated as invalid/crashes on the *next* update, instead of being silently ignored. This broke `FloatingLinkEditor.tsx`'s update listener (vestigial `return true` on two paths) and manifested as a **silent chapter-load failure**, not a compile error — the kind of break that's easy to miss in a changelog skim and only shows up live.

### Leaf-TextNode export bug — found during this audit, fixed same pass

Any `TextNode` subclass with a non-`"text"` `type` (`HashtagNode`, this app's own `SpecialTextNode`) is a leaf node (`text` field, no `children` array) that three of the four export converters failed to recognize — they checked `node.type === "text"` exactly, and a non-matching leaf with no `children` falls through every branch, silently dropping its text entirely. The Amazon/KDP EPUB pass (`convertLexicalToEpubHtml.ts`) found and fixed this for the EPUB export path only; **`convertLexicalToHtml.ts`, `convertLexicalToMarkdown.ts`, and `lexicalUtils.ts`'s `extractPlainTextFromLexical` (PDF's path) still had the live bug** until this pass. Fixed identically in all three: leaf-text detection now keys off `typeof node.text === "string" && !Array.isArray(node.children)` instead of the exact type string, matching the EPUB converter's own `isTextLeaf` helper. Live-verified via Vite's dev-server ES module transform against a hand-built paragraph containing a `hashtag` node and a `specialText` node interleaved with plain text — confirmed all three converters now preserve both instead of silently dropping them.

**Structural lesson for future custom-node additions, not just future Lexical bumps:** every one of these four export converters (EPUB, HTML, Markdown, PDF's plain-text) hand-rolls its own minimal Lexical-JSON walker rather than sharing one canonical traversal — meaning a new custom node type (or a new upstream node this app starts using) must be manually taught to *all four*, and a gap in just one is easy to miss since the other three keep working. This has now bitten twice (list/listitem nodes during LE0-LE3; leaf-TextNode subclasses just now) via the same root cause. Not restructured into a shared walker this pass (four independent, simple string-builders is arguably fine for this app's node-type surface — a shared abstraction is only clearly worth it if a fifth gap surfaces) — flagged as a candidate if it happens again.

### Checklist before the next Lexical version bump

1. Re-read the four items above (MarkNode API, DecoratorNode API, ElementNode indent contract, update-listener return semantics) against the new version's changelog first — these are exactly the surfaces that broke last time.
2. Confirm the three phantom dependencies (`@lexical/mark`, `@lexical/selection`, `@lexical/utils`) still resolve to the same version as `lexical` core after the bump — nothing enforces this automatically.
3. Re-run the LE0-LE3-established smoke test: chapter load/save round-trip, toolbar-driven list/checklist creation, all four export converters against a chapter containing lists, checklists, images, and at least one hashtag/lore-tag.
4. If a new custom node type was added since the last bump, verify it's handled in all four export converters (see the structural lesson above) — don't assume "it worked in the editor" means "it exports correctly."

---

## Not locked yet (other T2 axes)

*(none remaining — all T2 axes are now locked/shipped as of 2026-07-28)*

---

## Pitfalls

- Do not re-propose AutoEmbed, TOC-in-editor, or full playground parity as default T2 scope  
- Do not treat missing `ListPlugin` as “lists unsupported” without checking toolbar commands + registered nodes  
- Do not add `TablePlugin` or table insert under lock **C** without reopening tables  
- Do not bump only some `@lexical/*` packages  
- Do not conflate Lexical floating selection **Generate** with **Editor chat** (chat governs; selection Generate is not the primary continuity path)  
- P2 bugs **B1** (word count) and **B2** (orphan beat marks) remain separate backlog debt — not closed by LE0–LE3  
- **Do not** pull backlog **dep majors (pack 3)** into LE0–LE3 — `better-sqlite3` 12+/13, `jspdf` 4, lucide 1, router 8, panels 4, Vite 8, Tailwind 4, TS 7 are P3 parked “todo later” on `CURRENT_BACKLOG.md`

---

## Document history

| Date | Change |
|------|--------|
| 2026-07-21 | Plugin-add axis Lean-locked in grill; fork doc written on user **lock**. ADD List+CheckList; tables C; skip/defer as above; upgrade pairing 0.39→0.48. |
| 2026-07-21 | Note: non-Lexical dep majors parked on backlog as pack 3 todo later — out of LE scope. |
| 2026-07-22 | Plugin-add axis (LE0–LE3) shipped: version bump, `ListPlugin`+`CheckListPlugin` mount, list/checklist smoke test, and an export-converter fix (list nodes were previously unhandled in HTML/Markdown/PDF export, latent since lists were never creatable before this pass). Two real Lexical-0.48 breaks found and fixed along the way (`ContextMenuPlugin` API removal, a `FloatingLinkEditor.tsx` update-listener crash). See `DECISIONS.md`. |
| 2026-07-28 | CodeHighlight/TreeView/collab-residue axis grilled and shipped same session: CodeHighlight left as-is (load-compat only); dead `showTreeView` flag removed (was a cosmetic-only CSS toggle, no real debug panel ever mounted); `yjs`/`y-websocket` + `collaboration.ts` + the dead `CollaborationPlugin` branch in `ImageComponent.tsx` removed entirely (unreachable code, `isCollabActive` never set true anywhere in the app). `ImageComponent` production chunk shrank ~128 KB → ~8 KB as a result. See `DECISIONS.md`. |
| 2026-07-28 | List "done" bar grilled and shipped, same session: nested-list creation confirmed working (no build needed, architecture already sufficient); a real Markdown-export nesting bug fixed (was emitting syntactically invalid output); a real PDF/plain-text checklist-state-drop bug fixed. Markdown chapter import declared out of scope (no consumer, no existing import leg to round-trip against). See `DECISIONS.md`. |
| 2026-07-28 | Toolbar/mobile/selection/rework polish axis grilled and shipped at a scoped subset, same session: fixed the previously-diagnosed-but-unimplemented toolbar overflow bug (issue #58) by pinning the trailing action cluster; fixed a standing TODO'd link-insert bug (invalid `"https://"` default, now guarded); consolidated a 1024/1025px breakpoint mismatch and wired `isSmallWidthViewport` into the toolbar. Touch support stayed explicitly out of scope. Confirmed the live rework Accept path's core blocker (unreachable AI provider) is resolved this session, though a clean fence→Accept round-trip wasn't reproduced due to a stale test chat's polluted history. See `DECISIONS.md`. |
| 2026-07-28 | Upgrade breakage / custom-node compat matrix written, closing T2 in full, same session: baseline version/dependency snapshot (including 3 undeclared "phantom" `@lexical/*` packages), a custom-node inventory with per-node risk notes, the two known 0.39→0.48 breaks consolidated for quick reference, and a pre-next-bump checklist. Audit surfaced and fixed a real live bug along the way: the Amazon/KDP EPUB pass's leaf-TextNode-subclass fix (`HashtagNode`/`SpecialTextNode` text silently dropped) was scoped to the EPUB converter only — `convertLexicalToHtml.ts`, `convertLexicalToMarkdown.ts`, and `lexicalUtils.ts`'s PDF plain-text extractor still had the bug live; fixed identically in all three. See `DECISIONS.md`. |
