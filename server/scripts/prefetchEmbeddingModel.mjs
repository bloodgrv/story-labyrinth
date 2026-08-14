// Downloads the local in-process embedding model's ONNX weights + tokenizer into a fixed
// cache directory, so the running process never needs to reach huggingface.co at runtime (this
// project is LAN/Tailscale/local-first — see docs/Local_Embeddings_Design.md). The runtime code
// (localEmbeddingService.ts) points at the same cache dir with env.allowRemoteModels = false, so
// it's satisfied entirely from what this script already downloaded here. Run explicitly during
// `docker build` (see Dockerfile); for a non-Docker build, package.json's "prebuild" script runs
// this automatically before `npm run build`.
//
// MODEL_ID/DTYPE/CACHE_DIR are duplicated (not imported) from
// server/services/localEmbeddingService.ts — this is a plain, pre-build .mjs script that runs
// before `dist/` exists, so it can't import that compiled TS module. Keep all three in sync.
//
// Usage: node server/scripts/prefetchEmbeddingModel.mjs

import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";

const MODEL_ID = "nomic-ai/nomic-embed-text-v1.5";
const DTYPE = "q8";
const CACHE_DIR = path.resolve(process.cwd(), ".embedding-model-cache");

const fail = message => {
    console.error(`[prefetch-embedding-model] FAILED: ${message}`);
    process.exit(1);
};

try {
    env.cacheDir = CACHE_DIR;
    // Remote allowed here (build time only) — this is the one deliberate network fetch, forcing
    // the download into CACHE_DIR so runtime can disable it entirely.
    env.allowRemoteModels = true;

    console.log(`[prefetch-embedding-model] downloading ${MODEL_ID} (dtype=${DTYPE}) into ${CACHE_DIR} ...`);
    await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });
    console.log("[prefetch-embedding-model] done");
} catch (error) {
    fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
