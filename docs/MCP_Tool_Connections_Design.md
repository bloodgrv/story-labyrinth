# MCP Tool Connections — Design

**Project:** Story Labyrinth  
**Status:** **LOCKED** 2026-08-20 (grill + lean packs) — not built  
**Backlog:** P3 epic **M0–M3** (client v1) + **M4** (server Phase 1.5); supersedes placeholder “Obsidian integration / Hermes design only”  
**Audience:** Hermes (architecture) + Claude Code (implementation, once promoted to build)  
**Related:** `docs/Chat_Shuttle_Design.md` (propose→open/confirm tray precedent), `docs/Agent_Framework_And_Project_Memory_Design.md` (per-feature endpoint + propose→approve memory), `chatContextService.ts` (opt-in toggle + system-prompt-instruction injection), `server/lib/ssrfSafeFetch.ts` (SSRF posture), B31/B32/B39 (secrets redaction, browser generation, fence trust)

---

## 0. Scope decisions (pre-grill + grill)

| # | Question | Decision |
|---|----------|----------|
| 1 | Client, server, or both? | **Both in one design.** v1 **acceptance = client only.** Server = **Phase 1.5 (M4)**, same doc, separate slices after client proven. |
| 2 | Obsidian-specific, or generic? | **Generic connector.** No Obsidian-specific code. Any Streamable HTTP MCP server registers the same way. |
| 3 | v1 “done” | Real external Streamable HTTP MCP: Settings connection → per-chat toggle → `mcp-tool-call-proposal` → Accept → server `tools/call` → durable **`tool_result`** message → next turn sees it. |
| 4 | Update path | Progressive: transport field; refreshable catalogue; policy relax (auto-allow reads); M4 server; writes→pending queues; optional slow-tool jobs — **not** a redesign. |

---

## 1. Job

Give chats the ability to call tools on external MCP servers, and (Phase 1.5) give external MCP-aware tools read access to this app’s own story data — both **generalized**, and both **fitting propose→approve doctrine** rather than silent outbound/inbound mutation.

**v1 acceptance (client):** M0–M3 only.  
**Phase 1.5 (server expose):** M4 — designed below, not required for v1 done.  
**Later (explicit update path):** auto-allow read tools; stdio transport; external/client write tools via pending queues; slow-tool `agentJobs` if needed.

**Not in scope for v1:**
- Native multi-turn agentic tool-calling loop (`tools` array on every completion). Pipeline stays single request → stream → display; fence + one extra turn is the deliberate trade (§2.1).
- stdio as primary/only transport (§2.3).
- Write tools on the server-exposed side (§4) — read-only when M4 ships.
- Auto-allow without Accept on client calls (Phase 2; mirrors `autoShuttle`).
- `agentJobs` for the synchronous Accept path.

---

## 2. Why these shapes

### 2.1 Reuse the proposal-fence pattern, don’t invent a tool-calling loop

Working pattern: structured fence → client parse → Accept/Reject card → Accept performs real side effect via service/route. MCP tool call is the same shape. New `mcp-tool-call-proposal` follows existing parsers/cards; a real function-calling loop would rewrite every provider + stream path for an ask that doesn’t need it.

### 2.2 Server-side execution only

B32: live chat generation is browser-direct. Tool **execution** is server-side:
- stdio needs process spawn (impossible from browser).
- Streamable HTTP MCP usually lacks CORS for arbitrary origins — same reason Research fetch is server-side.
- Third-party MCP tokens should not round-trip through client JS more than necessary.

Flow: model streams as today → browser parses fence → card → **Accept** → `POST` server route → MCP `tools/call` → **server writes** `tool_result` chat message.

### 2.3 Streamable HTTP primary, not stdio

Docker-first, Tailscale/LAN, multi-machine. stdio MCP (including many Obsidian setups) binds to the **spawning** machine’s FS — inside Docker that’s the container, not the user’s vault host. Streamable HTTP is a URL (same mental model as `localApiUrl`). **v1 = Streamable HTTP only.** stdio = later self-hosted option; schema should leave a **transport** field (`streamable_http` now).

### 2.4 Read-only / propose defaults

