# Auto Humanizer — Design

**Project:** Story Labyrinth  
**Status:** **Design locked 2026-08-14 — implemented in full 2026-08-15 (AH0–AH8).** See `docs/CURRENT_BACKLOG.md`'s Auto Humanizer row and `DECISIONS.md`'s "Auto Humanizer (AH0–AH8)" entry for the build trail.  
**Talk list:** **Auto Humanizer**  
**Backlog slices:** **AH0–AH8** (P3 until promoted)  
**Inspiration:** LM Studio plugin `altra/humanize` (local detect + threshold gate + rewrite; final surface shows humanized only)  
**Sibling (shipped):** **Humanizer** — Main Editor select → **Humanize** button; Light/Medium/Strong; `FeatureKey "humanizer"`. SoT: `DECISIONS.md` + skill `references/humanizer.md`.

**Locked same turn:** Lean package from scoped v0.1 **+** Editor right-rail **Humanize** sheet hosting **both** Manual and Auto controls.

---

## Context / job

The author generates or accepts AI prose into the **Main Editor**. Today they either live with AI flavor until a manual Humanize pass, or they remember to select + click. The LM Studio plugin they used felt better for drafting volume: **pipeline on → only the de-slopped text is what they read**, with a **slider** deciding how aggressive the *gate* is (when to bother rewriting).

**Is this feature:** a **separate** global pipeline that, when enabled, runs **detect → (optional) rewrite** at **AI→Main Editor commit** time, so the chapter receives **only** the humanized result (or the original if detect says “already human enough”). Own settings row, own FeatureKey. **Plus** a first-class **Editor right-rail sheet** where **both** Manual Humanizer and Auto Humanizer live together for in-flow control (not Settings-only).

**Not this feature:**

| Surface | Job |
|---------|-----|
| **Humanizer (shipped logic)** | On-demand selection rewrite; L/M/S — **stays**; gains Editor sheet home + keeps floating toolbar when enabled |
| **AI Review** | Manuscript craft desk — **no** rewrite on desk (`docs/AI_Review_Design.md`) |
| **RAG Scanner** | Factual continuity |
| **Grammar / LanguageTool** | Live marks, not prose voice rewrite |
| **Selection Rework / Editor chat** | HITL rewrite with before/after — user *should* see drafts |
| **Hermes creative `humanizer` skill** | Outside-app prose edit |
| **Silent post-process of chat bubbles** | Chat stays chat; only **editor commit** paths |

**Doctrine:**  
- **Manual Humanizer** = surgical, user-visible selection.  
- **Auto Humanizer** = optional **commit filter** on AI inserts into the manuscript.  
- **Editor Humanize sheet** = single right-rail home for **both** (settings + run manual on selection).  
- Default Auto **OFF**. Fail **open** (don’t block writing).  
- **Never** rewrite user typing/paste.  
- **Never** attach to AI Review desk actions.  
- Prefer **reuse** detector heuristics + rewrite service patterns over a second agent framework.

---

## Product name

| | |
|--|--|
| **Display (pipeline)** | **Auto Humanizer** |
| **Display (Editor rail sheet)** | **Humanize** |
| **Short** | Auto-humanize / pipeline |
| **Code / table** | `autoHumanizerSettings`; routes `/api/auto-humanizer` |
| **FeatureKey** | `"auto_humanizer"` (separate from `"humanizer"`) |
| **DrawerType** | `"humanize"` on `EditorToolsPanel` |

---

