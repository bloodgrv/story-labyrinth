# Story Labyrinth — Brand & Type Implementation Design

**Status:** **Design locked 2026-08-04** — **BT0-BT2 shipped 2026-08-04**, BT3/BT4 optional/not done. See `DECISIONS.md`'s "Story Labyrinth Brand & Type — BT0-BT2" entry.  
**Audience:** Claude Code (implementation) + Hermes (architecture)  
**Priority:** **P3** until user explicitly promotes  
**Canonical brand/type kit:** `docs/SL_Brand_And_Type.md`  
**Chrome posture (unchanged):** `docs/UI_Visual_Direction.md` (Linear A + Raycast — **do not reopen T1**)  
**Assets:** `docs/design-mocks/brand/` + `exports/`  

---

## Job

1. **Menus / UI chrome** use **Inter** (uniform sans) instead of the system UI stack.  
2. **Mono** chrome (kbd chips, tokens, code-ish UI) uses **JetBrains Mono**.  
3. **Brand display** face (**Cormorant Garamond**) available as `font-display` for sparse brand moments only.  
4. Ship **logo assets** into `public/` (icons + wordmarks) from the **pinned 2026-08-04** kit.  
5. **TopBar** shows the pinned wordmark (theme-aware) instead of plain “Story Nexus” text — **visual** brand first.  
6. **Do not** force manuscript/editor prose fonts.  
7. **Do not** run full product rename (package name, titles, README) unless a later **SL0+** promote says so — type + assets can ship alone.

---

## Current reality (audit 2026-08-04)

| Area | Today |
|------|--------|
| Tailwind `fontFamily` | **No** custom `sans` / `mono` / `display` — system UI stack |
| Live fonts | Only Reenie Beanie import in story-editor CSS; mocks load Inter via Google Fonts |
| TopBar brand | Plain text **“Story Nexus”** (`TopBar.tsx`) |
| `index.html` title / PWA | “The Story Nexus” / “Story Nexus” |
| `public/icons/` | Only `icon.svg` (upstream) |
| `public/manifest.json` | Upstream name + single SVG icon |
| Brand assets on disk | Pinned wordmarks, icon ladders, favicons, PSDs under `docs/design-mocks/brand/exports/` — **not** in `public/` |
| Font files on disk | `docs/design-mocks/brand/fonts/Inter/*.ttf`, Cormorant woff2+ttf; JetBrains **not** vendored yet (mocks use Google Fonts) |

---

## Locked decisions

| # | Decision | Lock |
|---|----------|------|
| **T1** | UI chrome face | **Inter** 400 / 500 / 600 → default `font-sans` on shell/`body` |
| **T2** | Mono face | **JetBrains Mono** 400 / 500 → `font-mono` |
| **T3** | Brand display face | **Cormorant Garamond** 600 / 700 → `font-display` **sparse only** (About titles, optional “Labyrinth” text split — **not** menus) |
| **T4** | Editor / manuscript | **Unchanged** — Lexical toolbar / writer choice; **never** force Inter or Cormorant on prose canvas |
| **T5** | Font delivery v1 | **Self-host woff2** under `public/fonts/` (offline Docker / freeware LAN). Google Fonts CDN acceptable as **dev fallback only** if self-host blocked; prefer self-host in PR. |
| **T6** | Wordmark in chrome | **Asset PNG** (pinned lockup), not live HTML “Story”+“Labyrinth” split in v1 (PSD remains SoT for edits) |
| **T7** | Wordmark files | Dark = `SL_wordmark_live_dark3` / pinned_dark; Light = `SL_wordmark_live_light2` / pinned_light |
| **T8** | Transparent wordmark | Export PNG **from matching PSD** (`SL_wordmark_live_dark3.psd` / `SL_wordmark_live_light2.psd`) by hiding Background — do not invent a second art pipeline |
| **T9** | App icon | Dark ember monogram ladder for PWA/app; simplified **favicon** ladder (no maze) for 16–32 tabs |
| **T10** | Theme pairing | Dark themes → dark wordmark + dark icon; light/day themes → light wordmark (+ light icon where used). Use existing theme class / lightness heuristic already used elsewhere if any; else `document.documentElement` class / `data-theme` |
| **T11** | Rename strings | **Out of BT\*** — package.json, window title, README “Story Labyrinth” rename = **SL0–SL3** only on separate promote |
| **T12** | T1 chrome | **Do not** reopen Linear+Raycast token work; only consume existing shell |
| **T13** | Brand color tokens | **Optional BT3** — `--brand-crimson` / `--brand-ember` accents; **do not** repaint menu labels crimson |

