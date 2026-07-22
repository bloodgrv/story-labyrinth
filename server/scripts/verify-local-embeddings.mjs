// Standalone smoke test for the local in-process embedding backend.
//
// Run during the Docker build (both stages, after prefetchEmbeddingModel.mjs) so a broken
// install — missing libgomp1, a corrupt prefetched cache, an onnxruntime-node platform mismatch —
// fails loudly and immediately, rather than surfacing later as a runtime 500 the first time
// someone switches the embedding feature to "Local (in-process)". See
// docs/Local_Embeddings_Design.md and the sqlite-vec verify script this one mirrors.
//
// Deliberately does NOT set env.allowRemoteModels = false here: this script's job is to prove
// the prefetched cache is actually usable, and it exercises the exact same cacheDir the runtime
// code points at, so a cache hit is what it's actually testing for.
//
// Usage: node server/scripts/verify-local-embeddings.mjs

import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";

const MODEL_ID = "nomic-ai/nomic-embed-text-v1.5";
const DTYPE = "q8";
const CACHE_DIR = path.resolve(process.cwd(), ".embedding-model-cache");
const EXPECTED_DIMENSIONS = 768;

const fail = message => {
    console.error(`[verify-local-embeddings] FAILED: ${message}`);
    process.exit(1);
};

try {
    env.cacheDir = CACHE_DIR;

    const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });
    console.log(`[verify-local-embeddings] pipeline loaded from ${CACHE_DIR}`);

    const output = await extractor(["The quick brown fox jumps over the lazy dog."], {
        pooling: "mean",
        normalize: true
    });
    const [vector] = output.tolist();

    if (!Array.isArray(vector) || vector.length !== EXPECTED_DIMENSIONS)
        fail(`unexpected embedding shape: got ${vector?.length ?? "undefined"} dims, expected ${EXPECTED_DIMENSIONS}`);
    if (!vector.every(n => typeof n === "number" && Number.isFinite(n))) fail("embedding contained non-finite values");

    console.log(`[verify-local-embeddings] embedded 1 text -> ${vector.length}-dim vector OK`);
} catch (error) {
    fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