## Locked decisions (2026-08-14 — Lean package + rail sheet)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Job | **Separate feature** from manual Humanizer — own settings, enable, FeatureKey |
| **2** | Commit surfaces v1 | **Accept prose-proposal** only (Editor chat apply core) |
| **2b** | Commit surfaces later | **AH7:** selection **Generate** after stream (before insert); italic = keep Generate’s AI italic on result |
| **3** | Visibility | **Hard silent** — chapter never shows raw when rewrite runs; Accept busy “Humanizing…” |
| **4** | Gate default | **Detect + threshold** — slider **0–100 step 5**, default **60** |
| **5** | Always mode | **Yes** — `mode: "threshold" \| "always"`; Always ignores score |
| **6** | Rewrite strength | **Light / Medium / Strong** (shared prompt module with manual); **independent** stored intensity on auto row |
| **7** | Tone | **casual / professional / academic / custom** (+ custom blurb); default **casual** |
| **8** | Fail | **Degrade** — toast + insert **original**; never block Accept forever |
| **9** | Min length | **80** chars default; skip pipeline below min |
| **10** | Selection Rework Accept | **Out** — before/after must stay visible |
| **11** | Soft insert-then-replace | **Out of v1** — await rewrite then single insert |
| **12** | Denylist | AI Review, Scanner, Notes/Outline/sheet/psych/map/timeline accepts, chat never Accepted |
| **13** | Per-story override | **No v1** — global only |
| **14** | Undo / logging | One Lexical update = one undo; no score toast v1 |
| **15** | Rewrite engine | **B** — `generateAutoHumanizedText({ text, intensity, tone, customTone?, flaggedPhrases? })`; share intensity temps/prompts with manual |
| **16** | Model resolve | `auto_humanizer` → fallback `humanizer` → default AI → fail degrade |
| **17** | Routes | `/api/auto-humanizer` settings + detect + process; process owns gate server-side |
| **18** | Settings IA | Settings **Writing tools**: keep **Humanizer** card + add **Auto Humanizer** card (persist SoT) |
| **19** | **Editor right-rail sheet** | **One** `SimpleSheet` drawer **`humanize`** labeled **Humanize** hosting **both** Manual + Auto (see § Editor Humanize sheet) |
| **20** | Floating toolbar | Manual **Humanize** button **remains** when manual enabled (quick path); sheet is full controls home |
| **21** | Continuous strength % | **No** — threshold = when; L/M/S = how hard |
| **22** | agentJobs / Stoplight | **Out v1** — request-scoped Accept await only |

---

## Inspiration map (altra → SL)

| altra/humanize | SL Auto Humanizer (locked) |
|----------------|----------------------------|
| Plugin tools in LM Studio chat | Server + client pipeline at editor insert |
| `detect_ai_text` local heuristics | Port five-signal family (pure TS) |
| `aiScoreThreshold` 0–100 step 5 | Threshold slider; default 60 |
| `analyze_and_humanize` | Default **threshold** mode |
| `humanize_text` always | Mode **always** |
| Tone options | casual / professional / academic / custom |
| Final bubble = rewrite only | Editor receives final text only (hard silent) |
| Same chat LLM rewrite | `buildClientForFeature("auto_humanizer")` + fallbacks |
| (no editor rail) | **Editor Humanize sheet** for both tools |

---

## Editor Humanize sheet (locked Axis 19)

**Home:** Editor right tool rail (`EditorToolsPanel`), same pattern as Scanner / History / Beats / Scribble.

| Piece | Lock |
|-------|------|
| **DrawerType** | `"humanize"` added to `DrawerType` + `sidebarButtons` |
| **Icon** | Lean `Sparkles` or `Wand2` (implementer pick from lucide; one icon) |
| **Label** | **Humanize** |
| **Chrome** | **`SimpleSheet`** (right side) — same class as other Editor tool sheets (`SimpleSheet.tsx`) |
| **Visibility** | Always available on Editor (not gated on selected chat), like Tags/Beats/Scanner |
| **Title** | Humanize |
| **Description** | Short: *De-slop selection or filter AI prose on Accept.* |

### Sheet body — two stacked sections (one sheet, both features)

**Section A — Manual Humanizer**

- Enable toggle (writes `humanizerSettings.enabled`)  
- Intensity L/M/S  
- Primary action: **Humanize selection** — enabled when Lexical has non-empty range selection **and** manual enabled; runs existing `/api/humanizer/rewrite` + replace selection (same as floating toolbar; **no italic**)  
- Helper: *Or use Humanize on the floating toolbar when text is selected.*  
- If manual disabled: section shows enable + explanation; action hidden/disabled  

**Section B — Auto Humanizer**

- Enable toggle  
- Mode: Detect above threshold | Always rewrite  
- Threshold slider (step 5; disabled when Always)  
- Intensity L/M/S (auto’s own)  
- Tone + custom blurb when custom  
- Min characters  
- Optional v1.1 polish: **Test detect on selection** → score + signals (read-only)  
- Helper: *When on, accepted AI prose is filtered before it hits the chapter.*  

**Not in sheet v1:** Feature Endpoint URL editing (stays Settings → Feature routing).  
**Not in sheet:** AI Review / Scanner controls.

### Settings vs sheet

| Surface | Role |
|---------|------|
| **Settings → Writing tools** | Canonical cards for both; full copy; Feature Endpoints neighbor |
| **Editor Humanize sheet** | In-flow control of the **same** global rows + **run manual on selection** |
| **Floating toolbar Humanize** | Keeps one-click when selection already up |

Both surfaces bind the **same** React Query keys / APIs — no duplicate persistence.

### MultiView / mobile

- Follow existing `EditorToolsPanel` wiring (including mobile menu that already mirrors `sidebarButtons`).  
- No separate MultiView-only humanize pane v1 unless AddTab already patterns require it — rail sheet is enough.

---

## Detection (port of altra heuristics)

