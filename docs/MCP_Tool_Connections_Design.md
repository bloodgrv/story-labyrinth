# MCP Tool Connections — Design

**Project:** Story Labyrinth  
**Status:** Draft — sketch for review, not locked, nothing built  
**Backlog:** `docs/CURRENT_BACKLOG.md`'s "Obsidian integration" line (was "Hermes design only," this doc supersedes that placeholder with a real, generalized design)  
**Audience:** Hermes (architecture) + Claude Code (implementation, once locked)  
**Related:** `docs/Chat_Shuttle_Design.md` (propose→open/confirm tray precedent), `docs/Agent_Framework_And_Project_Memory_Design.md` (per-feature endpoint precedent, propose→approve memory precedent), `chatContextService.ts` (opt-in toggle + system-prompt-instruction injection pattern every proposal-fence feature already uses)

---

## 0. Scope decisions already made (via `AskUserQuestion`, this session)

| # | Question | Decision |
|---|----------|----------|
| 1 | Client, server, or both? | **Both.** Story Labyrinth becomes an MCP *client* (chats can call tools on external MCP servers) and, separately, an MCP *server* (exposes its own story data as tools other MCP-aware apps can query). |
| 2 | Obsidian-specific, or generic? | **Generic connector.** One "MCP Connections" settings surface where any MCP server — Obsidian's, a future second project, anything else — gets registered the same way. No Obsidian-specific code anywhere. |

---

## 1. Job

Give chats the ability to call tools on external MCP servers, and give external MCP-aware tools (Claude Desktop, another project, a future agent) read access to this app's own story data — both **generalized**, not hardcoded to any one target, and both **fitting this app's existing propose→approve doctrine** rather than becoming the first feature that writes or reaches out silently.

**Not in scope for v1:**
- A real native multi-turn agentic tool-calling loop (passing a `tools` array to every chat completion, letting the model chain multiple tool calls before replying). This app's entire generation pipeline (`AIService.ts`, every `Provider.generate()`) is a single request → stream → display turn, everywhere, with no exceptions. Building a real loop would touch every provider class and the streaming/display pipeline for a feature whose actual ask ("connect to my other project") doesn't need it — see §3.1 for the smaller mechanism that reuses what already exists.
- Local **stdio**-transport MCP servers (spawn-a-process-on-the-same-machine) as the primary/only path — see §2.3 for why Streamable HTTP has to be the primary transport here, with stdio offered later only as a self-hosted advanced option.
- Write tools on the server-exposed side (§4) — v1 is read-only. An external MCP client proposing a *write* into this app is a real extension of the propose/approve system (see §4.4) worth its own follow-up once the read-only shape is proven.

---

## 2. Why these shapes, specifically

### 2.1 Reuse the proposal-fence pattern, don't invent a tool-calling loop

This app already has a working, load-bearing pattern for "the model wants to do something consequential mid-conversation": a structured fence in its reply (```sheet-proposal```, ```timeline-pin-proposal```, ```shuttle-proposal```, a dozen more), parsed client-side by a dedicated `parse*Proposal.ts`, rendered as an ephemeral Accept/Reject card, with Accept performing the real write through an existing service call. An MCP tool call is structurally the same shape: "the model wants to invoke something with side effects or an external round-trip, and a human should see it before it happens." A new `mcp-tool-call-proposal` fence is a few hours of work following an established template; a real function-calling loop is a rewrite of the generation pipeline. Given the actual ask — reach out to an external tool, see the result, keep talking — the fence pattern gets there with one extra chat turn instead of an in-request loop, which is a fine trade for how much smaller the change is.

### 2.2 Server-side execution only, even though generation itself is client-side

