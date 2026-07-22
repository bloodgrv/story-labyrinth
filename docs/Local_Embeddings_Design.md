# Local In-Process Embeddings — Design

**Status:** **Design locked 2026-07-22** — implementation starting same session.
**Priority:** P3
**Related:** `docs/CURRENT_BACKLOG.md`'s "Local in-process embeddings" entry (proposed 2026-07-22); `server/services/embeddingService.ts`; `server/services/aiClientFactory.ts`

---

## Job

Let RAG embedding (indexing lorebook entries, chapters, notes, outline items, agent memories) run **fully in-process**, with **zero external endpoint dependency**, as an alternative to routing through an OpenAI-compatible server (LM Studio today). Scoped to the **embedding feature only** — chat, scanner, and every other feature keep using external endpoints exactly as today.

- **Not:** a general local-inference story. The RAG Scanner's reasoning LLM (12B–31B params) stays out of process — bundling GGUF weights + `node-llama-cpp` would conflict with this project's native-binding-avoidance stance and its multi-machine model-routing design (3090 for writing, Mac for scanner).

---

## Locked decisions

| # | Axis | Lock |
|---|------|------|
| **1** | Model | `nomic-ai/nomic-embed-text-v1.5` — already the model configured for this feature; publishes real ONNX weights, `transformers.js`-compatible. Fixed, not user-choosable in v1. |
| **2** | Quantization | **Quantized (int8)**, the library default — smaller image, faster CPU inference; this is a background indexing step, not a user-facing latency path. Not exposed as a toggle in v1. |
| **3** | Runtime library | `@huggingface/transformers` (successor to `@xenova/transformers`). In Node this runs on `onnxruntime-node` — **prebuilt native `.node` binaries**, same risk class as `sqlite-vec`'s prebuilt binary (no compile step), lighter than `canvas` (which compiles from source). Needs `libgomp1` at runtime on Debian-slim (OpenMP dependency of the native binary). |
| **4** | Dimension | 768 — matches `EMBEDDING_DIMENSIONS` exactly. **No `vec_chunks` migration needed.** |
| **5** | Model weight delivery | **Baked into the Docker image at build time**, not downloaded at first run. This project is LAN/Tailscale/local-first; a runtime dependency on reaching huggingface.co would contradict that. The build machine already needs internet (same as `npm install`). Runtime sets `env.allowRemoteModels = false` unconditionally so the container can never reach out at runtime regardless of how it was built. |
| **6** | Feature scope | New provider `"local-inprocess"` added to `FeatureProvider`, restricted (UI + server validation) to the `"embedding"` feature key only — it has no HTTP client, so it can't serve any other feature through the existing `aiClientFactory.ts` abstraction. |
| **7** | Cross-backend correctness | Embeddings from different models/backends must never be mixed in one vector index, even at the same dimension (different embedding spaces aren't comparable). `ragChunks.embeddingModel` already records the producing model — reconcile's staleness check is taught to treat "chunk's `embeddingModel` ≠ the currently configured embedding model" as drift, so switching providers + reconciling naturally re-embeds everything. No separate "force" flag. |
| **8** | Staleness coverage | Extended to **all five** embeddable entity types (`lorebook_entry`, `chapter`, `agent_memory`, `note`, `outline_item`) — memory/note/outline chunks were never staleness-checked before this (a pre-existing gap in `reconcileIndexJob.ts`, closed here regardless of this feature). |
| **9** | "Rebuild everything" mechanism | Reuses the **existing** `reconcile_index` job type with `storyId: null` meaning "loop every story" — mirrors `prune_history`'s existing "some jobs are global" precedent. No new job type, no new `AgentJobType` entry. |
| **10** | Trigger UI | A single button (+ confirm dialog) near the embedding feature row in Settings. No new progress UI — reuses the existing read-only Recent Jobs view. |

---

## Data / settings sketch

| Setting | Where | Notes |
|---------|-------|-------|
| `featureEndpoints.embedding.provider` | `aiSettings` (existing JSON column) | New allowed value `"local-inprocess"` |
| `featureEndpoints.embedding.model` | same | Fixed synthetic model id, e.g. `nomic-embed-text-v1.5 (local)` — no live `/models` endpoint to query |
| `ragChunks.embeddingModel` | existing column | Already the source of truth for "which model embedded this chunk" — reused unchanged for drift detection |

No schema migration. No new DB columns.

---

## Non-goals (v1)

1. Per-story or per-request choice of embedding backend — one global "embedding" feature endpoint, same as today
2. Quantized/fp32 toggle, or any alternate embedding model choice
3. Fixing `nomic-embed-text-v1.5`'s documented `search_document:`/`search_query:` prefix convention — neither the existing LM-Studio-routed path nor this new path does this; out of scope for a backend swap
4. A new job type or a new progress/status UI beyond the existing Recent Jobs view
5. Handling a fully offline `docker build` environment — the build machine needs outbound HTTPS to huggingface.co once, same as it already needs one to the npm registry

---

## Implementation slices

| Slice | Work |
|-------|------|
| **IE0** | This design doc |
| **IE1** | `server/services/localEmbeddingService.ts` (lazy singleton pipeline, mean-pool + normalize, dimension assert, `env.allowRemoteModels = false`); `@huggingface/transformers` dependency; `server/scripts/prefetchEmbeddingModel.mjs`; Dockerfile: `libgomp1`, builder-stage prefetch + `COPY` into runtime stage, `verify-local-embeddings.mjs` sanity script |
| **IE2** | `"local-inprocess"` added to `FeatureProvider`; `embedTexts()` branches to `embedTextsLocally()` when the embedding feature's provider is `local-inprocess`; defensive throw case in `aiClientFactory.ts`'s `clientFromEndpoint`; `resolveActiveEmbeddingModel()` helper |
| **IE3** | `FeatureEndpointsCard.tsx`: provider option shown only for the embedding row, synthetic model entry, apiUrl/apiKey hidden; `admin.ts`: reject `local-inprocess` for any feature key other than `embedding` |
| **IE4** | `reconcileIndexJob.ts`: model-mismatch staleness check across all 5 entity types; `job.storyId === null` loops every story |
| **IE5** | "Rebuild embedding index (all stories)" button + confirm dialog, calls existing `POST /api/agent/jobs` |
| **IE6** | Build clean; browser-verified provider switch + reindex; rebuild job verified across entity types |

---

## Acceptance criteria

- [ ] Selecting "Local (in-process)" for the embedding feature requires no external endpoint — chapters/lorebook entries index with real (non-null) embeddings and no LM Studio running
- [ ] Every other feature (chat, scanner, etc.) is completely unaffected — `local-inprocess` is rejected server-side if set on any feature key other than `embedding`
- [ ] Switching the embedding provider and running a reconcile (all-stories) re-embeds every previously-embedded chunk across all 5 entity types under the new model tag — no mixed-space chunks left behind
- [ ] `docker build` produces an image with the model weights already present; the running container makes no network call to fetch them
- [ ] `npm run build` clean

---

## Document history

- 2026-07-22 — Design locked; implementation starting same session
