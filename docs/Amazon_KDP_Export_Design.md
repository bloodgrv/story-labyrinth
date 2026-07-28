# Amazon / KDP Export (T3) — Design

**Status:** **Shipped 2026-07-28** — KDP0-KDP4 all done, see `DECISIONS.md`'s "Amazon/KDP Kindle-Ready EPUB Export — KDP1-KDP4" entry.  
**Priority:** Was P3 until promoted same-day and built.  
**Talk list:** T3  
**Related:** baseline novel export (`src/utils/export/`, `server/services/epubGenerator.ts`); Lexical editor (`docs/Lexical_Editor_Design.md` — converter fallout only); Advanced export profiles (separate P3 backlog neighbor); not print/paperback KDP; not cover designer; not KDP upload API.

---

## Job

Ship a **Kindle-ready EPUB** path: manuscript export that opens on a Kindle / hands cleanly to the KDP **ebook** pipeline without looking amateur.

- **Primary artifact:** EPUB quality (structure, CSS, scene breaks, front matter, converter correctness).
- **Thin manuscript hygiene:** applied **on the EPUB path only** (shared converter fixes may improve other formats as fallout — not a requirement).
- **Success:** “I export → it looks like a book on Kindle,” not “SN is a multi-profile production suite.”

---

## Locked decisions (grill 2026-07-28)

| # | Axis | Lock |
|---|------|------|
| **1** | Primary job | **Kindle-ready EPUB** (+ thin body hygiene on that path). Not multi-profile (C), not checklist-only (D), not full cross-format manuscript pack (B alone). |
| **2** | Front matter | **Minimal trade:** title page (title + author) · generated copyright · auto TOC · then body. **No** synopsis in EPUB body. Dedication/epigraph/also-by/CW/about-author **out** (extension hooks only). |
| **3a** | Paragraphs | Trade fiction: first-line indent; **no** extra gap between paragraphs; first para after chapter title / scene break **no indent**. |
| **3b** | Scene breaks | Detect empty paragraph and/or a line that is only `***` / `* * *` / `---` → emit centered `* * *` with spacing; next para no-indent. First-class Lexical Scene Break node = **fast-follow**, not T3. |
| **3c** | Chapter titles | Title only if present; else `Chapter {order}`. No forced `Chapter N:` prefix. |
| **3d** | Fonts / CSS | Kindle-native **minimal** CSS; **no** embedded fonts; no drop caps. Device typeface wins. |
| **3e** | Images | Pass through; `max-width: 100%`; soft preflight warnings only (no hard strip, no full figure CMS). |
| **4a** | Converter SoT | **One** shared Lexical→HTML semantic mapping for EPUB. Kill the skinny dual path in `epubGenerator.ts` vs client converters. |
| **4b** | Node allowlist | Fiction core faithful (paragraph, emphasis, headings-as-subheads, quote, linebreak, lists, images per 3e). Exotics collapsed safely (checklist→bullet/plain; tables→plain/stacked; no code chrome). No editor-only chrome. |
| **4c** | EPUB engine | In-process (`epub-gen-memory` or equivalent). Proper spine order, nav/TOC, `lang`, title/author metadata, one CSS, chapter pagebreaks. No Calibre/kindlegen. Library swap only if current lib blocks locks. |
| **4d** | Preflight | **Soft** warnings on EPUB export; always **Export anyway**. No hard block. |
| **4e** | Chapters exported | **Main manuscript only** (`chapters` in `order`). Alternate version tabs (P0.2) **out**. No `includeInExport` flag in T3. |
| **5a** | Entry point | Improve **existing** story EPUB export in place. Optional menu label **EPUB (Kindle)**. No second button, no wizard. |
| **5b** | Other formats | EPUB-focused. md/html/txt/pdf **not** required to adopt trade rules except shared-converter fallout. No print-KDP PDF work. |
| **5c** | Copyright | Generated only: `© {story.createdAt year} {author}. All rights reserved.` No new story fields in T3. |
| **5d** | Guide | Short Guide topic or Advanced Guide section: “Exporting for Kindle” in last slice. |
| **5e** | Priority | **P3** until user promotes. |
| **5f** | Slices | **KDP0–KDP4** (below). |

---

## Non-goals

- Multi-profile export system / profile picker (see backlog **Advanced export profiles** — separate; may later reuse these rules as a “Kindle” profile)
- Checklist-only with no generator fix
- Print / paperback / hardcover KDP (trim, bleed, spine)
- Cover designer, KDP upload API, ASINs, category/keyword SEO desk
- Editor “manuscript mode” rewrite or fighting Lexical
- Calibre / kindlegen / external conversion pipeline as a product dependency
- Hand-ordered TOC editor; half-title; full rights-block CMS
- Synopsis page inside the EPUB body (synopsis stays on the story record for the app / future metadata)
- Exporting chapter alternate versions
- Embedded fonts, drop caps, decorative fleurons beyond simple `* * *`
- Hard-fail validation that blocks export
- Coupling to Lexical LE\* remaining axes or dep majors pack 3

---

## Front matter package

| Piece | Behavior |
|--------|----------|
| Title page | Centered title + author |
| Copyright | `© {year from story.createdAt} {author}. All rights reserved.` |
| TOC / nav | Generated from main chapters (order + display title rule) |
| Synopsis | **Not** in EPUB body |
| Dedication / epigraph / etc. | Not T3 — leave extension points only if cheap |

