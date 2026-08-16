# SN UI Visual Direction

**Status:** **Design locked 2026-07-21** (chrome posture); **V0/V1/V2 all shipped 2026-07-21** — chrome pass complete  
**Talk list:** T1  
**Mocks:** `docs/design-mocks/`  
**Constraint:** token / chrome polish only — **no** workspace shell rewrite (rail · main · chat stays)

---

## Locked decision

| Axis | Lock |
|------|------|
| **Chrome posture** | **Linear A + Raycast accents** hybrid |
| **Not chosen** | Pure Raycast ceiling as full chrome; Obsidian multi-pane as default shell |
| **Structure** | Linear density: hairlines, tight type, luminance steps, left active rail bar |
| **Energy** | Raycast accents only: ⌘K / cmd strip, soft glow on active + focus, gradient primary CTA, topbar accent hairline |
| **Palettes** | **All** SN themes first-class under the same chrome. New packs (Mist, Bone, …, mids) + classics (Light, Dark, Midnight, Eclipse, Sand, …). Default theme not forced by this lock. |

**One-liner:** *Look like Linear. Sparkle like Raycast. Don’t become either clone.*

---

## What “Linear + Raycast” means in practice

### Do
- Dense, quiet surfaces; 1px structure; modest radius (`~6px` chrome, not chunky)
- Active rail: subtle fill + **2px left primary bar** + light Raycast glow
- Command / jump affordance with spark + kbd chip
- Primary buttons: violet gradient (theme-aware) + restrained glow
- User chat bubble: slight primary tint + soft edge glow
- Accent pill (desk/mode) uses gradient wash, not solid noise

### Don’t
- Full-app gradients or rainbow accents
- Glow on body text, prose, or every list row
- Obsidian file-tree + tabstrip as the **default** layout (optional density mode later = separate decision)
- New layout architecture / foundation rewrite
- Heavy glassmorphism everywhere

---

## Reference artifacts

| File | Role |
|------|------|
| `docs/design-mocks/SN_Eclipse_Linear_Raycast.png` | **Canonical dark** (Linear+Raycast · Eclipse) |
| `docs/design-mocks/SN_Linear_Raycast_Light.png` | **Canonical day** (Linear+Raycast · Light) |
| `docs/design-mocks/SN_Eclipse_Hybrids.html` | Interactive Eclipse A/B (A = chosen shape) |
| `docs/design-mocks/SN_Linear_Raycast_Light.html` | Interactive Light A |
| `docs/design-mocks/SN_UI_Moodboard.html` | Earlier 3-way board (historical) |
| `docs/design-mocks/SN_Eclipse_Obsidian_Raycast.png` | Rejected-as-default (Obsidian+Raycast) — keep for optional later |

---

## Implementation plan (when promoted to code)

**Scope:** CSS tokens + light component chrome. No desk IA change.

### Slice V0 — Tokens — ✅ Done 2026-07-21
- `--raycast-a` / `--raycast-b` added to all 17 theme blocks in `src/index.css` — `a` = theme's own `--primary`, `b` = the same hue/saturation shifted ~14pts of lightness away from `--primary` (lighten if primary is dark, darken if primary is light), so every theme gets a real 2-stop gradient instead of a flat one even where `--primary`/`--ring` already coincide (true for 15 of 17 themes)
- `--accent-glow` added, aliasing `--raycast-a` (`var(--raycast-a)`) — single glow color per theme
- `--accent-glow-strength` added, a unitless 0–1 opacity dial hand-tuned per theme's background lightness: 0.25 for light/day themes (Light, Sepia, Mist, Bone), 0.35 for the black-text mid packs (Mid Stone/Slate/Sage), 0.45 for mid-grey Graphite, 0.55–0.7 for dark/night themes (Dark, Midnight, Eclipse, Sand, Forest, Dark Parchment, Ember, Abyss, Matrix — Abyss/Matrix highest at 0.7 as the "void" themes)
- `--radius` tightened from `0.5rem` to `0.375rem` in `:root` (global, not per-theme — no other theme block overrides it) — `lg`/`md`/`sm` now resolve to 6px/4px/2px, matching the doc's "~6px chrome" target
- **Not yet consumed by any component** — these tokens have zero visual effect until V1 (shell chrome) and V2 (chat/AI accents) actually apply them. Verified live: all 18 theme menu entries still render/switch correctly, no console errors, `--radius` change visible in existing rounded corners
- **Next:** V1 — shell chrome (topbar hairline, rail active-bar + glow, cmd palette styling, primary button gradient)

