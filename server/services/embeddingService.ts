import { createHash } from "node:crypto";
import { buildClientForFeature, getFeatureEndpoints } from "./aiClientFactory.js";
import { LOCAL_EMBEDDING_MODEL_NAME, embedTextsLocally } from "./localEmbeddingService.js";

// Fixed at extension-load time by the `vec_chunks` virtual table (migration 0009).
// Changing embedding models to a different dimension requires a new migration that
// drops and recreates `vec_chunks`, plus a full re-embed of existing chunks.
export const EMBEDDING_DIMENSIONS = 768;

const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP_PARAGRAPHS = 1;

export const computeContentHash = (text: string): string => createHash("sha256").update(text).digest("hex");

// Greedily pack paragraphs into chunks up to MAX_CHUNK_CHARS, carrying the last
// paragraph of each chunk into the next one for a small amount of cross-chunk context.
export const chunkText = (text: string): string[] => {
    const paragraphs = text
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean);

    if (paragraphs.length === 0) return [];

    const chunks: string[] = [];
    let current: string[] = [];
    let currentLength = 0;

    for (const paragraph of paragraphs) {
        if (currentLength > 0 && currentLength + paragraph.length + 2 > MAX_CHUNK_CHARS) {
            chunks.push(current.join("\n\n"));
            current = current.slice(-CHUNK_OVERLAP_PARAGRAPHS);
            currentLength = current.reduce((sum, p) => sum + p.length + 2, 0);
        }
        current.push(paragraph);
        currentLength += paragraph.length + 2;
    }
    if (current.length > 0) chunks.push(current.join("\n\n"));

    return chunks;
};

// Generate embeddings for a batch of texts using the "embedding" feature endpoint.
// Throws if no endpoint is configured, or if the model returns an unexpected dimension.
export const embedTexts = async (texts: string[]): Promise<{ embedding: number[]; model: string }[]> => {
    if (texts.length === 0) return [];

    // "local-inprocess" has no HTTP client at all — skip buildClientForFeature/OpenAI entirely.
    // See docs/Local_Embeddings_Design.md.
    const endpoints = await getFeatureEndpoints();
    if (endpoints.embedding?.provider === "local-inprocess") return embedTextsLocally(texts);

    const connection = await buildClientForFeature("embedding");
    if (!connection) {
        throw new Error(
            "No AI provider configured for embeddings. Set a global default or an 'Embeddings' feature endpoint in AI Settings."
        );
    }
    const { client, model } = connection;

    // Explicit encoding_format is required: the OpenAI SDK defaults to requesting/decoding
    // base64 when this is omitted, which silently corrupts responses from local servers
    // (LM Studio, Ollama, etc.) that ignore encoding_format and always return plain float
    // arrays — the SDK then mis-decodes that array as base64 into a shorter, wrong vector.
    const response = await client.embeddings.create({ model, input: texts, encoding_format: "float" });

    return response.data.map(item => {
        if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
            throw new Error(
                `Embedding model '${model}' returned ${item.embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. ` +
                    "Configure an embedding model matching the expected dimension in AI Settings."
            );
        }
        return { embedding: item.embedding, model };
    });
};

// Reports which embedding model is currently active for the "embedding" feature, without making
// a real embedding call — used by reconcileIndexJob.ts to detect chunks embedded by a since-
// abandoned backend/model (e.g. after switching to/from "local-inprocess") so they get re-embedded
// rather than silently mixed into the same vector index alongside the new model's output.
// Returns null when no provider is configured at all (mirrors embedTexts()'s own "unavailable"
// case — reconcile already tolerates that by leaving embeddingModel comparisons a no-op).
export const resolveActiveEmbeddingModel = async (): Promise<string | null> => {
    const endpoints = await getFeatureEndpoints();
    if (endpoints.embedding?.provider === "local-inprocess") return LOCAL_EMBEDDING_MODEL_NAME;

    const connection = await buildClientForFeature("embedding");
    return connection?.model ?? null;
};
