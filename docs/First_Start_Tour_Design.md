# First-Start Tour (T11) — Design (locked)

> **Status:** ✅ **Shipped in full 2026-08-21** — OT0–OT8 all built same day as lock, user-promoted immediately after grill.  
> **Talk list:** **T11**

**Goal:** A guided **first-run tour** so a new owner can (1) find and set up a **first AI provider**, (2) understand **basic chat controls in Brainstorm**, and (3) know **where Help lives (Guide)** — including how to **replay the tour** later.

---

## 1. Job

| | |
|--|--|
| **Problem** | Cold open is thin: first-account register works; empty Stories is one line + “Start in Brainstorm”; AI/providers and chat chrome are discoverable only by hunting Settings/Guide. |
| **Job** | Product **tour** (spotlight + step card) that walks the spine above and ends with a durable **Replay** entry on Guide. |
| **Not the job** | T8 look/feel polish. Rewriting Brainstorm/WB Guided playbooks. Full multi-desk empty-state rewrite. SaaS multi-tenant onboarding. Hard-gating write access on provider test. Local System Inject (T12). Mobile-specific tour. |

**Done means:** Owner auto-sees the tour once; can Skip or Finish; Skip/Finish copy points at Guide Replay; Replay from Guide top always works; spine covers provider + Brainstorm basics + Guide without requiring a successful model call.

---

## 2. Locked decisions (grill)

| # | Axis | Lock | Date |
|---|------|------|------|
| **1** | Job | Tour: provider setup location → Brainstorm chat basics → Guide/help (+ Replay). ≠ T8, ≠ playbook rewrite. | 2026-08-21 |
| **2** | Who & when | Auto **once** until Skip/Finish. **Replay** at **top of Guide** page. | 2026-08-21 |
| **2b** | Skip copy | Skip (and Finish may echo): tour can be run anytime from Guide top. | 2026-08-21 |
| **3** | Spine | Welcome (+ create if empty) → provider → Brainstorm controls → Guide/Replay/Basics → Finish. | 2026-08-21 |
| **4** | UI | Spotlight + step card (Next / Back / Skip). Progress dots. | 2026-08-21 |
| **5** | Persistence | **Per-user server flag**; Replay does **not** re-arm auto-start. | 2026-08-21 |
| **6** | Provider step | Point + copy; Cloud *or* Local minimum; **Next free** (no save/test gate). | 2026-08-21 |
| **7** | Brainstorm | Cloud\|Local → model → composer/send → Context & memory chip; Guided Setup **mention only**. | 2026-08-21 |
| **8** | Story | Create only if empty; **test/throwaway story is fine** (copy); else current/last story → Brainstorm. | 2026-08-21 |
| **9** | Auto audience | **Owner only** auto-start; Guide Replay for roles that can open Guide. | 2026-08-21 |
| **10** | Navigation | Auto-navigate to target tool/route; tolerant missing anchors; **no** chrome lock-in. | 2026-08-21 |
| **11** | Non-goals + thin | Non-goals §8; thin: **progress dots** only (no required `?tour=` deep link v1). | 2026-08-21 |

---

## 3. Live baseline (audit 2026-08-21)

| Layer | Today |
|-------|--------|
| Auth | `AuthGate` / `LoginPage`: first user = Create Account; then Log In. No tour. |
| Empty workspace | No story → tool **Stories**; copy + **Start in Brainstorm** via `CreateStoryDialog` → `setCurrentTool("brainstorm")`. |
| AI | Settings only; no first-run provider nudge. |
| Guide | `GuideTabs` + topics (Basics, Settings-nav, Brainstorm, …); opt-in; no Replay control. |
| In-feature guided | Brainstorm/WB playbooks **shipped** — out of T11 scope. |

---

## 4. Persistence

Per logged-in **user** (server SoT), not localStorage-only, not install-global.

```ts
// users table (illustrative name)
onboardingTourCompleted: boolean; // default false
```

| Event | Behavior |
|-------|----------|
| **Auto-start** | `role === "owner"` && `onboardingTourCompleted === false` && authenticated shell ready |
| **Skip** | Set `onboardingTourCompleted = true`; toast/copy: replay anytime from **top of Guide** |
| **Finish** | Set `onboardingTourCompleted = true`; optional echo of Replay location |
| **Replay** | Start tour immediately; **do not** set completed back to false (auto never re-fires from Replay) |

API: extend existing user/me or small dedicated PATCH (implementer: match auth patterns; owner can update self; do not expose arbitrary user writes to editors).

---

## 5. Tour UI

### 5.1 Chrome

- Dim overlay + **spotlight** hole on target (`data-tour` anchors preferred).
- Floating **step card**: title, body, **progress dots**, **Back** / **Next** / **Skip**.
- Finish step: primary **Done** (same completion as Finish).
- z-index above workspace chrome; below critical system modals if conflict (implementer: tour under confirm dialogs).

### 5.2 Driver rules (Axis 10)

1. Entering a step **navigates** to the required tool/route (Settings AI section, Brainstorm, Guide).
2. Wait briefly for anchor; if missing → card explains + allow **Next** or **Skip** (no hard stuck state).
3. User may click away; tour stays mounted until Skip/Finish/Done; Next re-seeks anchor.
4. **Do not** disable sidebar/tool switching for the whole app.

### 5.3 Library

Thin in-house driver **or** small dependency — implementer choice. Prefer minimal surface; no full “product analytics tour” SaaS.

---

## 6. Step spine (detail)

### Step 0 — Welcome

