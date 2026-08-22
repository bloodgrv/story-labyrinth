# Local System Inject — Design (locked)

> **Status:** ✅ **Shipped in full 2026-08-21** — LI0–LI5 all built same day as lock, user-promoted immediately after grill.  
> **Talk list:** T12 (first concrete slice of broader “system prompts” theme).

**Goal:** Give the user a **global, local-model-only** house-rules block (the kind they used to put in LM Studio’s GUI system prompt) that actually rides on SL’s API path — with **on/off**, **named presets**, **Settings as the only editor**, and a **compact chat-rail control** that mutates the same global SoT.

---

## 1. Job

| | |
|--|--|
| **Problem** | SL → LM Studio (and other OpenAI-compatible local servers) sends its own `messages`. **LM Studio GUI / preset system prompts do not apply** on that path. Users need a durable place for style/NSFW/house rules that only affects **local** generations. |
| **Job** | Optional text **prepended** to the assembled **system** content whenever the **call’s model provider is `local`**, the master switch is **On**, and the active body is non-empty. |
| **Not the job** | Replacing SL framing / fence law (`buildSystemPrompt`, `{{codex_context}}`). Per-story or per-chat inject (v1). Cloud inject. Syncing LM Studio presets. Editing desk Prompt rows as the primary path. |

---

## 2. Scope & SoT

| Axis | Lock |
|------|------|
| **Scope** | **Global** instance — `aiSettings` (same home as `localApiUrl`, `preferredMode`, context meter local fields). **Not** story. **Not** `aiChats` row. |
| **One SoT** | Single active config. Settings and every chat rail read/write **the same** fields. Change on one surface → all surfaces update. |
| **Provider gate** | Apply only when effective generation provider is **`local`**. Cloud / Grok / OpenRouter / etc. never get this block. |
| **Default** | Master switch **Off**. Empty body = no-op even if On. |

---

## 3. Data model (lean)

Store on `aiSettings` (JSON columns and/or text fields — implementer choice; prefer clear columns or one JSON blob `localSystemInject`):

```ts
type LocalInjectPreset = {
  id: string;       // uuid
  name: string;     // user-facing, unique-enough (trim; reject empty)
  body: string;     // full inject text
  updatedAt: number; // epoch ms
};

// aiSettings fields (names illustrative)
localInjectEnabled: boolean;              // default false
localInjectBody: string;                  // active body (what injects when On)
localInjectActivePresetId: string | null; // which library entry is “selected”; null = none / custom
localInjectPresets: LocalInjectPreset[];  // library
```

**Active body is authoritative for injection.** Preset id is UX bookkeeping (“which library row is selected”).

### Dirty / preset rules (locked Lean A)

| Action | Behavior |
|--------|----------|
| **Apply preset** (Settings or rail dropdown) | Copy preset `body` → `localInjectBody`; set `localInjectActivePresetId`. |
| **Edit body in Settings** | Writes `localInjectBody` only. If body ≠ selected preset body → treat as **modified** (clear `activePresetId` **or** show “modified” chip; implementer lean: **clear activePresetId** on first differing save, or keep id + `dirty` flag — **prefer keep id + dirty UI** so Update preset is obvious). **Minimum bar:** edits never auto-write the library. |
| **Update preset** | Explicit button: write current body into the selected preset’s `body` / `updatedAt`. Disabled if no active preset. |
| **Save as new preset** | Snapshot current body → new library row → select it. |
| **Rename / delete preset** | Settings only. Delete selected → clear active id; body stays until user changes it. |
| **None** in dropdown | Clears `activePresetId`. **Does not** wipe body (Settings still shows last body). Inject still uses body when On. Optional later: “None” also means “no body” — **not v1**. |

---

## 4. Surfaces

### 4.1 Settings → **Local** tab (only full editor)

Section: **Local system inject**

1. Master **Enable for local models** toggle (`localInjectEnabled`).
2. **Preset** dropdown (library) + actions: **Save as…**, **Update preset**, **Rename**, **Delete**.
3. **Body** textarea (large) — house rules / gaslight block / em-dash policy / etc.
4. Help copy (short):
   - Global for the whole app.
   - Only when generating with a **local** model.
   - Prepended ahead of Story Labyrinth’s normal system context; does **not** replace product framing or proposal fences.
   - Chat rails only toggle + pick preset; edit text here.

Mount near existing Local controls (`LocalModelsCard` / context window / max output tokens) on `SettingsPage` Local tab.

