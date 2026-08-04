# Story Labyrinth – Name Generator Design Document

**Version:** 0.4  
**Date:** 2026-07-22  
**Status:** Pre-implementation review corrections — see "v0.4 corrections" below before starting NG0  
**Hermes mirror:** `C:\Users\Reuben\.hermes\plans\Name_Generator_Design.md`  
**Backlog:** `docs/CURRENT_BACKLOG.md` P3 / NG slices  

---

## v0.4 corrections (2026-07-22 codebase check)

Checked against the actual `lorebookEntries` schema, `PromptParser`, and chat tool-calling before starting NG0. Two of v0.3's decisions don't fit how the app actually works:

1. **Pools are dedicated tables, not lorebook entry types.** `LorebookEntry.category` is a closed TS union (`src/types/story.ts`), and every lorebook entry — regardless of category — is unconditionally RAG-indexed as prose (`ragIndexService.ts`, no category exclusion), eligible as a Relationship Graph node, and rendered in "Natural View" as an editable character profile. A 100–300-name pool doesn't want any of that: it would pollute hybrid search/scanner results and show up as a nonsensical graph node. Pools, tiers, used-names, and story defaults live in their own new tables (`namePools`, `usedNames`, `storyNameDefaults`, etc.) — nothing about them touches `lorebookEntries` or its category enum. "Extensible via Lorebook entry types" (Core Principles) is superseded by this.
2. **Prompt syntax must follow the existing space-delimited grammar, not `key: value, key: value`.** `PromptParser.parseRegularVariables` splits on spaces (`variable.trim().split(" ")`) the way `{{character characterName}}` works — no colons, no commas. The originally-specified `{{name: pool-id, …}}` would parse a literal `varName = "name:"`, fail the registry lookup, and silently no-op (the parser's existing "unknown variable" warn-and-skip path). Corrected syntax below.
3. **NG6's "optional tool" means a fence, not real LLM tool-calling.** The app has no OpenAI-style function/tool-calling anywhere (`tools:`/`tool_calls` don't appear in `server/services`); every existing "tool" (codex-proposal, shuttle-proposal, note-proposal, etc.) is a markdown-fence convention parsed from plain chat text. `generate_names` follows that same pattern — a `name-proposal`-style fence a weak/non-tool-calling model can still emit as plain text — not a real function-calling integration.

---

---

## Goal

Provide writers with a fast, context-aware name generator that produces grounded, non-repetitive names. Supports prompt syntax, a first-class UI panel, and optional model tool calling. Local-first; feeds Character Codex under existing approval rules.

## Core Principles