### Slice V1 — Shell chrome — ✅ Done 2026-07-21
- Topbar (`src/components/workspace/TopBar.tsx`): `.raycast-hairline` utility class added to the header — a gradient wash (`--raycast-a` → `--raycast-b`, transparent at both ends) layered over the existing `border-b` bottom edge
- Rail active (`src/components/workspace/Sidebar.tsx`): `.raycast-rail-active` applied to the active tool button on the **desktop** rail only (`isActive` branch) — 2px left bar in `--raycast-a` + a soft `box-shadow` glow using `--accent-glow`/`--accent-glow-strength`. Deliberately not applied to the mobile bottom toolbar (no "left rail" concept there)
- Cmd palette trigger (`TopBar.tsx`'s search icon button): `.raycast-cmdk-trigger` adds a soft glow ring on `:hover`/`:focus-visible` only — no permanent outline change
- Primary button gradient: new opt-in `variant="gradient"` on the shared `Button` (`src/components/ui/button.tsx`), backed by `.raycast-gradient-primary`. **Deliberately not applied to the existing `default` variant** — the doc's own "Don't: full-app gradients" rule — so this is additive, not a global restyle. Demoed on one real call site for live verification: Notes tool's empty-state "Create New Note" CTA (`src/components/workspace/tools/NotesTool.tsx`). Broader adoption across other primary CTAs is a deliberate follow-up decision, not automatic
- All three CSS utility classes live in `src/index.css` under a new `@layer utilities` block, consuming the V0 tokens (`hsl(var(--raycast-a) / ...)`, `calc(var(--accent-glow-strength) * ...)`) — nothing hardcoded per-theme
- **Verified live** across Dark (near-white desaturated primary → subtle pale glow, as expected — theme-aware, not forced-violet), Mist (clear indigo gradient CTA + violet rail bar), and Abyss (ice-blue gradient CTA + matching rail bar); cmd-palette hover glow confirmed; no console errors on any theme; reverted to Dark afterward
- **Next:** V2 — chat/AI accents (user bubble border/glow, desk/mode pills) — explicitly stops short of manuscript prose picking up accent color

### Slice V2 — Chat / AI accents — ✅ Done 2026-07-21
- User bubble border/glow (`src/features/brainstorm/components/ChatMessageList.tsx`, shared by both `features/chat` and `features/brainstorm` ChatInterfaces): new `.raycast-user-bubble` utility layers a subtle ring + glow over the existing solid `bg-primary` fill — the fill itself is unchanged, just a restrained edge treatment added
- Desk/mode pills: Research's Story/Global `Tabs` (`src/components/workspace/tools/ResearchTool.tsx`) get a `.raycast-pill-active` gradient-wash underline on whichever tab is active, driven by the component's own `mode` state (not a CSS `data-[state=active]` override — deliberately avoids fighting the shared `Tabs` primitive's existing background/shadow classes)
- **Stopped exactly where planned**: manuscript prose/editor surfaces never got a `.raycast-*` class — no accent creep into chapter content
- **Verified live**: switched to Mist, confirmed the Story/Global pill's gradient underline moves correctly between tabs; sent a real message through Research chat and confirmed the user bubble shows the ring+glow over its solid fill; no console errors on Mist or after reverting to Dark. Test chat (auto-created, single test message) was deleted via the API afterward — confirmed via direct DB read it held no prior content before deleting

**All three V-slices (V0/V1/V2) of the Linear+Raycast chrome pass are now shipped.** Remaining open items are the ones listed below (default theme choice, exact glow intensity, Light's button-primary hue) — none block calling the chrome pass itself done.

### Verify
- **Every** theme class in `index.css` / theme picker (not a subset)
- No readability regression on grey Eclipse text or mid black-text packs
- Reduced-motion: kill glow pulse if any animation added

### Non-goals (this pass)
- Obsidian linked panes
- New icon set / marketing site polish
- Changing Operate grid columns
- Recoloring classic packs (Midnight/Sand/etc. keep their hues unless separately redesigned)

### Chrome applies to all themes
**Yes — planned.** V0–V2 is a single chrome recipe (Linear density + Raycast accents) driven by each theme’s `--primary` / optional `--raycast-*` tokens. We do **not** leave classics on old chrome while only new packs get the hybrid. Mock target: `docs/design-mocks/SN_All_Themes_LinearRaycast.html`.

---

## Open (not blocked on chrome lock)

- [ ] Default theme after ship (user pref still wins; product default TBD)
- [ ] Exact glow intensity dial (mock = ceiling; ship may be −20%)
- [x] Rail active-item shape — **resolved 2026-08-15**: pill (gradient fill + border glow), not the left bar. See History below.
- [x] Whether Light keeps violet Raycast primary vs ink SN Light primary for buttons only — **resolved 2026-08-15**: decoupled. `--raycast-a`/`-b` (accent/glow tokens only) now use a real violet (matching Midnight/Eclipse's own hue family), independent of `--primary` (still the ink navy, unchanged, still used by the flat default Button). Sepia's accent tokens were brightened/re-saturated the same session (was deriving straight from its dark-brown `--primary`, read muddy) — both confirmed live against Bone (the one day theme that already worked) and now read consistently. See DECISIONS.md.
- [ ] Optional later: Obsidian density mode (chapter tree) as toggle — not default
- [ ] **Palette candidates** — promoted 2026-07-21 (see table); further tweaks OK
- [x] Gradient-CTA rollout scope — **resolved 2026-08-15**: rolled out from the one original Notes call site to 15 more (toolbar "create" buttons, "+ New Chat" across every chat rail, the composer Send button). See History below.

---

## Palette candidates (2026-07-21) — **promoted to app themes**

Chrome stays **Linear A + Raycast** (chrome polish still pending). Color packs below are live in `src/index.css` + theme picker.

| ID | Label | Mode | Notes |
|----|-------|------|--------|
| `mist` | Mist | Day | Cool paper, indigo |
| `bone` | Bone | Day | Warm clay, copper |
| `dark-parchment` | Dark Parchment | Dim warm | Aged paper, amber |
| `abyss` | Abyss | Night | Ice blue void |
| `matrix` | Matrix | Night | Phosphor green / Borg |
| `ember` | Ember | Night | Muted crimson |
| `mid-stone` | Mid Stone | **Mid · black text** | Warm stone ~L72 |
| `mid-slate` | Mid Slate | **Mid · black text** | Cool gray ~L70 |
| `mid-sage` | Mid Sage | **Mid · black text** | Sage gray ~L71 |

Mocks: `docs/design-mocks/SN_Palette_Candidates.*`, `SN_Mid_BlackText.*`

Existing **Graphite** remains another mid-brightness black-text option (~L40, darker mid).

### HSL seeds (shipped as CSS vars — refine in app if needed)

```css
/* mid-stone ~ black text */
--background: 32 14% 72%;
--foreground: 30 12% 10%;
/* mid-slate */
--background: 220 10% 70%;
--foreground: 224 20% 10%;
/* mid-sage */
--background: 140 12% 71%;
--foreground: 150 18% 10%;
```

---

## History

- 2026-07-21 — Moodboard Linear / Obsidian / Raycast × Sand/Midnight  
- 2026-07-21 — Eclipse hybrids; user chose **Linear A + Raycast** over Obsidian B  
- 2026-07-21 — Light day twin of Linear+Raycast  
- 2026-07-21 — **Chrome posture locked** this doc  
- 2026-07-21 — Palette candidates: Mist, Bone, Dark parchment, Abyss, Matrix/Borg, Ember  
- 2026-07-21 — **Promoted** those six + Mid Stone / Mid Slate / Mid Sage (black text) into app themes  
- 2026-07-21 — **V0 tokens shipped**: `--raycast-a`/`--raycast-b`/`--accent-glow`/`--accent-glow-strength` added to all 17 theme blocks; `--radius` tightened 0.5rem → 0.375rem  
- 2026-07-21 — **V1 shell chrome shipped**: topbar gradient hairline, sidebar active-rail bar + glow, cmd-palette trigger hover glow, opt-in `Button variant="gradient"` (demoed on Notes' empty-state CTA)  
- 2026-07-21 — **V2 chat/AI accents shipped**: user bubble ring+glow, Research Story/Global pill gradient underline; stopped before manuscript prose  
- 2026-08-15 — **Sidebar rail: left-bar → pill.** Live A/B in the running app (screenshotted both) settled the open "rail active-item shape" question — `.raycast-rail-active` is now a gradient-glass pill (fill + border glow), not a left bar. New `.raycast-sidebar-hairline` added too, the vertical counterpart to the topbar's horizontal hairline, replacing the sidebar's flat `border-r`. Confirmed theme-aware by switching the live theme class at runtime (no code changes) across Ember/Light/Mid-Slate — which is also what surfaced the confirmed (not hypothetical) Light gap noted above. See `DECISIONS.md`'s "Linear+Raycast chrome — sidebar pill treatment + broader gradient-CTA rollout" entry.
- 2026-08-15 — **Gradient CTA rolled out** from Notes' original single call site to 15 more buttons (toolbar creates, every chat rail's "+ New Chat", the shared composer Send button), user-scoped by tier via explicit confirmation. Same DECISIONS.md entry.
- 2026-08-15 — **Light's accent color fixed** (same day, immediate user follow-up after comparing Bone/Light/Sepia live): `--raycast-a`/`-b` decoupled from `--primary` and given a real violet, matching the dark themes' own hue family — closes the "violet vs ink" open item for good. **Sepia's accent brightened/re-saturated too** (was deriving straight from a dark coffee-brown `--primary`, read muddy against Bone's working copper) — both re-verified live, now consistent with Bone. See `DECISIONS.md`'s "Linear+Raycast chrome — Light/Sepia accent-token fix" entry.

*Chrome pass (V0/V1/V2) complete as of 2026-07-21. Rail shape, gradient-CTA scope, and Light/Sepia's accent color all resolved 2026-08-15. Remaining open items (default theme, exact glow dial) are follow-ups, not blockers.*

---

## Brand type (fork identity — separate doc)

Product naming / logo / menu font stack for a possible **Story Labyrinth** identity lives in **`docs/SL_Brand_And_Type.md`** (2026-07-31). That kit does **not** change Linear+Raycast chrome locks. Summary: **Inter** for UI menus; optional **Cormorant Garamond** for brand display only; **JetBrains Mono** for mono chips (matches these mocks). Full rename of the app is **not** locked until explicitly promoted.
