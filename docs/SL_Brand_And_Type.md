# Story Labyrinth — Brand & Type Kit

**Status:** **Guidance + asset kit ready** — logo/wordmarks pinned 2026-08-04; type stack recommended. **Product rename not locked** (no SL0 code pass yet).  
**Implementation plan (Claude):** `docs/SL_Brand_Type_Implement_Design.md` — **locked 2026-08-04**, slices **BT0–BT4**, **not started** until explicit promote.  
**Posture:** Personal / household **freeware** fork identity (upstream The Story Nexus was freeware). Market uniqueness is secondary to a name and look you want to live in.  
**Related:** `docs/UI_Visual_Direction.md` (Linear A + Raycast chrome — **unchanged**); design mocks under `docs/design-mocks/`.  
**Out of scope here:** Full app rebrand string rename, DB rename, Docker/publish names, trademark search (see SL0–SL6 + implement doc non-goals).

---

## 1. Identity (working, not frozen as shipped UI)

| Layer | Working value | Notes |
|--------|----------------|-------|
| Display name | **Story Labyrinth** | Two words in UI/README when rename ships |
| Machine / package | `storylabyrinth` | Prefer no spaces; `story-labyrinth` acceptable alternate |
| Short form | **SL** | Replaces **SN** in chat/docs over time; SN = upstream or legacy |
| Spoken | Labyrinth / the Labyrinth / SL | “Labyrinth” alone = film in public; fine in-house |
| Distribution posture | **Freeware / den tool** | Not positioned as sales SaaS day one |
| Upstream | Fork of The Story Nexus (Jon Silver et al.) | Always credit; never pretend to *be* upstream |
| Sibling product | **Ricordo** (personal agent memory) | Separate brand — do not merge naming |

**One-line job (internal):**  
*A local-first writer’s maze with a map — desks, canon, HITL AI.*

**Name status:** Strong personal lean (including family resonance). **Not** SL0-locked into `package.json` / window title until user says lock / implement. This doc may be used before or after that lock.

---

## 2. Logo kit (pinned)

**Stored on disk:** `docs/design-mocks/brand/` (+ `exports/`). See folder `README.md`.

### Wordmarks — **pinned 2026-08-04** (final lockup)

| Role | File | Description |
|------|------|-------------|
| **Dark wordmark** | `docs/design-mocks/brand/exports/SL_wordmark_pinned_dark.jpg` | Line maze + ember core; **flat** silver **Story** (Inter) + wine **Labyrinth** (Cormorant). Source: `SL_wordmark_live_dark3.jpg`. |
| **Light wordmark** | `docs/design-mocks/brand/exports/SL_wordmark_pinned_light.jpg` | Clean gold line maze on bone; charcoal **Story** + wine **Labyrinth**. Source: `SL_wordmark_live_light2.jpg`. |

Editable / transparent SoT PSDs (match pinned JPGs):  
- Dark → `exports/SL_wordmark_live_dark3.psd`  
- Light → `exports/SL_wordmark_live_light2.psd`  

**Transparent / alpha:** hide Background in that PSD, export PNG.  
**UI rule:** keep type **flat** (no metal/bevel) at chrome sizes; maze may glow.

### App icons (still 2026-07-31 mocks + 2026-08-04 exports)

| Role | File | Description |
|------|------|-------------|
| **App icon (dark)** | `docs/design-mocks/brand/SL_icon_dark_ember.jpg` (+ `exports/SL_icon_dark_ember_*`) | Ember **SL** monogram on charcoal |
| **App icon (light)** | `docs/design-mocks/brand/SL_icon_light_bone.jpg` (+ `exports/SL_icon_light_bone_*`) | Bone plate; charcoal SL; gold path |
| **Favicon** | `docs/design-mocks/brand/exports/SL_favicon_*` | Simplified SL, no maze (16–128) |

### Superseded wordmark mocks (2026-07-31)

| File | Note |
|------|------|
| `SL_wordmark_dark_crimson_ember.jpg` | Early generative dark — replaced by pinned_dark |
| `SL_wordmark_light_crimson.jpg` | Early generative light — replaced by pinned_light |

### Reference (original gold favorites)

| File | Note |
|------|------|
| `SL_icon_dark_gold_original.jpg` | Early monogram #2 |
| `SL_wordmark_dark_gold_original.jpg` | Early wordmark #3 |

### Discarded / archive

Non-pinned explorations (still on disk for reference):

**Folder:** `docs/design-mocks/brand/archive/`

Includes: circular maze + thread-maze concepts; blood / ice / ember / early-light monograms; blood flat-gold, ice, full-ember, light-black-Labyrinth wordmarks; light crimson + redder quieter maze (rejected in favor of pinned light crimson).

See `archive/README.md`.

### Asset rules

- Prefer **SVG** (or cleaned PNG) for header/favicon/PWA when implementing — these JPGs are **mock source**, not final production icons.
- Favicon / 16–32px: monogram (SL) wins over full wordmark.
- No goblin/Bowie/movie poster imagery; maze = **map**, center = story/canon.
- Shipping to `public/icons/` is a separate promote step (not done).

---

## 3. Type — important honesty

The logo PNGs are **generative**. They do **not** embed a licensed font file. Lettershapes are approximations.

| Mock element | Apparent style | Real-font stand-ins |
|--------------|----------------|---------------------|
| “Story” | Clean geometric sans, medium | **Inter**, Geist Sans, IBM Plex Sans |
| “Labyrinth” / SL monogram | High-contrast editorial **display serif** | **Cormorant Garamond** (preferred — bookish) or **Playfair Display** (more bite) |
| UI menus / chrome | Must stay sans at small sizes | **Inter** |

**Do not** put display serif on every menu row. Serif = brand wordmark and rare titles only.

