# Sexuality Playbook — Design

**Project:** Story Labyrinth
**Status:** **Design locked 2026-08-14 — implemented in full 2026-08-15 (SX0–SX9).** See `docs/CURRENT_BACKLOG.md`'s Sexuality Playbook row and `DECISIONS.md`'s "Sexuality Playbook (SX0–SX9)" entry for the build trail.
**Talk list:** **Sexuality Playbook**
**Backlog slices:** **SX0–SX9** (P3 until promoted)
**Related:** Character Guided Playbook Packs (`character_codex`/`character_psych`, `docs/Character_Guided_Playbook_Packs_Design.md`); Character psych module (`metadata.psychProfile`, `psych-proposal` fence); Lore Sheet's optional "Sexuality" section (prose-only, `sheetTemplates.ts`)

---

## Context / job

The Character Guided Playbook Packs already carry a light touch of sexuality content: each `character_codex` tier (Light/Standard/Grill) ends with a "Sexuality & Power Dynamics" question block, and the Lore Sheet has an optional prose-only "Sexuality" section that syncs straight into `description` as narrative text. Neither gives durable, structured, queryable facts the way the psych module does for MBTI/Enneagram.

**Is this feature:** a dedicated addon mirroring the **psych module** exactly, in two parts:

1. A deeper, dedicated interview-question **playbook pack** (`character_sexuality`/`any`, sibling to `character_psych`/`any`) — a standalone cue sheet the model uses to drive a focused sexuality/dynamics/kink conversation, independent of the Light/Standard/Grill style tiers.
2. A structured **profile field** (`entry.metadata.sexualityProfile`) that captures the durable facts that conversation surfaces — orientation, dynamic (dominant/submissive/switch and how it shows), kinks/interests, hard limits, freeform blurb — proposed via a new `sexuality-proposal` fence and accepted/rejected the same way `psych-proposal` is.

**Not this feature:**

| Surface | Job |
|---------|-----|
| **Character Codex (`codexPendingChanges`/`codexSnapshots`)** | Concrete/physical state only, per CLAUDE.md's standing constraint — sexuality content never routes through here, never RAG-scanned, never enforced |
| **Lore Sheet "Sexuality" section** | Stays pure prose → `description`, unchanged by this feature |
| **`character_codex` packs' existing "Sexuality & Power Dynamics" block** | Stays as-is — this feature adds a separate, optional, deeper module alongside it, not a replacement |
| **Any consistency/drift scanning** | Explicitly out — writing-aid only, same boundary as the psych module |

---

