# Lexical Editor (T2) — Design

**Status:** **Plugin-add axis shipped 2026-07-22** (LE0-LE3, see `DECISIONS.md`'s "Lexical Editor Deepen — LE0-LE3" entry). Other T2 axes (list "done" bar, toolbar/mobile/selection polish, CodeHighlight/TreeView/collab-residue decisions) still open/unlocked.  
**Priority:** Plugin-add axis done; other T2 axes stay **P3** until separately locked  
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

## Not locked yet (other T2 axes)

- Detailed upgrade breakage / custom-node serialization compat matrix  
- Explicit list “done” bar (nested lists, MD round-trip guarantees, checklist export rules)  
- Toolbar / mobile / selection / rework polish  
- CodeHighlight product decision  
- TreeView as dev-only vs hidden  
- Collab residue cleanup (keep vs delete dead collab paths)  
- Amazon/KDP manuscript alignment → **T3**, separate talk item  

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
