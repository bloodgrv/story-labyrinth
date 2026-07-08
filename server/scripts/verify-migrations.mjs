// Verifies the full migration chain — including the sqlite-vec/FTS5 RAG tables — applies
// cleanly against a fresh database, using the exact compiled artifacts that ship in this
// image (dist/server/server/db/*.js), not the TypeScript source. Run against a scratch DB
// path that's created and destroyed here; never touches the real /app/data volume.
//
// Usage (from the production image, after `dist/` and `server/db/migrations` exist):
//   node server/scripts/verify-migrations.mjs

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const SCRATCH_DIR = path.join(process.cwd(), ".migration-verify-scratch");
const SCRATCH_DB = path.join(SCRATCH_DIR, "verify.db");

// Best-effort cleanup — a locked file (e.g. a WAL file the OS hasn't released yet) must
// never mask the actual pass/fail result of this check.
const safeCleanup = () => {
    try {
        rmSync(SCRATCH_DIR, { recursive: true, force: true });
    } catch (error) {
        console.warn(`[verify-migrations] cleanup warning (non-fatal): ${error.message}`);
    }
};

const fail = message => {
    console.error(`[verify-migrations] FAILED: ${message}`);
    safeCleanup();
    process.exit(1);
};

safeCleanup();
mkdirSync(SCRATCH_DIR, { recursive: true });
process.env.DATABASE_PATH = SCRATCH_DB;

try {
    const { runMigrations } = await import("../../dist/server/server/db/migrate.js");
    runMigrations();

    // Confirm the RAG tables specifically exist afterward — this whole exercise exists to
    // catch exactly the failure mode where sqlite-vec/FTS5 tables silently fail to appear.
    const { sqlite } = await import("../../dist/server/server/db/client.js");

    const regularTables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('ragChunks','ragScans','ragScanIssues')")
        .all()
        .map(r => r.name);
    const virtualTables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('vec_chunks','fts_chunks')")
        .all()
        .map(r => r.name);

    sqlite.close();

    const expectedRegular = ["ragChunks", "ragScans", "ragScanIssues"];
    const missingRegular = expectedRegular.filter(t => !regularTables.includes(t));
    if (missingRegular.length > 0) fail(`missing tables after migration: ${missingRegular.join(", ")}`);
    if (virtualTables.length !== 2) fail(`expected vec_chunks + fts_chunks, found: ${virtualTables.join(", ") || "none"}`);

    console.log(
        "[verify-migrations] full migration chain OK — ragChunks/ragScans/ragScanIssues/vec_chunks/fts_chunks all present"
    );
} catch (error) {
    fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
    safeCleanup();
}