### 4.2 Chat right rail (every desk chat) — **controls only**

| Control | Notes |
|---------|--------|
| **On/Off toggle** | Same `localInjectEnabled`. |
| **Preset dropdown** | Apply preset / None. **No** textarea. **No** Save as / Update / Rename / Delete. |

- Visible on **all chat hosts** that use local generation (Editor, WB, Outline, Brainstorm, Notes, Research) — same global state, not per-chat.
- Empty library: dropdown empty/disabled; hint “Add presets in Settings → Local”.
- Toggle **Off** still allows preset switching (Lean A) so user can stage which preset is active before enabling.
- Optional tiny “Settings” link → deep-link `Settings?section=local` (if section deep-link already exists for Logs, reuse pattern).

**Not on rail:** body editor, preset CRUD.

---

## 5. Apply path (load-bearing)

**When to inject**

```
enabled && provider === "local" && body.trim().length > 0
```

**How**

- Prepend to the **first system message** content:

  ```
  ${body.trim()}

  ---

  ${existingSystemContent}
  ```

  (Separator optional; keep a clear blank line minimum.)

- If the outbound `messages` array has **no** system message, **unshift** `{ role: "system", content: body }`.

**Where (prefer one choke point)**

| Preference | Path |
|------------|------|
| **Best** | Shared client generate path that all desk chats use (`generateWithPrompt` / AIService before provider `generate`), gated on selected model’s provider — **and** mirror for any server-side local calls that build their own messages if those should honor inject (see coverage). |
| **Acceptable** | `LocalAIProvider.generate` only — guarantees every HTTP local completion gets it; server OpenAI client path for local feature jobs must either call the same helper or duplicate the prepend. |

**Coverage v1 (locked minimum)**

| Path | v1 |
|------|-----|
| Desk chat generation (all six chat types) | **Must** |
| Selection one-shots / prompt library runs via same AIService local | **Should** if they already go through LocalAIProvider |
| Server feature jobs (AI Review, scanner, humanizer, etc.) using `aiClientFactory` local | **Should** if low-cost shared helper; **may defer** to v1.1 if chat-only is promoted first — document in ship notes |

**Must not** double-prepend (idempotent: inject once per request).

**Cloud:** never.

---

## 6. Interaction with existing “Edit system prompt”

| Mechanism | Role after this feature |
|-----------|-------------------------|
| **Local system inject** | User house rules for **local only**; global; presets. |
| **⋯ Edit system prompt** (per `promptType` DB row) | Still exists for power users / template tokens (`{{codex_context}}`). Unchanged by this design. |
| **Code framing** (`chatContextService.buildSystemPrompt`) | Product law / fences — not user-edited here. |

Docs/UI should not tell users to delete `{{codex_context}}`. Inject is **additive**.

---

## 7. UX details

- Token meter: include inject body in system slice estimate when enabled + local (same assembly the send path uses).
- No streaming of inject into chat transcript (system-only; not a user/assistant message).
- Owner-only edit if Settings AI keys are owner-gated today — match existing AI settings auth (likely owner for settings write; editors generating with local still **consume** global inject).
- Import/export of full AI settings: include inject fields if settings export exists; else out of scope.

---

## 7b. Guide (required — not optional blurb)

Users will not discover this from Settings alone. **Ship includes a real Guide topic**, same class as Notes / AI Review / MCP section in Settings-nav — not a one-line Settings tooltip only.

### Placement

| Piece | Lock |
|-------|------|
| **Primary** | New Guide MDX topic: `src/features/guide/content/local-system-inject.mdx` (title **Local System Inject** or **Local house rules** — implementer: prefer **Local System Inject** to match product name). |
| **Registration** | `GuideTabs.tsx` tab + **Guide search index** (whatever mechanism other topics use — follow Notes/AI Review). Put tab near **Settings & Navigation** / **Prompt Guide** (after Settings-nav or after Prompts). |
| **Cross-links** | (1) `settings-nav.mdx` — Local row: mention inject + link/pointer to this topic. (2) `prompts.mdx` — short **disambiguation**: desk “Edit system prompt” ≠ Local System Inject; LM Studio GUI system prompt does not apply to SL API calls. |

### Required Guide outline (user-facing)

Write in the same voice as other Guide pages (practical paths, callouts, no internal slice IDs).

