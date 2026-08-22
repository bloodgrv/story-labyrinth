// server/db/migrate.ts resolves its migrations folder relative to the compiled file's own
// location at runtime: dist/server/server/db/migrate.js -> ./migrations. `tsc` only emits
// compiled .js from .ts sources, so the raw .sql migration files (and drizzle-kit's own
// meta/_journal.json + meta/*_snapshot.json bookkeeping) never land there on their own — a bare
// `npm run build` produces a dist/ that crashes on first boot with "Can't find meta/_journal.json
// file" the instant runMigrations() runs, before the server ever accepts a request. The
// Dockerfile has always worked around this with its own explicit COPY step
// (`COPY --from=builder /app/server/db/migrations ./dist/server/server/db/migrations`), but that
// only covers the Docker image — a bare `npm run build && npm start` (or a portable/no-Docker
// package built the same way) never got it, same bug class as copyGuideContent.mjs's own header
// comment describes for the Guide's .mdx content. Copies the whole migrations/ tree (recursive,
// so meta/ comes along) into the one place the compiled migrator actually looks, as a build step.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "../db/migrations");
const DEST = join(__dirname, "../../dist/server/server/db/migrations");

if (!existsSync(SRC)) throw new Error(`[copyMigrations] source folder not found: ${SRC}`);

mkdirSync(dirname(DEST), { recursive: true });
cpSync(SRC, DEST, { recursive: true });

console.log(`[copyMigrations] copied migrations tree -> ${DEST}`);