---

## Body typography (EPUB CSS)

```text
p                 → text-indent; margin 0 (no block gap)
p.first / after
  chapter title
  or scene break  → text-indent: 0
scene break       → centered "* * *", vertical spacing
chapter           → pagebreak before; heading per title rule
img               → max-width: 100%; height auto
font-family       → omit or generic; reader default wins
```

Exact CSS values implementer-chosen; locks above are the intent.

### Scene-break detection (export-time)

Treat as a scene break when a block is:

1. An empty paragraph, or  
2. A paragraph whose trimmed text is only `***`, `* * *`, or `---` (optional whitespace).

Emit a single centered break glyph block; collapse runs of consecutive break signals reasonably (don’t spam three break markers for three blank lines — implementer judgment, document in DECISIONS if nuanced).

---

## Converter & EPUB structure

### Single SoT

| Today (problem) | Target |
|-----------------|--------|
| Server `epubGenerator.ts` has a **skinny** Lexical→HTML | One semantic mapping used by EPUB |
| Client `convertLexicalToHtml` (and kin) richer | Same mapping (shared module / one path) |

Implementation may live under `src/utils/export/` with server import, or a neutral shared folder — **design lock is one mapping**, not a folder name.

### Fiction-core mapping

| Lexical / concept | EPUB HTML |
|-------------------|-----------|
| paragraph | `<p>` (+ first/no-indent class when applicable) |
| text + bold/italic/underline | `<strong>` / `<em>` / `<u>` (or CSS class equiv.) |
| linebreak | `<br/>` sparingly; prefer real paragraphs |
| heading (in body) | Subhead styles — must not fork the EPUB spine |
| quote | `<blockquote>` |
| list / listitem | `<ul>`/`<ol>`/`<li>` (LE3 already required this in converters) |
| scene break (detected) | dedicated break markup |
| image | `<img>` with max-width rule |
| checklist | collapse to bullet or plain list |
| table / code / editor chrome | plain text or safe stacked paras; never ship UI chrome |

### EPUB package

- Metadata: title, author, language (`story.language` \|\| `en`), no requirement to embed synopsis as description if awkward — description optional from synopsis is OK **as OPF metadata only**, not a body page
- Spine: front matter XHTML(s) → chapter XHTML(s) in order  
- Nav/TOC: chapter titles  
- One stylesheet  
- Chapter boundary: pagebreak  

---

## Preflight (soft)

Surface on EPUB export (modal or inline panel). Examples:

- No chapters / all empty content  
- Missing title or author  
- Very short total text  
- Huge embedded images  
- Odd scene-break density (optional)

Every warning is dismissible via **Export anyway**. Never hard-block.

---

## Product surface

- **Same** story export EPUB action as today.  
- Optional label: **EPUB (Kindle)**.  
- Preflight rides that action.  
- No separate “Export for Kindle” code path.  
- No multi-step wizard.

---

## Slices (when promoted)

| ID | Deliverable |
|----|-------------|
| **KDP0** | ✅ Done — gap audit vs live EPUB/converters |
| **KDP1** | ✅ Done — `src/utils/export/convertLexicalToEpubHtml.ts`; unified Lexical→HTML SoT, fiction-core mapping + exotic collapse, scene-break detection |
| **KDP2** | ✅ Done — `epubGenerator.ts` front matter (title, ©, nav TOC), synopsis dropped from body, chapter title rule, minimal Kindle CSS, data-URI image temp-file fix |
| **KDP3** | ✅ Done — `epubPreflight.ts` + `ConfirmDialog` in `DownloadMenu.tsx`; Export anyway always available |
| **KDP4** | ✅ Done — Advanced Guide "Exporting for Kindle" section; backlog/DECISIONS updated |

Do **not** start slices until user says build / promote. Do **not** couple with LE\* remaining axes or dep pack 3.

---

## Fast-follows (named, not T3)

- Optional `copyrightYear` / `copyrightLine` story overrides  
- Dedication / epigraph fields  
- First-class Lexical Scene Break node (insert command)  
- “Kindle” as a named profile under **Advanced export profiles**  
- Print PDF KDP profile (trim/bleed — separate grill)

---

## Relationship to other backlog items

| Item | Relationship |
|------|----------------|
| Baseline novel export | **Exists**; T3 upgrades the EPUB path quality |
| Advanced export profiles | **Separate P3**; T3 rules are what a future Kindle profile would reuse — T3 does **not** ship profile SoT/UI |
| Lexical T2 | Converter correctness may touch shared export helpers; not a Lexical feature grill |
| Scene Beat removal | Already shipped; no beat nodes in export |

---

## Acceptance (when built)

- [ ] One Lexical→HTML path feeds EPUB (no divergent skinny server converter for body)  
- [ ] EPUB has title page, copyright line, nav TOC; **no** synopsis body page  
- [ ] Trade paragraph indent + scene-break `* * *` + chapter title rule  
- [ ] Minimal CSS; no embedded fonts  
- [ ] Main chapters only; versions excluded  
- [ ] Soft preflight; Export anyway works  
- [ ] Guide mentions Kindle/EPUB export  
- [ ] Smoke: open EPUB on a Kindle app / Previewer mentally checked per Guide checklist  

---

## Document history

- **2026-07-28** — Design locked (grill, all axes Lean). Job A; front matter minimal trade; body trade+detect breaks; single converter; soft preflight; P3 KDP0–KDP4; not started.
