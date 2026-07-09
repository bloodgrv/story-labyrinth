# CLAUDE.md — Story Nexus Fork

**Project:** The Story Nexus Fork  
**Owner:** Reuben  
**Date:** 2026-06-29  
**Supervisor:** Hermes Agent

---

## Project Goal

Create a purpose-built fork of JonSilver/TheStoryNexus optimized for long-form erotic/psychological fiction with strong emphasis on:

- Concrete dynamic state tracking (wardrobe, appearance, wounds, items, user-defined fields)
- Factual consistency (preventing drift from established facts and Codex state)
- Interview-style world-building via specialized chats
- Strong user control and non-destructive history

---

## Key Architectural Decisions

### Character Codex
- Extends the existing Lorebook
- Focuses on **concrete/physical state** only (no psychological modeling)
- Supports per-entry snapshot history with restore capability
- Tracks source of changes (chat + user)
- Quick-add from Main Editor with "Needs fleshing out" tagging

### Chat System
- Three main contexts:
  - World-Building Chats (multiple focused chats with templates)
  - Global Info/Research Chat
  - Main Editor Chat (writing-focused)
- Outline Chat is one of the default templates
- All Codex modifications require explicit user approval (Approve / Reject / Edit First)
- Per-chat saved prompts supported

### RAG Systems
- Vector RAG uses sqlite-vec (hybrid FTS5 + vector)
- RAG Scanner focuses on factual + concrete state consistency
- **Per-feature endpoint selection** required (writing model and scanner model can run on different machines)

### UX Flow
- Dashboard as central hub (card grid + preferences sidebar)
- Everything opens in new browser tabs
- Full session persistence + user-configurable preferred tab setup
- Main Editor opens last chapter + dismissible session summary
- RAG Scanner in collapsible right rail with toggleable inline highlights
- Project Saves split into Codex + Story layers with separate visual timelines

### Deployment & Access
- Docker-first approach
- Strong Tailscale / LAN support required
- Multi-machine model routing supported (e.g., 3090 for writing, Mac for scanner)

### Agent Framework (Planned)
- A future background layer that owns RAG index freshness, unattended scanner runs, light DB housekeeping, and an evolving per-writer/per-project memory
- Reuses existing infrastructure rather than introducing new dependencies: a generalized jobs table (extending the existing `ragScans` pattern), an in-process job runner (no queue library/worker process — single Docker container, single SQLite file), and agent memory stored as a new RAG entity type (reusing `ragChunks`/`hybridSearch` rather than a parallel store)
- Full design recorded in `DECISIONS.md` under "RAG Index Freshness ... & Agent Framework Direction" — not yet implemented; current work should avoid building things (e.g. a manual RAG Scanner trigger UI) that this would immediately obsolete

---

## Technology Stack

- Base: JonSilver/TheStoryNexus (Express + SQLite + Drizzle + Lexical)
- Vector layer: sqlite-vec
- All model access via OpenAI-compatible endpoints
- Local-first with optional LAN/Tailscale access

---

## Current Phase

We are in **Phase 0 – Foundation**.

Priority order for implementation:
1. Fork + Docker + basic login
2. Character Codex (dynamic state + history)
3. Per-feature endpoint selection
4. Vector RAG (sqlite-vec)
5. RAG Scanner
6. World-Building Chat system
7. Main Editor integration + quick-add
8. Dashboard + tab system + persistence
9. Project Saves (Codex + Story layers)
10. Agent Framework (background jobs, scanner orchestration, DB housekeeping, cross-project memory) — design recorded in `DECISIONS.md`, not started

---

## Important Constraints

- All Codex changes must be non-destructive with history
- AI edits in Codex require user approval
- Keep psychological/thematic enforcement out of scope
- Support remote access via Tailscale from work PC

---

## Instructions for Claude Code

- Always read this file first when starting work
- Follow the architectural decisions above
- Ask Hermes (via the user) before making major architectural changes
- Prioritize clean, maintainable code over cleverness
- Document any new decisions in this file or a separate `DECISIONS.md`

---

*This file is the single source of truth for the project.*