1. **What it is** — Global house-rules text prepended only when you generate with a **local** model (LM Studio, etc.). Fixes “I set a system prompt in LM Studio but SL ignored it.”
2. **What it is not** — Not cloud. Not per-story/chat. Does not replace Story Labyrinth’s own framing or proposal fences. Not the same as **⋯ Edit system prompt** on a desk (that edits the shared prompt *template* for that chat type for every provider).
3. **Where to edit (Settings)** — Path: **Settings → Local → Local system inject**. Toggle On/Off (default Off). Body textarea. Presets: Save as, Update, Rename, Delete. One place for the whole app.
4. **Where to control in a chat** — Each desk chat’s **right rail**: On/Off + **preset dropdown only**. No typing there. Changing either updates **every** chat and Settings (global).
5. **How to use (recipe)**
   - Open Settings → Local.
   - Paste house rules (style, content policy, “no em dashes,” etc.).
   - **Save as** a named preset (e.g. “Erotica local”).
   - Turn **Enable** On.
   - In a chat set to **Local** model, confirm rail toggle On + preset selected.
   - Send a turn; house rules apply on that local call only.
6. **Presets** — Apply loads body. Editing body in Settings does not silently overwrite the library until **Update preset**. Switch presets from the rail without opening Settings.
7. **Tips**
   - Keep product context: do **not** delete `{{codex_context}}` from desk system prompts as a substitute.
   - Long injects cost context window (see Context meter on local chats).
   - Cloud chats ignore inject even if toggle is On.
8. **Troubleshooting table** (minimum rows)

| Symptom | Check |
|---------|--------|
| LM Studio preset ignored | Expected — use Local System Inject in SL instead |
| Inject On but no effect | Chat model must be **Local**; body non-empty; toggle On |
| Cloud still “clean” | By design — inject is local-only |
| Can’t edit text on rail | By design — edit in Settings → Local |
| Changed preset in one chat, others changed | By design — global SoT |

### Acceptance for Guide

- Topic opens from Guide UI and is findable via Guide search for phrases like “local system”, “LM Studio system prompt”, “house rules”, “local inject”.
- settings-nav + prompts cross-links present.
- No “not implemented” / internal LI* jargon in user Guide text.

---

## 8. Non-goals (v1)

- Per-story or per-chat override  
- Per-model-id inject  
- Cloud “house rules” twin  
- Auto-import LM Studio presets  
- Replacing or bulk-rewriting desk system prompt seeds  
- Rail body editor or rail preset CRUD  

---

## 9. Slices (implementation order)

| ID | Slice |
|----|--------|
| **LI0** | Schema/types + API read/write for inject fields on `aiSettings` (defaults: enabled false, body `""`, presets `[]`, active null). |
| **LI1** | Settings → Local: full section (toggle, textarea, preset CRUD + dirty/Update/Save as). |
| **LI2** | Apply path: prepend on local generate (desk chats minimum; shared helper). |
| **LI3** | Chat right rail: toggle + preset dropdown only; all six desks; same mutations as Settings. |
| **LI4** | Context meter awareness + empty-state/help copy + optional Settings deep-link. |
| **LI5** | **Guide topic** `local-system-inject.mdx` + GuideTabs + search index + settings-nav/prompts cross-links; DECISIONS ship note; talk list/backlog → shipped. |

**Promote gate:** user says build / promote. Do not start LI* until then.

---

## 10. Acceptance (promote checklist)

1. Off → local chat unchanged vs pre-feature.  
2. On + body → local chat system payload starts with body; cloud chat never includes it.  
3. Switch preset on Editor rail → WB rail and Settings show same preset/body.  
4. Edit body only in Settings; rail has no textarea.  
5. Save as / Update / Delete only in Settings; rail dropdown lists names only.  
6. Toggle on rail flips global enabled everywhere.  
7. Empty body + On → no extra prepend.  
8. **Guide topic live** (outline §7b), searchable, with settings-nav + prompts pointers.  
9. Build/typecheck clean.

---

## 11. Document history

| Date | Note |
|------|------|
| 2026-08-21 | Locked from T12 grill. Lean package: global SoT; local-only; Settings editor + preset library; rail = toggle + dropdown; default Off; dirty = no auto-write library; dropdown usable while Off. |
| 2026-08-21 | **Guide required:** full Guide MDX topic + registration + cross-links (not Settings-only help). LI5 expanded. |

---

*Canonical: `docs/Local_System_Inject_Design.md` · talk list T12 · backlog P3 until promoted.*
