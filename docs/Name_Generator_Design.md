# Story Nexus – Name Generator Design Document

**Version:** 0.3  
**Date:** 2026-07-19  
**Status:** Gaps closed — ready for implementation  
**Hermes mirror:** `C:\Users\Reuben\.hermes\plans\Name_Generator_Design.md`  
**Backlog:** `docs/CURRENT_BACKLOG.md` P3 / NG slices  

---

## Goal

Provide writers with a fast, context-aware name generator that produces grounded, non-repetitive names. Supports prompt syntax, a first-class UI panel, and optional model tool calling. Local-first; feeds Character Codex under existing approval rules.

## Core Principles

- General-purpose (not tied to any single genre)
- **Product feature first** (UI + backend) — not dependent on tool-calling models
- Multiple invocation: panel, prompt syntax, optional tool
- Tiered rarity; separate first-name and surname pools
- Extensible via Lorebook entry types + import packs
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

- Lorebook types: `name-pool`, `surname-pool` with tier arrays + metadata  
- Used names: story ∪ series  
- Story defaults: era/region/gender/favorites  
- Import: JSON native, CSV converter; global or story scope  

## Invocation

1. **UI panel** → backend API (no LLM required)  
2. **`{{name: pool-id, …}}`** prompt syntax  
3. **Optional** tool `generate_names`  

Light filters: `max_length`, `starts_with`.

## Codex / chats

- Panel → manual Create Codex (`needs_fleshing_out`, pool trace)  
- Chats → existing WB/Editor/Outline proposal and tray rules  

## Implementation slices

| ID | Slice |
|----|--------|
| NG0 | Schema: pools, used-names, story defaults |
| NG1 | Generate API |
| NG2 | UI panel + actions |
| NG3 | PromptParser syntax |
| NG4 | Seed core pools |
| NG5 | JSON + CSV import |
| NG6 | Optional tool |
| NG7 | Favorites polish + pack script |

**Order:** NG0 → NG1 → NG4 → NG2 → NG3 → NG5 → NG6 → NG7

## Non-goals v1

- Full 14×8×gender matrix baked into app  
- Heavy phonetic/flavor taxonomy  
- Deep manuscript name-collision scanner job  
- Auto Codex stub on every generate  
- Depending on tool-calling for basic use  

---

*Synced from Hermes plans v0.3 gap-close.*