B32 (`DECISIONS.md`) established that live chat generation calls providers **directly from the browser** — there's no server-side proxy for the actual completion call. Tool *execution*, though, has to be server-side regardless:
- **stdio-transport MCP servers require spawning a local process** — impossible from browser JS.
- **Streamable HTTP MCP servers usually don't grant CORS to arbitrary browser origins** — a server-side fetch sidesteps that entirely, the same reason `webSearchService.ts` (Research desk) already does its DuckDuckGo scraping server-side rather than from the browser.
- Credentials for a connection (an API token for a remote MCP server, say) shouldn't round-trip through client JS any more than they have to — same posture as this app's own provider API keys, which the browser does hold (B32's accepted trade-off), but a *third-party* service's token is a different exposure than this app's own settings.

So: the model's reply streams to the browser as normal (unchanged), the browser parses out the tool-call fence and renders the proposal card (unchanged pattern), and **Accept** posts to a new server route that does the actual MCP `tools/call`. Same shape as how a `sheet-proposal`'s Accept already calls a server route to do the real write — the only difference is what's on the other end of that call.

### 2.3 Streamable HTTP as the primary transport, not stdio

CLAUDE.md: "Docker-first approach... Strong Tailscale / LAN support required... Multi-machine model routing supported (e.g., 3090 for writing, Mac for scanner)." This app is routinely deployed with its server on one machine and the user on another (Tailscale/LAN). A **stdio**-transport MCP server (Obsidian's official one included) is a local process reading a local vault on whatever machine spawns it — which, for a server running in a Docker container, is the container's own (probably empty) filesystem, not the user's laptop where their actual Obsidian vault lives. Making stdio "just work" would require bind-mounting the vault into the container, tightly coupling deployment topology to which MCP servers are usable, and only working at all if the server and the target resource happen to be co-located.

**Streamable HTTP** (the current MCP spec's remote transport) doesn't have this problem — it's just a URL, reachable exactly the way this app already reaches a Local AI endpoint on a different machine (`localApiUrl` already models "the thing I'm calling isn't necessarily on this machine"). Obsidian's community MCP plugins increasingly ship an HTTP/SSE mode for exactly this reason (remote access to a vault). So: **v1 supports Streamable HTTP only.** stdio support is a plausible Phase 2 for self-hosted/same-machine setups, explicitly not built now.

### 2.4 Read-only by default on both sides, propose-only for writes

Every write-capable feature in this app requires human approval before anything lands (Codex, Timeline pins, Notes, Outline, Relationship Graph edges — CLAUDE.md repeats this constraint in nearly every section). An MCP connection is, by definition, a bridge to something outside this app's own data model — extending the "never write silently" doctrine to it isn't optional, it's the same rule applied to a new surface. Concretely:
- **Client direction (§3):** every tool call — even a read — goes through the propose→approve card in v1. A read-only "always allow without asking" opt-in per tool is a plausible Phase 2 (mirrors Chat Shuttle's `autoShuttle` precedent — an existing opt-in-to-skip-the-click pattern, not a new concept), explicitly deferred so v1 ships with the conservative default.
- **Server direction (§4):** exposed tools are read-only, period, in v1. No external MCP client can cause a write in this app's data without a future, separately-designed extension.

---

## 3. Direction 1 — MCP Client (chats call external tools)

### 3.1 Settings surface

New **Settings → Integrations** tab (or a card inside Providers & keys — bikeshed at build time), "MCP Connections" — mirrors `PlaybookPacksSettingsCard.tsx`'s list+dialog shape:

| Field | Notes |
|---|---|
| Name | Freeform label ("My Obsidian vault", "Project X") |
| Transport | Streamable HTTP only in v1 (§2.3) |
| URL | The MCP server's endpoint |
| Auth | Optional bearer token, stored like a provider API key (never echoed back on GET, same `hasApiKey`-style redaction B31 already established for TTS settings) |
| Scope | Global (every story) or a specific story — mirrors Playbook Packs' own global/story scope ladder |
| Enabled | Off by default per connection |

A **Refresh tools** action calls the connection's `tools/list` (MCP's own discovery call) and caches the returned tool catalogue (name, description, JSON input schema) — same "fetch and cache, refreshable" shape as a provider's "Refresh Models" button.

### 3.2 Chat integration

New per-chat opt-in toggle, **Include MCP tools** — same posture as `includeNotes`/`includeMemory`/`includeGuide` (`aiChats` column, off by default, lives in the Context rail panel per `chat-features.mdx §3`). When on:
- `chatContextService.ts` gains an `MCP_TOOLS_INSTRUCTIONS` block (mirrors `SHEET_PROPOSAL_INSTRUCTIONS`'s shape) listing every enabled, in-scope connection's tool catalogue (name + description + input schema, compact) and instructing the model to emit an ```mcp-tool-call-proposal``` fence — `{connectionId, toolName, args, reason}` — when it wants to use one, never to fabricate a tool result itself.
- New `parseMcpToolCallProposal.ts` (mirrors any existing single-fence parser — regex-matched fence, `attempt()`-wrapped `JSON.parse`, per-field shape validation) and `McpToolCallProposalCard.tsx` (shows tool name, a readable rendering of `args`, and the model's stated `reason`; Accept / Reject).
- **Accept** → `POST /api/mcp/connections/:id/call` `{toolName, args}` → server does the real `tools/call` against that connection → the tool's result is appended to the chat as a new message (a distinctly-rendered "tool result" bubble, not attributed to either "user" or "assistant" the way a normal turn is) → the conversation continues normally from there, the model's *next* reply sees the result as context. This is the "one extra turn instead of an in-request loop" trade from §2.1.
- **Reject** → dismissed, no call made, same as every other proposal card.

### 3.3 Chat types

Available wherever Lorebook/Notes context toggles already are (Editor, WB, Outline, Research, Notes, Brainstorm) — no reason to restrict it further; a story's connections aren't desk-specific.

---

## 4. Direction 2 — MCP Server (expose this app's own data)

### 4.1 Transport & mount point

A Streamable HTTP MCP server, `server/mcp/`, mounted at its own route (e.g. `/mcp`) alongside the existing Express app — same "one process, one port" deployment shape this app already has (CLAUDE.md's Docker-first posture), not a second service to stand up.

### 4.2 Auth — a separate token, not the session cookie

MCP clients are other processes/apps, not a logged-in browser — they can't carry this app's `httpOnly` session cookie. New per-installation (or per-story — bikeshed at build time) **access token**, generated/rotated from Settings, sent as a bearer token on every MCP request. This is a genuinely new credential type for this app (everything else is either the session cookie or a third-party provider key) — treat it with the same "never echoed back after creation, only a rotate/revoke action" posture B31 established for TTS keys.

### 4.3 Settings surface

**Settings → Integrations**, "Expose as MCP server" card — owner-gated (mirrors Users/Admin's own gating; this is a new outbound data-exposure surface on what CLAUDE.md calls a "strong Tailscale/LAN" single-operator app, closer to an admin decision than a per-story editor one):
- Off by default.
- Generate/rotate token, with the resulting endpoint URL + token shown once (copy-to-clipboard) for pasting into whatever's connecting (a Claude Desktop `mcp.json`, the other project's own MCP client config).

### 4.4 Tools exposed (v1, read-only)

| Tool | Maps to |
|---|---|
| `search_lorebook(storyId, query)` | Existing lorebook search/matching, same underlying query the app's own tag-matching already does |
| `get_chapter(chapterId)` | Chapter title + content |
| `list_notes(storyId)` / `get_note(noteId)` | Notes desk data |
| `get_story_timeline(storyId)` | Reuses `storyTimelineService.getSpineChronologyExcerpt` — the exact same helper the chat context toggle and Scanner hook already share, not a new formatter |

**A future write tool** (e.g. an external MCP client proposing a new Note) would need to land in this app's *own* pending-review queues — e.g. `createUserNote`-shaped but starting `pending`, reviewed in the normal Notes/Memory UI — never a direct external write. Explicitly not designed further here; flagging the shape so a future pass doesn't have to re-derive "external writes still go through our approve step" from scratch.

---

## 5. Open questions to lock before build

1. **MCP SDK:** the official `@modelcontextprotocol/sdk` (TypeScript) is the obvious choice for both client and server directions — confirm no objection before adding the dependency.
2. **Connection scope UI bikeshed:** does "MCP Connections" live in its own Settings tab, or fold into Providers & keys alongside the AI provider cards? Leaning toward its own tab given it's conceptually closer to Playbook Packs (a management surface) than to an LLM provider.
3. **Per-story vs global connections:** should a connection default to global (visible from every story, like Global lorebook entries) or be story-scoped by default? Playbook Packs' own global/story ladder is the closest precedent either way.
4. **Token lifetime for the server direction:** single standing token (simple, matches how this app already has exactly one user account) vs. per-external-app tokens (more setup, cleaner revocation if one integration is ever compromised without invalidating the others). Leaning toward starting with a single token given the single-operator framing, revisit if a second external consumer shows up.
5. **Does `agentJobs` need to know about tool calls at all?** A synchronous, in-chat-turn tool call (§3.2's Accept flow) doesn't obviously need a job row — it's not background work, the user is watching it happen. Flagging in case a *slow* external tool (a long-running query against the other project) makes a fire-and-forget-with-progress shape worth reconsidering later; not needed for the read-only tools sketched in §4.4.