- **Client v1:** every tool call (including reads) goes through propose→Accept.
- **Server M4:** exposed tools read-only.
- **Future writes (either direction):** never silent; external→SL lands in **pending** queues (notes/memory-style); SL→external stays on proposal cards.

---

## 3. Direction 1 — MCP Client (v1)

### 3.1 Settings surface

**Settings → Integrations** (own surface — **not** folded into Providers & keys). “MCP Connections” list + dialog (PlaybookPacks-style):

| Field | Notes |
|---|---|
| Name | Freeform label |
| Transport | `streamable_http` only in v1 (field exists for later stdio) |
| URL | MCP endpoint |
| Auth | Optional bearer; server-stored; **never echoed on GET**; rotate/clear (B31/`hasApiKey` redaction) |
| Allow private/LAN | **Off by default**; owner opt-in per connection (SSRF-safe default + home-lab escape hatch) |
| Scope | Default **global**; optional pin to one story |
| Enabled | **Off** by default per connection |

**Refresh tools** → `tools/list` → cache catalogue (name, description, input schema). Stale/unknown tool on call → **400** until refresh. Show tool count / last error.

**Who manages:** **owner-only** CRUD + refresh.

**Server expose card:** same Integrations area, **reserved**; built in M4 (may be disabled/placeholder in M0–M3 UI).

### 3.2 Security on call path

| Rule | Lock |
|------|------|
| URL fetch | Reuse/extend `ssrfSafeFetch` (or equivalent): http(s) only; block localhost/link-local/RFC1918/metadata **unless** connection LAN flag on |
| Execute authz | Server re-checks session, owner/chat access, connection enabled, story scope vs chat’s story |
| Args | Best-effort validate against **cached** input schema; reject bad args without calling MCP |
| Limits | Hard timeout + max response bytes; fail → error `tool_result` |
| Logs | connection id, tool name, status, duration — **not** secrets or full dumps |
| Idempotency | One Accept; guard double-submit; optional short `requestId` |

### 3.3 Chat integration

| | |
|--|--|
| Toggle | Per-chat **Include MCP tools** (`aiChats` column); Context rail; **off by default** |
| Desks | All desks that already have context toggles (Editor, WB, Outline, Research, Notes, Brainstorm) |
| When ON | `chatContextService` injects `MCP_TOOLS_INSTRUCTIONS` + compact catalogue of **enabled, in-scope** connections only |
| Budget | Hard token/tool cap; visible “N tools omitted” if truncated; empty catalogue → honest “no tools; don’t invent” |
| Fence | `mcp-tool-call-proposal` → `{ connectionId, toolName, args, reason }` (`reason` required for card; `args` object default `{}`) |
| Parse/UI | `parseMcpToolCallProposal.ts` + `McpToolCallProposalCard.tsx` (connection label, tool, args, reason; Accept/Reject) |
| Accept | `POST /api/mcp/connections/:id/call` `{ toolName, args, chatId, requestId? }` — Zod (B39); **server writes** transcript message |
| Reject | Dismiss only — no call, no message |

### 3.4 Accept → result lifecycle

| | |
|--|--|
| Success | One message, distinct kind **`tool_result`** (not user/assistant); UI label e.g. **Tool · {connection} / {tool}**; body = status + result text/JSON string; **cap/truncate** huge payloads with explicit note |
| Failure | Same kind, error status — never fake success |
| Next turn | Message is in the normal transcript path the model sees (must not drop unknown roles) |
| Jobs | **No** `agentJobs` on sync Accept |
| Update path | Later: Retry control, slow-tool job, optional auto follow-up model turn |

### 3.5 Fence + API contract

```text
```mcp-tool-call-proposal
{ "connectionId": "...", "toolName": "...", "args": { }, "reason": "..." }
```
```

- Instructions: emit fence only; **never fabricate tool results**; multiple fences per reply OK if multi-proposal norms elsewhere allow.
- Unknown `toolName` not in cache → 400 (refresh first).
- Server persists `tool_result` so Accept cannot succeed without a durable row.

---

## 4. Direction 2 — MCP Server (Phase 1.5 / M4)

### 4.1 Transport & mount

Streamable HTTP MCP via official SDK, `server/mcp/` (or equivalent), mounted e.g. **`/mcp`** on the existing Express app — one process, one port.

### 4.2 Auth

