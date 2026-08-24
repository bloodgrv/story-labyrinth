import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// In-process embedding backend for the "embedding" feature — no external endpoint required.
// Runs nomic-ai/nomic-embed-text-v1.5 (768-dim, matches embeddingService.ts's EMBEDDING_DIMENSIONS)
// via @huggingface/transformers (onnxruntime-node under the hood). See docs/Local_Embeddings_Design.md.
//
// MODEL_ID/DTYPE/CACHE_DIR are duplicated (not imported) in server/scripts/prefetchEmbeddingModel.mjs
// and server/scripts/verify-local-embeddings.mjs — those are plain, pre-build .mjs scripts that run
// before `dist/` exists, so they can't import this compiled TS module. Keep all three in sync.
const MODEL_ID = "nomic-ai/nomic-embed-text-v1.5";
// "q8" resolves to the repo's onnx/model_quantized.onnx — the traditional dynamic-quantized int8
// variant. Fixed, not user-configurable (see design doc's locked decisions).
const DTYPE = "q8";
export const LOCAL_EMBEDDING_MODEL_NAME = "nomic-embed-text-v1.5 (local)";

// Walks up from this module's own compiled location to the nearest ancestor that actually
// contains .embedding-model-cache — the app root it was copied next to (repo root in dev, /app in
// Docker, versions/<v>/app/ in a portable build), regardless of how deep this file lands under
// dist/. Deliberately NOT "nearest package.json" (tried first, reverted): tsc's resolveJsonModule
// emits a copy of server/routes/update.ts's `import pkg from "../../package.json"` into
// dist/server/package.json to keep that relative import valid post-compile, so a package.json
// walk-up stops one level too shallow in every real build, not just this one. Also deliberately
// NOT process.cwd()-relative (the original approach): that broke on every portable build, since
// both the launcher .bat/.command and the self-updater's spawnServer set the running process's cwd
// to the *portable root*, not versions/<v>/app/ where the cache actually lives — the model was
// always shipped correctly (build-portable.mjs's assembleApp() copies it into every version's
// app/ dir), just never found at runtime. Docker's WORKDIR /app happened to make process.cwd()
// correct there by coincidence, which is why this went unnoticed until a portable build hit it.
const findCacheDir = (startDir: string): string => {
    let dir = startDir;
    while (!fs.existsSync(path.join(dir, ".embedding-model-cache"))) {
        const parent = path.dirname(dir);
        if (parent === dir) return path.join(startDir, ".embedding-model-cache"); // give up, keep old behavior's shape
        dir = parent;
    }
    return path.join(dir, ".embedding-model-cache");
};

// Populated at build time by server/scripts/prefetchEmbeddingModel.mjs — baked into the Docker
// image via the Dockerfile's explicit RUN step, and for a non-Docker build via package.json's
// "prebuild" script — and re-pointed at here unchanged at runtime, with allowRemoteModels forced
// off below — the running process never reaches the network for this, regardless of how it was built.
const CACHE_DIR = findCacheDir(path.dirname(fileURLToPath(import.meta.url)));

// Duplicated from embeddingService.ts's EMBEDDING_DIMENSIONS to avoid a circular import between
// the two modules (embeddingService.ts imports embedTextsLocally from here). Both are pinned to
// the same 768-dim model, so this is a single fact expressed twice, not real drift risk.
const EXPECTED_DIMENSIONS = 768;

type FeatureExtractionPipeline = (
    texts: string[],
    options: { pooling: "mean"; normalize: true }
) => Promise<{ tolist: () => number[][] }>;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

// Lazily loads the model once and reuses it — loading is expensive (parses the ONNX graph,
// tokenizer, etc.), so every call after the first just awaits the same cached promise.
const getExtractor = async (): Promise<FeatureExtractionPipeline> => {
    if (!pipelinePromise) {
        pipelinePromise = (async () => {
            const { pipeline, env } = await import("@huggingface/transformers");
            env.allowRemoteModels = false;
            env.cacheDir = CACHE_DIR;
            return (await pipeline("feature-extraction", MODEL_ID, {
                dtype: DTYPE
            })) as unknown as FeatureExtractionPipeline;
        })();
    }
    return pipelinePromise;
};

// Same return shape as embeddingService.ts's embedTexts, so embedTexts() can delegate to this
// transparently when the embedding feature's configured provider is "local-inprocess".
export const embedTextsLocally = async (texts: string[]): Promise<{ embedding: number[]; model: string }[]> => {
    if (texts.length === 0) return [];

    const extractor = await getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const vectors = output.tolist();

    return vectors.map(embedding => {
        if (embedding.length !== EXPECTED_DIMENSIONS) {
            throw new Error(
                `Local embedding model '${LOCAL_EMBEDDING_MODEL_NAME}' returned ${embedding.length} dimensions, expected ${EXPECTED_DIMENSIONS}.`
            );
        }
        return { embedding, model: LOCAL_EMBEDDING_MODEL_NAME };
    });
};
