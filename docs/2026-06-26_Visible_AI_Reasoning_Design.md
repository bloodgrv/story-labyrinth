# Visible AI Reasoning Design — Thinking Tags (Story Nexus)

**Version:** 1.1 (Narrow Scope)  
**Date:** July 2026  
**Status:** Design ready for implementation  

## Overview

The goal is simple: when a model outputs native thinking/reasoning content (inside `<think>`, `<thinking>`, `<reasoning>`, or similar tags/tokens), display that reasoning visibly in the chat window and generation results instead of silently stripping it.

This is a lightweight display/parsing feature only.

## Scope (Strictly Limited)

- Parse and expose model-generated thinking blocks.
- Show/hide toggle for the thinking content.
- Works in the main chat interface and during scene/generation output.
- Nothing more.

**Out of scope (do not implement in this feature):**
- Agentic reasoning traces
- Proposed Codex / memory / state deltas
- RAG Scanner integration
- Approval workflows or editing of reasoning
- Trace history or versioning
- Multi-step agent visibility

## Why This Feature

Some models (DeepSeek-R1, certain Qwen variants, and others) emit explicit reasoning inside special tags. Currently these are often stripped or hidden. Exposing them lets the writer see the model’s actual step-by-step thinking when desired.

## Design

### 1. Parsing

- Detect common thinking tags: `<think>`, `</think>`, `<thinking>`, `<reasoning>`, and any model-specific equivalents.
- Extract the content between the opening and closing tags.
- Store or pass the thinking content separately from the final output.

### 2. Display

- In the chat window and generation preview, render thinking content in a distinct style (e.g., italic, gray background, or collapsible section).
- Default behavior: hidden (to keep output clean).
- Toggle: “Show model thinking” / “Hide model thinking” (global or per-message).

### 3. UI

- Simple toggle in settings or per-chat controls.
- Thinking blocks appear as expandable sections above or below the main response.
- No complex panels, diffs, or approval flows.

### 4. Integration

- Works with any model that emits thinking tags (via LM Studio, OpenRouter, direct API, etc.).
- Applied to regular chat and to generation features (scene writing, etc.).

## MVP Implementation

1. Add parsing logic for thinking tags in the response handler.
2. Add a simple show/hide toggle.
3. Style the thinking blocks in the chat UI.
4. Test with models known to output `<think>` blocks.

## Benefits

- Quick win for transparency with reasoning-capable models.
- Low implementation cost.
- Directly matches the original request.

## Open Questions

- Should thinking content be saved with the scene or discarded after display?
- Any preferred styling or placement (above response, collapsible, etc.)?

---

*This is the narrow, original-scope version focused only on exposing thinking tags in chat windows.*