## Locked decisions (2026-08-14)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Scope | Build **both** halves — dedicated playbook pack *and* structured profile field. Confirmed via `AskUserQuestion` before design. |
| **2** | Codex enforcement | **Writing aid only**, never Codex state, never RAG-scanned/enforced — matches psych module precedent and CLAUDE.md's standing "keep psychological/thematic enforcement out of scope" constraint. Confirmed via `AskUserQuestion`. |
| **3** | Arming UX | **One-shot "Add sexuality prompt" button** (mirrors psych's current pattern), **not** a standing `extraToggles` switch. Psych's own standing toggle was found "not working as intended" and replaced with this button pattern (`LorebookEntryEditor.tsx:244`) — copy the validated pattern, don't reintroduce the switch. |
| **4** | Auto-nudge on Grill-me | **None.** Psych gets auto-armed when style becomes "grill" (`handleStyleChange`); sexuality module stays **always an explicit, deliberate opt-in**, never armed as a side effect of picking a style tier, given the sensitivity of the content. |
| **5** | Profile fields | `orientation`, `dynamic`, `kinks`, `limits`, `blurb`. `limits` (hard limits / off-the-table) has no psych analog — safety-relevant for this genre, already called out in existing `CHARACTER_CODEX_GRILL` content. |
| **6** | Pack identity | New `PlaybookKey` value `"character_sexuality"`, `style: "any"` — third parallel lane alongside `character_codex`/`character_psych`, resolved independently, both packs can be armed simultaneously. |

---

## Data shape

```ts
// src/types/story.ts, alongside psychProfile
sexualityProfile?: {
    orientation?: string;
    dynamic?: string;   // dominant / submissive / switch, and how it surfaces
    kinks?: string;
    limits?: string;    // hard limits — what's off the table
    blurb?: string;
};
```

```ts
// src/types/playbookPack.ts
export type PlaybookKey = "character_codex" | "character_psych" | "character_sexuality";
```

---

## Implementation slices

| Slice | Work | Depends |
|-------|------|---------|
| **SX0** | Types: `PlaybookKey`/`PLAYBOOK_KEYS`, `metadata.sexualityProfile`, `ChatContext.playbookPack.sexuality`, `includeSexualityModule` on the chat DTO/API client types | — |
| **SX1** | Schema + migration: `aiChats.includeSexualityModule` boolean, default false, mirrors `includePsychModule` | SX0 |
| **SX2** | Content: `CHARACTER_SEXUALITY_ANY` cue sheet in `playbookPackContent.ts` (orientation/identity, dynamics, kinks, hard/soft limits, unspoken wants, how established Codex state reads differently in an intimate context); new `SHIPPED_PACKS` row in `playbookPackService.ts` | SX0 |
| **SX3** | Server: `SEXUALITY_MODULE_INSTRUCTIONS` constant + `buildSystemPrompt` restructured to accumulate psych/sexuality addenda independently; `includeSexualityModule` computed in `getChatContext`; third parallel `resolvePlaybookPackContext` lane | SX1, SX2 |
| **SX4** | Server routes (`chats.ts`): mirror every `includePsychModule` touchpoint for `includeSexualityModule` | SX1 |
| **SX5** | Client parsing: `parseSexualityProposal.ts` (mirrors `parsePsychProposal.ts`), wired into `useChatMessageGeneration.ts`'s parse chain | SX3 |
| **SX6** | Client proposal UX: `SexualityProposalCard.tsx`, `handleAcceptSexuality` (merges into `metadata.sexualityProfile` via the existing generic `PUT /api/lorebook/:id`, no server change needed), proposal state tracking in `ChatInterface.tsx` | SX5 |
| **SX7** | Client Guided Setup: `SEXUALITY_PROMPT_TEXT`, "Add sexuality prompt" button next to "Add psych prompt" in `LorebookEntryEditor.tsx`, playbook-pack formatting block's third branch | SX3, SX4 |
| **SX8** | `SexualityProfilePanel.tsx` (read-only, mirrors `PsychProfilePanel.tsx`), rendered in `LorebookEntryEditor.tsx` alongside the psych panel | SX6 |
| **SX9** | Docs: `CLAUDE.md` Character Codex/Chat System clause, `DECISIONS.md` dated entry, Guide (`lorebook.mdx`'s "docked World-Building chat" section) | SX0–SX8 |

**Order:** SX0 → SX1 → SX2 → SX3 → SX4 → SX5 → SX6 → SX7 → SX8 → SX9.

**Reuse:** `parsePsychProposal.ts`, `PsychProposalCard.tsx`, `PsychProfilePanel.tsx`, `handleAcceptPsych` (`ChatInterface.tsx:1136-1151`), `resolvePlaybookPack`/`resolvePlaybookPackContext`, `seedShippedPlaybookPacks()` — every one of these is copied/extended in parallel, not rewritten.

---

## Pitfalls

- Do **not** route any part of this through `codexPendingChanges`/`codexSnapshots` — writing aid only (locked decision 2).
- Do **not** reintroduce a standing toggle for arming — psych's own standing toggle was already tried and replaced (locked decision 3).
- Do **not** auto-arm on Grill-me style selection (locked decision 4).
- Do **not** forget the context-fetch effect's dependency array (`ChatInterface.tsx:563`) — psych hit a real stale-context bug here (P0.4 B5) from missing style/psych fields in the deps; `includeSexualityModule` needs the same fix applied proactively.
- Do **not** let the two module system-prompt addenda (psych + sexuality) clobber each other — `buildSystemPrompt`'s single-`if`-return needs restructuring to an accumulator, not two competing early returns.
- Build only after **promote**.

---

## Document history

| Date | Change |
|------|--------|
| 2026-08-14 | Design locked from user-directed planning session (`EnterPlanMode`/`ExitPlanMode`). Both playbook-pack and structured-profile halves; writing-aid-only scope; one-shot button UX; no Grill-me auto-nudge; `limits` field added beyond psych's shape. |
