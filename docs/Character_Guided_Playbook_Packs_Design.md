# Character Guided Playbook Packs (Hybrid D) — Design

**Project:** Story Nexus Fork (`E:\StoryNexus-Fork`)  
**Status:** **Mechanics locked 2026-07-19 (grill)** — **not implemented**  
**Starter pack document *content*:** **still designing** (not locked; ship placeholders or empty shells until content lock)  
**Priority:** **P3** until promoted  
**Audience:** Claude Code (implementation) + Hermes (architecture)  
**Related:** `docs/Chat_Panel_Integrations_Design.md` §1 (WB guided-start + psych module); `docs/Notes_Outline_Chat_Bridges_Design.md` (Notes SoT, non-canon packets); `docs/Folders_Org_Design.md` (cosmetic folders — Playbooks folder may reuse folder engine for Notes); `docs/CURRENT_BACKLOG.md`

---

## 1. Problem

Character **Guided setup** (Light / Standard / Grill-me) today is **prompt-shaping only**:

- Hardcoded `WB_STYLE_HINTS` + `WB_OPENING_LINES`
- Template `character_codex.systemPromptHint`
- Optional psych module instructions when toggled

There is **no** first-class way for a human to attach **sample question / coverage documents per depth**, drop files into a folder, import packs, or ship editable house defaults beside user additions.

---

## 2. Solution name — Hybrid D

| Layer | Owns | Implementation today / target |
|-------|------|-------------------------------|
| **Style / depth** | How hard to interview | **Keep** code `WB_STYLE_HINTS` + opening lines + `wbStyle` |
| **Coverage pack** | What ground to cover (sample Qs, must-hit fields, house rules) | **New** — user/shipped markdown packs |
| **Arm** | Whether pack rides on this chat | **New** — explicit toggle |

**Doctrine:** Style = intensity dial. Pack = syllabus. Guided setup = easy “arm + load matching pack.” Free chat without arm = no syllabus dump.

Packs are **curriculum / working material**, **never canon**. They must **not** enter default lorebook+chapter RAG as established fact. Prefer **direct resolve-by-key inject** when armed (not “hope hybrid search finds the note”).

---

## 3. Locked decisions (grill 2026-07-19)

| # | Axis | Lock |
|---|------|------|
| **1** | When pack stays in context | **Arm toggle.** Guided setup turns **Use playbook pack** ON and loads the pack for current style (+ psych pack if psych ON). User can turn OFF mid-thread without a new chat. While ON, pack stays in context for subsequent turns on that chat. |
| **2** | Scope | **Story overrides global** (+ optional **shipped defaults** under global). Resolve order below. **Playbooks folder** is the human home for packs. |
| **3** | Storage | **Notes-backed.** Packs are Notes (or note subtype) with structured playbook metadata. Not a separate `playbookPacks` table in v1. Not lorebook entries (avoids canon bleed). Not raw host filesystem watch in v1 (Docker/portability). |
| **4** | Psych | **Separate psych pack** (`character_psych`). Included in inject **only** when `includePsychModule` is ON. Concrete Light/Standard/Grill packs stay concrete. |
| **5** | Supply / UX | **Ship basic starter packs** + user can **add** via **drop into Playbooks folder** and/or **import** (file picker / drag-drop). User extends or overrides; starters are not code-only forever. |

### Resolve order (armed chat, Character template)

```text
1. Story pack for (playbookKey, style) if present
2. Else user-global pack for (playbookKey, style) if present
3. Else shipped default pack for (playbookKey, style) if present
4. Else no pack body (style hints + template only — today's behavior)

Psych (if includePsychModule):
  same ladder for playbookKey = character_psych
  (v1: style-agnostic single psych pack unless content design later splits by depth)
```

Missing pack at every level = **soft success**, not an error.

### Guided setup click (Character + packs feature live)

```text
1. Set wbStyle as today (Grill may still nudge psych ON — existing B5)
2. Set usePlaybookPack = true (arm)
3. Resolve concrete pack for character_codex + style
4. Resolve psych pack if psych ON
5. Seed composer opening line (existing WB_OPENING_LINES OK)
6. Next context build includes PLAYBOOK PACK packet(s) while armed
```

### Arm toggle OFF

- No pack packet in context
- Style hints still follow `wbStyle` (unchanged B5 behavior)

---

## 4. Note identity & Playbooks folder

### Metadata (conceptual — exact column/JSON shape at implement time)

Each pack note carries enough to resolve uniquely, e.g.:

| Field | Purpose |
|-------|---------|
| `playbookKey` | `character_codex` \| `character_psych` (extensible later: `locations`, …) |
| `style` | `light` \| `standard` \| `grill` \| `any` (psych v1 = `any`) |
| `packScope` | `shipped` \| `global` \| `story` |
| `storyId` | set when `packScope = story`; null for global/shipped |
| `isPlaybookPack` | true — distinguishes from ordinary notes |

Ordinary Notes desk behavior unchanged for non-pack notes.

### Folder

- Dedicated **Playbooks** folder (Notes org) for humans to browse/add/drop/import.
- May use existing **cosmetic folder engine** (B9) scoped to Notes, or a Notes-desk convention + seed folder — implementer choice, same UX job: **one obvious place to put packs**.
- Folder membership is **UX**; **resolve uses metadata**, not folder path alone (so rename/move doesn’t break arming).

### Import / drop