---

## Pinned asset map (copy sources → `public/`)

All sources under `docs/design-mocks/brand/exports/` unless noted.

### Icons / favicon

| Dest (suggested) | Source |
|------------------|--------|
| `public/icons/icon-512.png` | `SL_icon_dark_ember_512.png` |
| `public/icons/icon-192.png` | `SL_icon_dark_ember_192.png` |
| `public/icons/icon-180.png` | `SL_icon_dark_ember_180.png` (apple) |
| `public/icons/favicon-32.png` | `SL_favicon_32.png` |
| `public/icons/favicon-16.png` | `SL_favicon_16.png` |
| `public/icons/favicon.ico` | Optional build from 16+32; skip if painful |
| Keep `public/icons/icon.svg` | Replace only if a clean SVG exists; else leave + prefer PNG in manifest |

Light icon ladder exists (`SL_icon_light_bone_*`) — optional later for light PWA; **v1 dark icon is enough** for install icon.

### Wordmarks

| Dest (suggested) | Source |
|------------------|--------|
| `public/brand/wordmark-dark.png` | Transparent export from **`SL_wordmark_live_dark3.psd`** (preferred) or tight crop of pinned dark if alpha export done in-pass |
| `public/brand/wordmark-light.png` | Transparent export from **`SL_wordmark_live_light2.psd`** |
| Fallback | `SL_wordmark_pinned_dark.png` / `_light.png` (flat 2400×600 with bg) + CSS; worse for TopBar |

If Claude cannot drive Photoshop: leave a short note in PR; Hermes/user exports alpha PNGs once into `public/brand/`. **Do not block BT0 on PSD export.**

### Fonts → `public/fonts/`

| Family | Weights | Notes |
|--------|---------|--------|
| Inter | 400, 500, 600 | Convert/vendor woff2 from `docs/design-mocks/brand/fonts/Inter/` TTFs or official Inter woff2 |
| JetBrains Mono | 400, 500 | Download OFL woff2 into `public/fonts/jetbrains-mono/` (not in brand folder yet) |
| Cormorant Garamond | 600, 700 | woff2 already under `brand/fonts/CormorantGaramond/` |

---

## Build slices

| Slice | Work | Done when |
|-------|------|-----------|
| **BT0** | ✅ **Done 2026-08-04.** Fonts + Tailwind menus — `@font-face` for Inter/JetBrains/Cormorant (self-hosted woff2 under `public/fonts/`); `tailwind.config` `fontFamily.sans\|mono\|display`; `body` uses `font-sans`. Found and closed a real gap: the editor canvas had no explicit font-family before this pass and would have silently inherited Inter from `body` — added an explicit system-stack reset to `.ContentEditable__root`/`.ContentEditable__placeholder`. | DevTools computed style on TopBar/Sidebar/menu = Inter; editor prose face unchanged (confirmed live); `npm run build` clean |
| **BT1** | ✅ **Done 2026-08-04.** Promote assets — icon/favicon ladder + wordmark PNGs copied into `public/icons` + `public/brand`; `index.html` favicon/apple-touch wired; `manifest.json` icons updated (names stayed "Story Nexus" per T11). Transparent wordmark PNGs produced by chroma-keying the flat pinned exports (no Photoshop/psd-tools in this environment — see DECISIONS.md for the full method); a real PSD alpha export is a drop-in replacement at the same paths later. | Tab icon shows simplified SL; PWA icons list PNGs; files promoted out of `docs/` — confirmed |
| **BT2** | ✅ **Done 2026-08-04.** TopBar wordmark — text "Story Nexus" replaced with theme-aware `<img>` (`isDarkThemeId()` in `theme-provider.tsx`, classified per-theme by actual `--background` lightness across all 18 themes, not a light/dark binary); height 24px (`h-6 w-auto`). | Desktop TopBar shows pinned lockup; Dark/Light/Graphite theme switch all confirmed live to swap the correct asset; no layout blowout |
| **BT3** | **Optional brand CSS tokens** — `--brand-crimson`, `--brand-ember` in `:root` or theme blocks; use only if a call site needs them (hairline, rare CTA). **No** global primary repaint | Tokens exist; zero or 1–2 restrained call sites; menus not crimson |
| **BT4** | **Optional About blurb** — if an About/Help surface exists, one line credit + freeware posture; Cormorant only on a display title if it fits | No drive-by string replace across app |