Pure function: `server/services/aiTextDetector.ts` (shareable later if client Test detect needs identical scores — prefer one isomorphic module under `src/` or shared path if needed).

**Score 0–100** (higher = more AI-like):

| Signal | Weight | Detects |
|--------|--------|---------|
| Flagged phrase density | 30% | “delve”, “it’s worth noting”, “in conclusion”, … |
| Sentence burstiness | 25% | Uniform sentence lengths |
| Transition word density | 20% | moreover / furthermore / in addition |
| Paragraph symmetry | 15% | Same-ish paragraph lengths |
| Average sentence length | 10% | Peak AI band ~18–25 words |

**Verdict bands (display):** 0–30 human · 31–60 mixed · 61–80 likely AI · 81–100 almost certainly AI.

**UI disclaimer:** probabilistic; formal/literary false positives possible — threshold is the control.

**v1:** no ML classifier, no external API.

---

## Rewrite engine (locked B)

- `generateAutoHumanizedText({ text, intensity, tone, customTone?, flaggedPhrases? })`  
- altra-style rules: vary length, remove flagged patterns, kill symmetry, preserve meaning, **output only rewritten text**  
- Intensity temps: light 0.5 / medium 0.8 / strong 1.0 (shared with manual via `humanizePrompts.ts`)  
- Client resolve: `auto_humanizer` → `humanizer` → default → degrade  

Manual path keeps `generateHumanizedText(text, intensity)` (no tone) unless a later reopen unifies.

---

## Commit hooks

### v1 (AH4)

```text
User Accepts ```prose-proposal``` (Editor chat)
        │
        ▼
POST /api/auto-humanizer/process { text }
        │
        ├─ disabled / short / below threshold → raw
        ├─ rewrite ok → humanized
        └─ fail → raw + message
        │
        ▼
insertProposedProse(final)
```

**Primary touch:** `ChatInterface` prose accept apply core → await process.

### AH7 (locked as later slice, in scope for promote when AH0–AH6/AH8 done)

- Selection Generate: after stream `fullText`, call process (or shared helper); then italic + insert per existing Generate path.  
- If process skips/fails → existing Generate behavior on raw.

### Explicit never

- User keystrokes / paste  
- Manual Humanize (already the rewrite)  
- Selection Rework Accept  
- Note / outline / psych / sheet / map / timeline accepts  
- AI Review finding actions  
- Chat never Accepted into chapter  

---

## Settings model

```text
autoHumanizerSettings (single global row)
  · id
  · enabled: boolean                 # default false
  · mode: "threshold" | "always"     # default "threshold"
  · aiScoreThreshold: number         # 0–100, step 5, default 60
  · intensity: "light" | "medium" | "strong"  # default "medium"
  · tone: "casual" | "professional" | "academic" | "custom"  # default "casual"
  · customToneDescription: string    # default ""
  · minChars: number                 # default 80
  · createdAt
```

Manual `humanizerSettings` unchanged: `enabled` + `intensity`.

---

## API (locked)

| Route | Behavior |
|-------|----------|
| `GET /api/auto-humanizer/settings` | Read or seed defaults |
| `PUT /api/auto-humanizer/settings/:id` | Update |
| `POST /api/auto-humanizer/detect` | `{ text }` → `{ score, verdict, signals }` (no LLM) |
| `POST /api/auto-humanizer/process` | `{ text }` → gate + optional rewrite; always 200 soft-fail `{ success, text?, skipped?, score?, message? }` |

Manual stays: `GET/PUT /api/humanizer/settings`, `POST /api/humanizer/rewrite`.

---

## UX matrix

| State | Behavior |
|-------|----------|
| Auto off | Accept inserts raw (today) |
| Auto on, Accept | Busy **Humanizing…**; single insert of final |
| Skipped (low score / short) | Insert raw; no toast v1 |
| Failed | Toast + insert original |
| Manual via toolbar or sheet | Replace selection; no italic |
| Manual disabled | Toolbar button hidden; sheet section shows enable |
| Rail sheet closed | Defaults; no auto-open |

---

## Architecture

```text
EditorToolsPanel ── DrawerType "humanize" ── SimpleSheet "Humanize"
        │                         │
        │              ┌──────────┴──────────┐
        │              │ Manual section      │ Auto section
        │              │ humanizerSettings   │ autoHumanizerSettings
        │              │ rewrite selection   │ toggles / slider / tone
        │              └──────────┬──────────┘
Settings Writing tools ───────────┴── same API/query keys
        │
Accept prose ──► POST /auto-humanizer/process ──► insertProposedProse
Floating toolbar Humanize ──► POST /humanizer/rewrite ──► replace selection
```

---