- General-purpose (not tied to any single genre)
- **Product feature first** (UI + backend) — not dependent on tool-calling models
- Multiple invocation: panel, prompt syntax, optional tool
- Tiered rarity; separate first-name and surname pools
- Extensible via dedicated pool tables (**not** Lorebook entry types — see v0.4 correction #1) + import packs
- Local-first and offline capable for generation from installed pools

---

## Locked decisions (2026-07-19 gap close)

| # | Topic | Decision |
|---|--------|----------|
| **1** | Starter pools | **Hybrid:** small **baked-in core** in repo; rest via **import packs** and/or **generation script** |
| **2** | Surnames v1 | **Core ship set only**; more regions via packs/script |
| **3** | Used-name scope | **Story** + **auto-include series** when story is in a series |
| **4** | Weak/local models | **Syntax + UI panel always**; `generate_names` tool **optional** |
| **5** | Filters v1 | **Light only** (max length, starts-with) |
| **6** | Codex create | **Panel:** manual only. **Chats:** **host-chat gates**. Never auto-stub every generate |
| **7** | Import | **JSON + CSV**; **global and story-scoped** pools |
| **8** | Many pools UX | Search + filters + favorites/recent + **per-story defaults** |
| **9** | Collisions | Used-name list + **light lorebook character name** check; no deep manuscript scan in v1 |
| **10** | Tier split | Pack-configurable; default top **100 / 300 / capped rare** |
| **11** | UI surfaces | **Panel** + **WB/Codex** + **Editor insert** + chat syntax/tool |
| **12** | v1 cut line | Strong-data regions, **recent 2–3 eras**, M/F/unisex + surnames — not full 250 matrix baked in |

---

## Era Buckets

1880–1899 … 2020–present (8 buckets).  
**v1 baked-in:** ~1980–present (2–3 eras).

## Regions

Full list: US, UK, Irish, Italian-American, German, French, Hispanic, African-American, Scandinavian, Slavic, Jewish, East-Asian, South-Asian, Greek.  
**v1 core:** US, UK (+ other strong-data as seed allows).

---

## Data

- **Dedicated tables** (not `lorebookEntries` — see v0.4 correction #1): `namePools`/`surnamePools` (or a shared `namePools` with a `kind` column) holding tier arrays + metadata; pools are never RAG-indexed, never Relationship Graph nodes, never rendered in Natural View  
- Used names: story ∪ series  
- Story defaults: era/region/gender/favorites  
- Import: JSON native, CSV converter; global or story scope  

## Invocation

1. **UI panel** → backend API (no LLM required)  
2. **`{{name pool-id era=1990s gender=f}}`** prompt syntax — space-delimited, `key=value` params, no colons/commas (matches `PromptParser.parseRegularVariables`'s existing grammar; see v0.4 correction #2). Registered in `VariableResolverRegistry` like `character`/`all_characters`, not the separate hardcoded parenthesis-call path (`{{previous_words(500)}}`) that only handles two hardcoded functions today.  
3. **Optional** `generate_names` — a `name-proposal`-style markdown fence emitted in plain chat text, following the same convention as `codex-proposal`/`shuttle-proposal`/etc. (not real LLM tool/function-calling — see v0.4 correction #3)  

Light filters: `max_length`, `starts_with`.

## Codex / chats

- Panel → manual Create Codex (`needs_fleshing_out`, pool trace)  
- Chats → existing WB/Editor/Outline proposal and tray rules  
- Pools themselves never become Codex entries or lorebook entries — only a *generated name*, once picked, can seed a new Codex character entry (manual, via the existing Quick-add "Needs fleshing out" path)  

## Implementation slices

| ID | Slice |
|----|--------|
| NG0 | Schema: dedicated `namePools`/`usedNames`/story-defaults tables (not `lorebookEntries`) |
| NG1 | Generate API |
| NG2 | UI panel + actions |
| NG3 | PromptParser syntax — register `name` in `VariableResolverRegistry`, space-delimited `key=value` grammar |
| NG4 | Seed core pools |
| NG5 | JSON + CSV import |
| NG6 | Optional tool — `name-proposal` fence convention, not real tool-calling |
| NG7 | Favorites polish + pack script |

**Order:** NG0 → NG1 → NG4 → NG2 → NG3 → NG5 → NG6 → NG7

## Non-goals v1

- Full 14×8×gender matrix baked into app  
- Heavy phonetic/flavor taxonomy  
- Deep manuscript name-collision scanner job  
- Auto Codex stub on every generate  
- Depending on tool-calling for basic use  

---

## Region packs (post-v1 / NP*)

**Locked 2026-07-23, shipped 2026-07-24** — see `docs/Name_Generator_Region_Packs_Design.md`.

- 24 region packs vendored into `server/data/name-packs/` (+ `manifest.json`), browsable and
  installable in-app via Name Generator → Import → **Browse packs** (quality badge, Install/
  Uninstall per pack, defaults to global scope).
- Idempotent install (`pack:{packId}:{slug}` deterministic pool ids, `source: "pack"`) — a repeat
  install is a clean no-op, not a duplicate stack; `replace: true` or the trash-icon Uninstall both
  work.
- **Kept hybrid core** — installing packs is opt-in per pack, nothing is boot-seeded.
- The old file-picker JSON import path still works unchanged for any pack outside the vendored 24.
- **NP3 (bulk multi-pack install presets) not built** — optional, no signal it's needed yet.

---

*Synced from Hermes plans v0.3 gap-close. v0.4 (2026-07-22): pre-implementation codebase check, three corrections — see top of doc. v0.4+ region packs pointer 2026-07-23; region packs NP0/NP1/NP2/NP4/NP5 shipped 2026-07-24.*
