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
    | "outline_generation" // AI-assisted outline suggestion pass (outlineGenerator.ts)
    | "document_import"; // Extract a Lorebook entry from an uploaded PDF/DOCX/MD file (documentImportService.ts)

export type FeatureProvider = "local" | "openai" | "openrouter" | "grok";

export type FeatureEndpoint = {
    provider: FeatureProvider;
    // For "local": the base URL of the OpenAI-compatible server (e.g. http://192.168.1.5:1234/v1)
    // For "openrouter": optional custom base URL (defaults to https://openrouter.ai/api/v1)
    // For "openai"/"grok": not used (always https://api.openai.com/v1 / https://api.x.ai/v1)
    apiUrl?: string | null;
    // API key for the provider. For "local" this is ignored (sent as "local").
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
    outline_generation: "Outline Generation",
    document_import: "Document Import (Lorebook)"
};

export const FEATURE_KEYS: FeatureKey[] = [
    "entity_detection",
    "embedding",
    "rag_scanner",
    "worldbuilding_chat",
    "editor_chat",
    "humanizer",
    "beat_detection",
    "outline_generation",
    "document_import"
];