MCP clients are not browser session cookies. **Single standing install bearer** (generate/rotate/revoke from Settings; show once; never echo later). Owner-gated. Revisit per-app tokens if a second external consumer needs isolated revoke.

### 4.3 Settings

Integrations → **Expose as MCP server** card: off by default; endpoint URL + token copy-once when enabled/rotated.

### 4.4 Tools (read-only)

| Tool | Maps to |
|---|---|
| `search_lorebook(storyId, query)` | Existing lorebook search/matching |
| `get_chapter(chapterId)` | Chapter title + content |
| `list_notes(storyId)` / `get_note(noteId)` | Notes desk |
| `get_story_timeline(storyId)` | Reuse `storyTimelineService.getSpineChronologyExcerpt` (same helper as chat/Scanner) |

**`storyId` required** on story-scoped tools — no implied “current story” from MCP.  
**Future writes:** pending-review queues only; never direct external write into canon.

---

## 5. Locked decisions (grill 2026-08-20)

| Axis | Lock |
|------|------|
| **1 Job** | v1 = client E2E; server M4; progressive update path (table in §0–§1) |
| **2 Result lifecycle** | Server-written `tool_result`; cap size; errors explicit; no jobs v1 |
| **3 Security** | SSRF default + per-connection LAN; owner CRUD; redacted secrets; scope+schema; timeout/size |
| **4 Settings/scope** | Integrations IA; global default scope; connection + chat toggle off; server card reserved |
| **5 Chat** | All toggle-desks; catalogue budget; never fabricate |
| **6 Fence/API** | Fence payload above; server validates + writes message; unknown tool 400 |
| **7 Server 1.5** | `/mcp`, single bearer, named read tools, explicit storyId |
| **8 Build** | `@modelcontextprotocol/sdk`; slices M0–M4; proof = real HTTP MCP |

**Resolved former open questions:** SDK yes; Integrations not Providers; scope default global; single server token; no agentJobs for sync Accept.

---

## 6. Implementation slices

| ID | Scope | Notes |
|----|--------|------|
| **M0** | Schema + Settings CRUD + secret redaction + LAN flag + Refresh `tools/list` cache | Owner-only |
| **M1** | `POST .../call` + SSRF/LAN + timeout/size + schema check | Smoke without full chat OK |
| **M2** | `includeMcpTools` + instructions + parse + card + Accept → server-written `tool_result` | v1 vertical slice |
| **M3** | Zod/harden double-submit, catalogue budget UX, Guide blurb | v1 acceptance with M2 |
| **M4** | Expose `/mcp` + token UI + read tools | Phase 1.5; after client proven |
| **Later** | Auto-allow reads; stdio; writes→pending; slow-tool jobs | Update path only |

**SDK:** `@modelcontextprotocol/sdk` (client now; server at M4).  
**Proof (M2/M3):** one real external Streamable HTTP MCP (e.g. vault HTTP plugin or tiny local HTTP MCP) — not mock-only.  
**Impl handoff:** Claude Code full end-to-end prompts by default unless user directs Hermes to code the fork.

---

## 7. Acceptance criteria (v1 = M0–M3)

1. Owner can add a Streamable HTTP connection with optional bearer + optional LAN flag; secrets never returned on GET.  
2. Refresh tools populates cache; enabled + global (or matching story) connection appears only when chat toggle ON.  
3. Model can emit valid `mcp-tool-call-proposal`; card shows reason/args; Reject is a no-op.  
4. Accept performs server-side call; transcript gains `tool_result` (success or error); next assistant turn can use it.  
5. SSRF blocks private targets unless LAN opt-in; disabled/out-of-scope connection cannot be called.  
6. Oversized/slow tools fail closed within limits.  
7. No provider tool-loop; no stdio; no server `/mcp` required for v1 done.

**M4 extra:** external client with bearer can `tools/list` + read tools only; server off by default.

---

## 8. Non-goals (unless reopened)

- In-app Hermes **skills** installer (separate from MCP tool connections).  
- Replacing Research web desk or Chat Shuttle with MCP.  
- Silent canon writes from any MCP direction.  
- Multi-tenant public SaaS MCP exposure assumptions (product remains strong Tailscale/LAN single-operator posture).
