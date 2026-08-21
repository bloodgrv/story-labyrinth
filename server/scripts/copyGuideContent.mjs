// guideSearchService.ts reads the Guide's .mdx source files directly off disk at server-module-
// load time (not bundled — it runs under tsc, not Vite's `?raw` import convention the client side
// uses), resolving them relative to the compiled file's own location: dist/server/server/services/
// -> ../../src/features/guide/content. Neither `tsc`'s own output nor the Dockerfile's COPY steps
// ever placed the raw .mdx files there, so every production boot (Docker AND a bare `npm run
// build && npm start`) crashed immediately on that top-level `fs.readFileSync` call - never caught
// before because dev always runs under tsx against the real repo tree, where the relative path
// happens to resolve correctly on its own. Copies the same content dir the client already inlines
// via Vite, into the one place the compiled server actually looks for it, as the last build step.
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "../../src/features/guide/content");
const DEST = join(__dirname, "../../dist/server/src/features/guide/content");

mkdirSync(DEST, { recursive: true });
const files = readdirSync(SRC).filter(f => f.endsWith(".mdx"));
for (const file of files) copyFileSync(join(SRC, file), join(DEST, file));

console.log(`[copyGuideContent] copied ${files.length} .mdx files -> ${DEST}`);