---

## 4. Recommended type stack (menus uniform)

| Role | Font | Weights | Where |
|------|------|---------|--------|
| **UI chrome** (menus, rails, dialogs, chat chrome, settings) | **Inter** | 400, 500, 600 | Default `font-sans` app-wide shell |
| **Brand display** (“Labyrinth”, SL monogram if text-based, About titles) | **Cormorant Garamond** (default pick) | 600, 700 | `font-display` — sparse |
| **Wordmark “Story”** | Inter | 500 | Matches mock split |
| **Mono** (kbd chips, tokens, code) | **JetBrains Mono** | 400, 500 | Aligns with existing Linear+Raycast mocks |
| **Manuscript / editor canvas** | **Unchanged** | — | Lexical font picker / writer choice — **not** forced to Inter |

### Why Inter for menus

- Already used in `docs/design-mocks/*` Linear+Raycast boards  
- Fits locked chrome posture (`docs/UI_Visual_Direction.md`)  
- Legible at dense 12–13px chrome  
- OFL / Google Fonts or self-host  

### Live app today (baseline)

- **No** custom `fontFamily` in `tailwind.config.js` → system UI stack (Segoe UI on Windows, etc.)  
- Mocks: Inter + JetBrains Mono  
- Editor: separate (Arial default in toolbar constants; Reenie Beanie only for a story-editor flourish import)

---

## 5. Implementation sketch (superseded for Claude)

Detail and slices live in **`docs/SL_Brand_Type_Implement_Design.md`** (BT0–BT4). Short remainder:

1. **Load fonts** once (`public/fonts/` + `@font-face` and/or `src/index.css`):
   - Inter 400/500/600  
   - JetBrains Mono 400/500  
   - Cormorant Garamond 600/700  
2. **Tailwind** `theme.extend.fontFamily` → `sans` / `mono` / `display` as in implement doc.  
3. Shell / `body` → `font-sans` (Inter).  
4. TopBar → **asset wordmark** (pinned dark3/light2), not live split type in v1.  
5. **Never** force editor prose face to Inter/Cormorant.  
6. Self-host woff2 under `public/fonts/` for offline Docker (freeware LAN use).

---

## 6. Brand color accents (logo-aligned)

Chrome themes stay per `index.css` theme packs. These are **brand accents** for logo, hairline, rare CTAs — not a mandatory full-theme rewrite.

| Token (suggested) | Role | Approx |
|-------------------|------|--------|
| `--brand-crimson` | “Labyrinth” word, rare emphasis | Wine/blood ~`hsl(350 55% 42–48%)` |
| `--brand-ember` | Maze glow, warm accent | Amber ~`hsl(32 90% 55%)` dark; softer gold on light ~`hsl(38 55% 40%)` |
| UI surfaces | Existing theme `--background` / `--foreground` / `--primary` | Unchanged by default |

**Rules**

- Do **not** paint all menu labels crimson.  
- Ember glow on chrome = Raycast-strength restrained (see UI visual direction) — not logo-bloom on body text.  
- Optional later: an “SL default” theme pack that biases primary toward ember/crimson — **separate decision**.

---

## 7. Split: brand vs chrome vs prose

| Layer | System |
|-------|--------|
| **Brand** | Story Labyrinth name, monogram, wordmark, crimson + ember accents |
| **Chrome** | Linear A + Raycast (`UI_Visual_Direction.md`) + **Inter** menus |
| **Prose** | Lexical + user font stack — continuity studio, not brand billboard |

---

## 8. Rename slices (reference only — not started)

From identity sketch; execute only on explicit user promote:

| ID | Scope |
|----|--------|
| **SL0** | Decision in DECISIONS + backlog pointer + this doc canonical |
| **SL1** | `package.json` name/displayName + README + app title |
| **SL2** | Guide / welcome / About strings |
| **SL3** | docs headers / backlog title |
| **SL4** | Hermes skill display / memory SN→SL |
| **SL5** | DB filename / Docker / publish — separate day |
| **SL6** | Own GitHub remote |

Freeware-friendly minimum when renaming: **SL0–SL3**. Type stack (Inter) can ship **without** full rename.

---

## 9. Open choices

| # | Choice | Default in this doc |
|---|--------|---------------------|
| 1 | Display serif: Cormorant vs Playfair | **Cormorant Garamond** |
| 2 | Self-host fonts vs Google Fonts CDN | Prefer **self-host** for offline Docker later; CDN OK for dev |
| 3 | Product rename SL0+ | **Not locked** — user promote |
| 4 | Marrowrite / other names | Spare only; SL is the active lean |

---

## 10. Document history

- **2026-07-31** — Initial brand & type kit: freeware posture; pinned dark ember icon + crimson/ember wordmark; light bone + crimson Labyrinth; Inter UI + Cormorant display + JetBrains Mono; generative logo caveat; implementation sketch; no code rename.
- **2026-07-31 (later)** — Pinned (+ original gold reference) mocks downloaded to `docs/design-mocks/brand/*.jpg`; doc paths updated. Not copied to `public/icons/`.
- **2026-07-31 (later)** — Remaining exploration mocks downloaded to `docs/design-mocks/brand/archive/` (concepts, colorways, rejected quiet-red maze).
- **2026-08-04** — Wordmark lockup refreshed: `exports/SL_wordmark_pinned_dark` (= live_dark3, flat type + ember maze) and `pinned_light` (= live_light2). Icon ladders, simplified favicons, editable PSDs, font files under `brand/fonts/`. Early generative wordmark JPGs superseded for wordmark role only.
- **2026-08-04 (later)** — Claude implementation plan locked: `docs/SL_Brand_Type_Implement_Design.md` (BT0 fonts/menus → BT2 TopBar wordmark; rename still SL0+).