## Out of scope (unless reopened)

- Chat-message auto rewrite without Accept  
- Streaming token-by-token humanize  
- Per-story / per-chapter toggles  
- ML/neural detectors  
- Soft flash-then-replace / preview modal v1  
- AI Review desk integration  
- Continuous strength % slider  
- agentJobs-backed auto humanize  
- Two separate rail icons (one sheet only)  
- Feature endpoint editor inside the sheet  

---

## Slices (AH0–AH8)

| ID | Slice | Done when |
|----|--------|-----------|
| **AH0** | Shared `humanizePrompts` + `autoHumanizerSettings` types + migration seed | Manual Humanizer still green |
| **AH1** | `aiTextDetector` + unit tests (AI-ish vs human-ish fixtures) | Scores in expected bands |
| **AH2** | Routes settings/detect/process; FeatureKey `auto_humanizer` | process gates correctly |
| **AH3** | Settings cards (Auto + cross-link on Manual) + Feature Endpoints label | Persist reload |
| **AH4** | Wire Accept prose apply core through `/process` + busy UX | Hard silent on high-score Accept |
| **AH5** | Fail degrade + minChars + Always mode dogfood | Offline model → original + toast |
| **AH6** | DECISIONS + Guide blurb; skill refs shipped notes | Docs honest |
| **AH7** | Selection Generate hook + italic keep | Optional follow after AH4–AH5 |
| **AH8** | **Editor Humanize sheet** — `DrawerType "humanize"`, SimpleSheet, both sections, Humanize selection action, mobile menu entry | Rail opens sheet; toggles sync Settings; selection rewrite works |

**Build order:** AH0 → AH1 → AH2 → AH3 → **AH8** (rail home) → AH4 → AH5 → AH6 → AH7.

**Do not build until:** user **promote** / “building Auto Humanizer”.

---

## Files likely to change

| Area | Paths |
|------|--------|
| Schema | `server/db/schema.ts`, migration `00xx_auto_humanizer.sql` |
| Detector | `server/services/aiTextDetector.ts` (+ tests) |
| Prompts | `server/services/humanizePrompts.ts` |
| Services | `server/services/autoHumanizerService.ts`; touch `humanizerService.ts` |
| Routes | `server/routes/autoHumanizer.ts`, `server/index.ts` |
| Types | `src/types/autoHumanizerSettings.ts`, `src/types/aiSettings.ts` |
| API | `src/services/api/autoHumanizerClient.ts`, `client.ts` |
| Settings | `src/features/auto-humanizer/…`, `HumanizerSettingsCard` cross-link, `SettingsPage.tsx` |
| **Editor rail** | `EditorToolsPanel.tsx` (`DrawerType`, button, SimpleSheet body), new `EditorHumanizeSheet.tsx` (or feature folder component) |
| Accept | `ChatInterface.tsx` prose accept core |
| Toolbar | existing Humanize button unchanged behaviorally |
| AH7 | `FloatingTextFormatToolbarPlugin/index.tsx` |
| Docs | this file; `DECISIONS.md` on ship |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Double latency/cost on Accept | Default OFF; local `auto_humanizer`; threshold skips |
| False positive on literary prose | User threshold; Always optional |
| Two homes confuse users | One sheet name **Humanize**; sections clearly Manual vs Auto |
| Sheet without selection | Disable Humanize selection CTA with hint |
| Settings/sheet desync | Shared query keys only |
| Fail blocks writing | Degrade open |
| Rework before/after ruined | Never hook Rework Accept |

---

## Success criteria (after promote + ship)

1. Auto **off** → Accept behavior unchanged.  
2. Auto **on**, threshold 60, high-AI Accept → chapter gets rewritten text only (no raw flash).  
3. Low-score / short → raw; no rewrite call.  
4. Model down → original + toast.  
5. Manual Humanize works from **toolbar and sheet**.  
6. Editor rail **Humanize** opens SimpleSheet with **both** sections; settings match Settings page after toggle.  
7. AI Review desk still has no rewrite.  
8. Feature Endpoints lists **Auto Humanizer**.

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-08-14 | Scoped; grill open |
| **1.0** | **2026-08-14** | **Locked** Lean package + Editor Humanize sheet (both Manual + Auto); AH0–AH8 |

**Companions:**  
- Shipped Humanizer: skill `references/humanizer.md` · `DECISIONS.md`  
- LM plugin: `~/.lmstudio/extensions/plugins/altra/humanize`  
- Editor chrome: `EditorToolsPanel.tsx`, `SimpleSheet.tsx`  
- AI Review (no rewrite): `docs/AI_Review_Design.md`

---

*End of Auto Humanizer design v1.0 — locked; promote before build.*