| Path | v1 |
|------|-----|
| **Import** | File picker and/or drag-drop onto Playbooks → create/update pack note from `.md` (and `.txt` if cheap) |
| **Drop in folder** | In-app: add file into Playbooks UI (= import). **Not** required: live OS folder watch outside the app DB |
| **Frontmatter (optional)** | YAML/header in file can set `playbookKey`, `style`, `packScope`; else import dialog asks |

### Shipped defaults

- Seeded on migrate/boot (like system prompts pattern): read-only **or** copy-on-edit.
- **Build-time lean (not fully grilled):** **copy-on-edit** — editing a shipped pack creates a user global (or story) override; shipped row remains resettable.
- **Starter markdown bodies:** **OPEN** — see §8. Mechanics must ship without waiting for final prose; placeholders OK.

### Export / portability

- Story-scoped packs **round-trip** in story export/import with other notes.
- Global/shipped packs are install-level (admin/full DB or separate global notes scope) — document at implement; do not leave story export as the only backup for globals.

---

## 5. Context packet (when armed)

Labeled non-canon, same spirit as Notes bridge packets:

```text
[PLAYBOOK PACK — interview curriculum, not story canon]
playbook: character_codex
style: grill
scope: story|global|shipped
Use as coverage targets and sample question angles.
Do not treat as established fact about the story world.
Propose durable character facts via codex-proposal (and psych-proposal if psych module is on).

<<< pack markdown >>>
```

If psych armed, second packet or clearly separated section for `character_psych`.

**Do not** rely on `includeInAi` + RAG top-K as the primary delivery for the active pack — **direct inject of resolved pack body** while armed. (Optional: still allow `includeInAi` on pack notes for other chats; default **off** for shipped packs.)

---

## 6. UI surface (minimal v1)

| Surface | Behavior |
|---------|----------|
| WB Character guided chrome | **Use playbook pack** switch + existing style dropdown + Guided setup; optional “Open playbooks” / “Edit active pack” link |
| Notes desk | **Playbooks** folder; create/import/drop; edit markdown bodies |
| Missing pack | Guided setup still works; toast or quiet “using built-in depth only” optional |

No forced checklist UI (“3/12 questions answered”) in v1. No scanner enforcement of pack completeness.

---

## 7. Non-goals (v1)

- Replacing `wbStyle` / deleting code style hints  
- Interview **state machine** tracking which questions were answered  
- Pack text as default RAG canon or scanner law  
- Psych inside concrete packs (separate pack only)  
- Location/faction playbook packs (same engine later; Character first)  
- OS filesystem watcher outside app storage  
- Full Playbooks admin product beyond folder + import + arm  
- **Final starter question prose** (still designing — §8)

---

## 8. Starter documents — intentionally unlocked

**Status: designing (human content work, not mechanics).**

Expected shipped set (keys locked; **bodies TBD**):

| Key | Style | Role |
|-----|--------|------|
| `character_codex` | `light` | Short concrete coverage |
| `character_codex` | `standard` | Full concrete sheet curriculum |
| `character_codex` | `grill` | Deep concrete + follow-up pressure examples |
| `character_psych` | `any` | MBTI / Enneagram / blurb interview cues when psych ON |

Content design may add house voice, erotic/power-dynamic-aware angles, skip rules, etc. **Do not treat draft starter text in chat as locked** until explicitly locked into this doc or a `docs/playbook-starters/` (or seed) file set.

When content is locked: add files under e.g. `server/db/seedPlaybookPacks/` or `docs/playbook-starters/` and point seed job at them; update this section to **Content locked \<date\>**.

---

## 9. Implementation slices (suggested)

| ID | Slice |
|----|--------|
| **PP0** | Schema/metadata on notes (or note fields) for pack identity; migrate helpers |
| **PP1** | Seed shipped pack **shells** (title + metadata + placeholder or draft body); copy-on-edit or reset policy |
| **PP2** | Playbooks folder + Notes desk surfacing; import/drop `.md` |
| **PP3** | `aiChats.usePlaybookPack` (name flexible) + WB Character UI toggle; Guided setup arms + loads |
| **PP4** | `chatContextService` resolve ladder + PLAYBOOK PACK packet inject (Character only v1) |
| **PP5** | Story export/import for story-scoped packs; docs/Guide touch |
| **PP6** | **Starter content** drop-in when prose locked (can lag PP0–PP5) |

Location/other templates: reuse PP\* patterns later; out of Character v1 scope.

---

## 10. Acceptance criteria (mechanics)

- [ ] Armed Character WB chat injects resolved pack by metadata ladder (not RAG luck)
- [ ] Disarm removes pack packet; style hints remain
- [ ] Guided setup sets arm ON and matches current Light/Standard/Grill pack
- [ ] Psych pack only when psych module ON
- [ ] Story pack overrides global overrides shipped
- [ ] User can import/drop markdown into Playbooks folder and have it resolve
- [ ] Shipped starters exist as editable/overrideable notes (bodies may be placeholder until content lock)
- [ ] Packs do not become default canon RAG
- [ ] Free WB chat without arm behaves as today’s B5 guided depth
- [ ] `DECISIONS.md` entry when built; backlog updated

---

## 11. Open build-time defaults (not blockers)

| Topic | Lean if implementer must choose |
|-------|----------------------------------|
| Edit shipped in place vs copy-on-edit | **Copy-on-edit** + reset to shipped |
| `.md` only vs `.md`+`.txt` | **Both** |
| Psych pack per style | **Single `any` pack v1** |
| Disk folder sync | **No** v1 |

---

*Mechanics locked in conversation 2026-07-19. Starter document content remains open until explicitly locked.*