- Brand-short: Story Labyrinth first-run.
- What you’ll do: provider → Brainstorm controls → Guide.
- If **no stories**: CTA opens existing **CreateStoryDialog**; copy that a **test story is fine** for setup. On create success → continue (prefer later Brainstorm landing).
- If stories exist → Next only.

### Step 1 — First provider

- Navigate to **Settings →** Providers / AI keys surface (existing Settings IA).
- Spotlight primary provider area (Cloud key **or** Local URL + defaults — whichever anchors exist; one composite highlight OK).
- Copy: need at least one path to generate; Cloud **or** Local is enough; details live in Settings & Guide.
- **Next** always enabled (no mandatory save/test).

### Step 2 — Brainstorm chat basics (micro-sequence)

Navigate to **Brainstorm** for current/last story (after ensure story from Step 0).

Substeps (same step group; dots may count group as one or N — prefer **one spine index** with internal Next through micros):

| Micro | Target | Copy intent |
|-------|--------|-------------|
| **2a** | Cloud \| Local mode control | Where generations run |
| **2b** | Model picker | Pick a model for this mode |
| **2c** | Composer / Send | How you talk to the model |
| **2d** | Context & memory (collapsed chip / rail) | Optional working context; **off by default** |

**Mention only (no deep spotlight required):** Guided setup / playbook depth is available when they want structured brainstorming — not the job of this tour.

### Step 3 — Guide + Replay home

- Navigate to **Guide** (workspace Guide tool and/or Settings Guide tab — prefer the surface that owns `GuideTabs`; Replay must appear on **that** top chrome).
- Spotlight **Replay tour** control (new) at **top of Guide** (above or beside search/tabs).
- Point at **Basics** topic (select Basics tab if easy).
- Copy: Help lives here; replay tour anytime from this button.

### Step 4 — Finish

- Short recap; Done → `onboardingTourCompleted = true`.
- Optional: “Open Basics” already satisfied if Step 3 selected it.

---

## 7. Guide Replay control

| Piece | Lock |
|-------|------|
| **Placement** | **Top of Guide** UI (`GuideTabs` shared shell — standalone `/guide` and Settings Guide tab both get it). |
| **Label** | **Replay tour** (or **Take the tour** if never completed — same action). |
| **Action** | Starts tour at Welcome (or Step 1 if implementer prefers skip Welcome on replay — **prefer full spine from Welcome**). |
| **Visibility** | Any role that can open Guide. |

Skip toast must name this control explicitly.

---

## 8. Non-goals (v1)

- T8 app-wide polish / density
- Tour of Editor, Lorebook, Outline, Research, Notes, Maps, Timeline, Scanner, AI Review, …
- Mandatory first successful chat completion
- Hard provider save/test gate
- Interactive coach-mark library after tour ends
- Mobile-only layout tour
- Multi-tenant invites / team onboarding
- Folding **T12 Local System Inject** into this tour
- Rewriting Guided playbook content
- `?tour=1` support deep link (optional later)

---

## 9. Slices (implementation order)

| ID | Slice |
|----|--------|
| **OT0** | Schema + API: `users.onboardingTourCompleted` (default false); read on session/me; PATCH self |
| **OT1** | Tour shell: overlay, card, dots, Next/Back/Skip/Finish, completion + Skip toast |
| **OT2** | Auto-start gate: owner && !completed; mount once shell ready |
| **OT3** | Welcome + conditional create story (reuse `CreateStoryDialog`; test-story copy) |
| **OT4** | Provider step: navigate Settings AI + spotlight anchors |
| **OT5** | Brainstorm micro-steps + `data-tour` on chat chrome |
| **OT6** | Guide step + **Replay tour** button on Guide top; Basics pointer |
| **OT7** | Missing-anchor fallbacks + smoke paths (empty vs existing story) |
| **OT8** | Ship hygiene: DECISIONS note; talk list/backlog → shipped; Basics one-liner if needed |

**Build order:** OT0 → OT1 → OT2 → OT3 → OT4 → OT5 → OT6 → OT7 → OT8.

**Promote gate:** user says build / promote / implement. Do not start OT* until then.

---

## 10. Acceptance (promote checklist)

1. Fresh owner (`completed=false`) gets auto tour after login; editor does not auto.
2. Skip sets completed; toast mentions Guide Replay; no auto re-show.
3. Finish sets completed; no auto re-show.
4. Guide top **Replay tour** runs full spine; completed stays true.
5. Empty workspace: create path works; copy allows test story; reaches Brainstorm.
6. Existing stories: no forced create; Brainstorm on current/last.
7. Provider step does not require save/test to Next.
8. Brainstorm micros cover mode, model, send, Context chip.
9. Missing anchor does not trap the user.
10. Build/typecheck clean.

---

## 11. Pitfalls

- Do **not** collide slice IDs with Lore Sheet **FS0–FS8** — this feature uses **OT0–OT8**.
- Do **not** put Replay only on standalone `/guide` if Settings Guide tab is the common entry — shared `GuideTabs` chrome.
- Do **not** re-arm auto-start when replaying.
- Do **not** hard-lock navigation (Axis 10).
- Do **not** expand into T8 or full empty-state redesign under this ticket.
- Do **not** require a live LLM round-trip to complete the tour.
- Prefer stable `data-tour="…"` hooks on chat/Settings controls over brittle text selectors.

---

## 12. Document history

| Date | Note |
|------|------|
| 2026-08-21 | Locked from T11 grill (tour-forward job). Axes 1–11. Slices OT0–OT8. |

---

*Canonical: `docs/First_Start_Tour_Design.md` · talk list T11 · backlog P3 until promoted.*
