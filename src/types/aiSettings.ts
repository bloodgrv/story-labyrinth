// Per-feature AI endpoint configuration.
//
// Rather than all features sharing one global model, each feature can be pointed
// at a different endpoint/model — e.g. a small fast model on the local machine
// for entity detection and a large model on the 3090 for writing.
//
// The global aiSettings fields (localApiUrl, defaultLocalModel, etc.) remain the
// default fallback when no per-feature override is configured.

export type FeatureKey =
    | "entity_detection" // Quick-Add / entity detection (entityDetector.ts)
    | "embedding" // Vector embedding generation for RAG (embeddingService.ts)
    | "rag_scanner" // RAG consistency scanner (future)
    | "worldbuilding_chat" // World-Building Chat AI calls (future)
    | "editor_chat" // Main Editor Chat AI calls (future)
    | "humanizer" // Humanize rewrite pass (humanizerService.ts)
    | "beat_detection" // Concrete beat suggestion pass (beatDetector.ts)
    | "document_import" // Extract a Lorebook entry from an uploaded PDF/DOCX/MD file (documentImportService.ts)
    | "image_generation" // Generate a Lorebook entry's portrait from its description (grokImageService.ts)
    | "agent_memory_distill" // Distill factual project memory candidates from a RAG scan's findings (distillMemoryJob.ts)
    | "chapter_version" // AI-regenerate an alternate chapter draft (chapterVersionAiService.ts)
    | "codex_compile" // Suggest Codex state updates from a chapter's text (C5, codexCompileJob.ts)
    | "graph_suggest_edges" // Suggest Relationship Graph edges from a story's lorebook (P1.2 G1.5+, graphSuggestEdgesJob.ts)
    | "outline_import" // Normalize an uploaded structure document into a chapter->scene draft (outlineImportService.ts)
    | "timeline_suggest_pins" // Suggest Story Timeline pins from a story's lorebook/notes (TL11B, timelineSuggestPinsJob.ts)
    | "timeline_extract_pins" // Extract multiple dated beats from a single timeline/event entry's Lore Sheet (timelineExtractPinsService.ts)
    | "sheet_migrate" // Optional "Improve sheet with AI" tidy pass over a Lore Sheet (T5 FS2, sheetMigrateService.ts)
    | "sheet_sync" // "Sync structured fields" — LLM row/list extraction inside Lore Sheet sections (T5 FS3, sheetSyncService.ts)
    | "ai_review"; // AI Review manuscript-editor pass — dev/continuity/voice/line findings (AR1, aiReviewService.ts)

// "grok-session" is deliberately excluded — it isn't a simple OpenAI-compatible client (it proxies
// through grok.com server-side via a bespoke SSE conversion, see grokSessionClient.ts) and is
// already flagged as unofficial/fragile in the UI. "grok"/"grok-oauth" are both real
// https://api.x.ai/v1 connections and fit the same `new OpenAI({baseURL, apiKey})` shape as
// every other provider here.
//
// "local-inprocess" is a different kind of thing entirely: it runs an embedding model directly
// inside the Node server (server/services/localEmbeddingService.ts, via @huggingface/transformers)
// with no HTTP client at all. Valid only for the "embedding" feature — enforced in the Settings UI
// (FeatureEndpointsCard.tsx) and server-side (routes/admin.ts) — since it has no way to serve any
// other feature.
export type FeatureProvider = "local" | "openai" | "openrouter" | "grok" | "grok-oauth" | "local-inprocess";

export type FeatureEndpoint = {
    provider: FeatureProvider;
    // For "local": the base URL of the OpenAI-compatible server (e.g. http://192.168.1.5:1234/v1)
    // For "openrouter": optional custom base URL (defaults to https://openrouter.ai/api/v1)
    // For "openai"/"grok"/"grok-oauth": not used (always api.openai.com / api.x.ai)
    apiUrl?: string | null;
    // API key for the provider. For "local" this is ignored (sent as "local"). For "grok-oauth"
    // this is ignored too — it always uses the single global xAI OAuth connection, refreshed
    // transparently (see aiClientFactory.ts's getFreshGrokOAuthToken).
    // If omitted for "openai"/"openrouter"/"grok", the global key in aiSettings is used as fallback.
    apiKey?: string | null;
    model: string;
};

// Stored as JSON in aiSettings.featureEndpoints.
// Only features with an explicit entry override the global defaults.
export type FeatureEndpoints = Partial<Record<FeatureKey, FeatureEndpoint>>;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
    entity_detection: "Entity Detection (Quick-Add)",
    embedding: "Embeddings (Vector RAG)",
    rag_scanner: "RAG Scanner",
    worldbuilding_chat: "World-Building Chat",
    editor_chat: "Editor Chat",
    humanizer: "Humanizer",
    beat_detection: "Beat Detection",
    document_import: "Document Import (Lorebook)",
    image_generation: "Image Generation (Lorebook)",
    agent_memory_distill: "Agent Memory Distillation",
    chapter_version: "Chapter Versions (AI Draft)",
    codex_compile: "Codex Auto-Compile (Suggest Updates)",
    graph_suggest_edges: "Relationship Graph (Suggest Edges)",
    outline_import: "Outline Import",
    timeline_suggest_pins: "Story Timeline (Suggest Pins)",
    timeline_extract_pins: "Story Timeline (Extract Pins from Entry)",
    sheet_migrate: "Lore Sheet (Improve with AI)",
    sheet_sync: "Lore Sheet (Sync to Codex)",
    ai_review: "AI Review (Manuscript Editor)"
};

export const FEATURE_KEYS: FeatureKey[] = [
    "entity_detection",
    "embedding",
    "rag_scanner",
    "worldbuilding_chat",
    "editor_chat",
    "humanizer",
    "beat_detection",
    "document_import",
    "image_generation",
    "agent_memory_distill",
    "chapter_version",
    "codex_compile",
    "graph_suggest_edges",
    "outline_import",
    "timeline_suggest_pins",
    "timeline_extract_pins",
    "sheet_migrate",
    "sheet_sync",
    "ai_review"
];
