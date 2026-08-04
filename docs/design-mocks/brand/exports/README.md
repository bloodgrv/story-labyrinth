# Story Labyrinth — production-ish exports

Built 2026-08-04 from pinned mocks (`../` + `docs/SL_Brand_And_Type.md`).

**Not** promoted to `public/icons/` yet — copy only on explicit ship step.

## App icon — dark ember (primary)

Source: `../SL icon.png` (2048 RGBA full-bleed monogram) → cropped white margin → square master.

| File | Notes |
|------|--------|
| `SL_icon_dark_ember_master.psd` | Photoshop master |
| `SL_icon_dark_ember_2048.png` | Master PNG |
| `SL_icon_dark_ember_{1024,512,256,192,180,128,64,48,32,16}.png` | Size ladder |

- **32px:** SL still readable (maze softens).
- **16px:** blob-ish amber mark — OK as browser tab hint; use simplified favicon set below for real tabs.

## App icon — light bone

Source: `../SL_icon_light_bone.jpg` product mock → tile crop → upscaled ladder.

| File | Notes |
|------|--------|
| `SL_icon_light_bone_2048.png` | Master PNG (from ~464px tile, LANCZOS up) |
| `SL_icon_light_bone_{sizes}.png` | Same ladder as dark |

Prefer regenerating light from a true 2k full-bleed render when available.

## Maze mark (live source)

Clean circular labyrinth from Comfy/Grok render (not crop-from-wordmark).

| File | Notes |
|------|--------|
| `SL_maze_mark_source.jpg` | Original 1024 render |
| `SL_maze_mark_master.png` | Transparent master |
| `SL_maze_mark_{1024,512,256,128,64,32}.png` | Ladder |

## Wordmark — **PINNED 2026-08-04**

Final lockup pair (user-approved):

| Role | File | Notes |
|------|------|--------|
| **Dark (primary)** | `SL_wordmark_pinned_dark.jpg` / `.png` | = `SL_wordmark_live_dark3.jpg` — line maze + ember core; **flat** silver Story + crimson Labyrinth |
| **Light (primary)** | `SL_wordmark_pinned_light.jpg` / `.png` | = `SL_wordmark_live_light2.jpg` — clean gold line maze on bone; charcoal Story + crimson Labyrinth |

**Why these:** maze carries drama; type stays flat (UI-safe at header size). dark2 metal/bevel variant kept as exploration only.

### Supporting / editable

| File | Notes |
|------|--------|
| `SL_wordmark_live_dark3.jpg` | Source of pinned dark |
| `SL_wordmark_live_light2.jpg` | Source of pinned light |
| **`SL_wordmark_live_dark3.psd`** | **SoT editable / transparent** for pinned dark |
| **`SL_wordmark_live_light2.psd`** | **SoT editable / transparent** for pinned light |
| `SL_wordmark_live_dark.psd` / `_light.psd` | Earlier flat live-type masters (not the pinned look) |
| `SL_wordmark_live_dark2.psd` | Metal/bevel exploration |
| `SL_wordmark_live_{dark,light}.png` etc. | Earlier Python flats / headers — superseded for hero use |

**Transparent variants:** open **`SL_wordmark_live_dark3.psd`** (dark) or **`SL_wordmark_live_light2.psd`** (light), hide Background, export PNG. Those PSDs match the pinned JPGs.

**Type stack (when rebuilding live):** Story = Inter Medium; Labyrinth = Cormorant SemiBold. Fonts under `../fonts/`.

### Legacy mock crops (2026-07-31 — superseded for wordmark)

| File | Notes |
|------|--------|
| `../SL_wordmark_dark_crimson_ember.jpg` | Early generative pin |
| `../SL_wordmark_light_crimson.jpg` | Early generative pin |
| `SL_wordmark_*_cropped.png` | Crops of early mocks |

## Favicon — simplified SL (no maze)

Live Garamond Bold monogram (system `GARABD.TTF`), ember on charcoal. No maze filigree.

| File | Notes |
|------|--------|
| `SL_favicon_master_512.png` | Rounded + side hairlines |
| `SL_favicon_plain_512.png` | No hairline (source for tiny sizes) |
| `SL_favicon_master_square_512.png` | Square plate |
| `SL_favicon_{128,64,48,32,16}.png` | Ladder |

- **32px:** clearly **SL**
- **16px:** legible as two warm letter-shapes

## Still open

1. **Transparent / mask icon variants** — plate only vs baked rounded tile.
2. **SVG** monogram + maze for crisp chrome.
3. Drop assets into app chrome / favicon.
4. Promote selected set → `public/icons/` when renaming ships.