**Suggested order:** **BT0 → BT1 → BT2**; **BT3/BT4** only if time / explicit ask.

**Rename (not in BT\*):** SL0–SL6 per `SL_Brand_And_Type.md` §8 — separate kickoff.

---

## Implementation notes (Claude)

### BT0 — Tailwind sketch

```js
// tailwind.config — theme.extend.fontFamily
sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
mono: ["JetBrains Mono", "ui-monospace", "monospace"],
display: ["Cormorant Garamond", "Georgia", "serif"],
```

- Ensure global shell uses `font-sans` (body or root layout).  
- Do **not** add `font-sans` to Lexical ContentEditable / prose root.  
- Prefer `font-display` utility class used **explicitly** at 0–few call sites.

### BT2 — TopBar

- File: `src/components/workspace/TopBar.tsx` (current plain text ~line with “Story Nexus”).  
- Prefer CSS `content-visibility` / fixed height so 2400×600 sources scaled down stay sharp (`height` + `w-auto`).  
- Transparent PNG on `bg-background` — correct for both themes.

### Verification

1. Cold load: no FOIT disaster (use `font-display: swap`).  
2. Theme switch Dark ↔ Light (and one mid theme): wordmark readable.  
3. Sidebar tool labels, Settings tabs, dropdown menus = Inter.  
4. Open chapter editor: body prose **not** Inter-forced.  
5. `npm run build` + smoke dev client.  
6. Record load-bearing choices in `DECISIONS.md`; tick slices in this doc + `CURRENT_BACKLOG.md`.

---

## Non-goals (this promote)

- Full **Story Labyrinth** string rename (package, title, README, CLAUDE.md branding)  
- Reopening **T1** chrome / theme pack redesign  
- SVG trace of monogram (nice follow-up)  
- Forcing Cormorant on navigation labels  
- Metal/bevel wordmark (dark2) — **not** pinned  
- Copying every export ladder size into `public/` (only sizes we wire)  
- DB / Docker / publish identity (SL5+)  
- Ricordo / PAM naming  

---

## Claude Code kickoff (copy-paste)

```text
Read CLAUDE.md, docs/CURRENT_BACKLOG.md, docs/SL_Brand_And_Type.md,
and docs/SL_Brand_Type_Implement_Design.md (this plan — locked 2026-08-04).

Implement Story Labyrinth brand & type slices BT0 → BT1 → BT2 only.
BT3/BT4 optional if trivial after BT2.

BT0 (required): Self-host Inter + JetBrains Mono + Cormorant Garamond;
Tailwind fontFamily sans/mono/display; app shell menus/chrome use Inter.
Do NOT change Lexical/manuscript editor prose fonts.
Do NOT reopen UI_Visual_Direction / T1 chrome tokens.
Do NOT rename package.json / window title / README to Story Labyrinth (SL0+ later).

BT1: Promote pinned icons/favicons from
docs/design-mocks/brand/exports/ into public/icons (and wordmarks to
public/brand when transparent PNGs available). Wire favicon + manifest icons.
Manifest name strings may stay "Story Nexus" until SL1.

BT2: TopBar wordmark from pinned assets (dark3 / light2). PSD SoT for
transparent exports: SL_wordmark_live_dark3.psd / SL_wordmark_live_light2.psd.

Pinned wordmarks: exports/SL_wordmark_pinned_dark.* and _light.*.
Record decisions in DECISIONS.md; update CURRENT_BACKLOG.md and this design
doc slice checkmarks when done. npm run build must stay clean.
```

---

## Document history

- **2026-08-04** — Initial implementation design locked for Claude promote (BT0–BT4). Brand kit + pinned wordmarks already in `SL_Brand_And_Type.md` / exports.  
