import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./schema.js";

// Database path - default to ./data/story-labyrinth.db, overridable via environment variable
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "story-labyrinth.db");

// One-time migration from the pre-rebrand default filename (storynexus.db) so existing
// deployments don't appear to lose their data when the default filename changes underneath
// them. Checked by directory rather than gated on DATABASE_PATH being unset, since Docker's
// own image sets DATABASE_PATH explicitly to the new default — an unset env var isn't a
// reliable signal of "first run with the old default" in that environment.
if (!fs.existsSync(DB_PATH)) {
    const legacyPath = path.join(path.dirname(DB_PATH), "storynexus.db");
    if (fs.existsSync(legacyPath)) {
        console.log(`Migrating database file: ${legacyPath} -> ${DB_PATH}`);
        for (const suffix of ["", "-wal", "-shm", "-journal"]) {
            const from = legacyPath + suffix;
            const to = DB_PATH + suffix;
            if (fs.existsSync(from)) fs.renameSync(from, to);
        }
    }
}

// better-sqlite3 won't create a missing parent directory itself — throws "Cannot open database
// because the directory does not exist" instead. Found live (2026-08-22) against the portable
// build's release zip: Compress-Archive doesn't reliably preserve an empty directory, so a
// from-scratch extract shipped with no data/ folder at all. Docker's entrypoint already
// pre-creates /app/data, but this is a cheap, deployment-mode-agnostic belt-and-suspenders fix
// rather than relying on every packaging path to remember to do it.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrency
sqlite.pragma("journal_mode = WAL");

// Load sqlite-vec before migrations run so `CREATE VIRTUAL TABLE ... USING vec0(...)` is available.
sqliteVec.load(sqlite);

// Log confirmation on every boot (not just at Docker build time — see verify-sqlite-vec.mjs)
// so a broken extension load is immediately visible in `docker logs` / server startup output.
const { vec_version: vecVersion } = sqlite.prepare("select vec_version() as vec_version").get() as {
    vec_version: string;
};
console.log(`sqlite-vec loaded (${vecVersion})`);

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for use in queries
export { schema };

// Raw better-sqlite3 connection — needed for the vec0/FTS5 virtual tables (vec_chunks, fts_chunks)
// which live outside Drizzle's schema and are queried with hand-written SQL.
export { sqlite };
