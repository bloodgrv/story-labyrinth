import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./schema.js";

// Database path - default to ./data/storynexus.db, overridable via environment variable
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "storynexus.db");

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
