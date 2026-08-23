import crypto from "node:crypto";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlite } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface JournalEntry {
    tag: string;
    when: number;
    breakpoints: boolean;
}

const MIGRATIONS_TABLE = "__drizzle_migrations";

// Hand-rolled replacement for drizzle-orm's own `migrate()` (better-sqlite3/migrator.js). Same
// on-disk inputs (meta/_journal.json + the .sql files) and the same __drizzle_migrations table
// shape, so it's a drop-in read of whatever a prior install already recorded — but tracks
// applied migrations by hash, not by "is this migration's timestamp newer than the single most
// recently applied one." Found live (2026-08-22, a portable-build user's fresh install hit
// "FOREIGN KEY constraint failed" on first boot): drizzle's own migrator only checks
// `SELECT ... ORDER BY created_at DESC LIMIT 1`, so a database whose migration history is
// non-contiguous for any reason (a corrupted/incomplete zip extraction losing a migration file
// partway through, a migrations folder assembled out of order, etc.) can silently skip a
// migration forever — the loop only compares against that single row, never checks whether a
// migration is *individually* already present. Hashing every migration file and checking each
// one's presence independently makes that whole failure class self-correcting instead of
// silently-wrong: whatever's missing gets applied on the very next boot, and whatever's already
// there is skipped regardless of timestamp ordering.
//
// Also fails fast with a clear message if the migrations folder itself is missing files the
// journal expects — a corrupted/truncated distribution should say so plainly instead of
// surfacing as a cryptic downstream constraint error from a table that was never created.
export const runMigrations = () => {
    console.log("Running database migrations...");
    try {
        const migrationsFolder = join(__dirname, "migrations");
        const journalPath = join(migrationsFolder, "meta", "_journal.json");
        if (!fs.existsSync(journalPath)) {
            throw new Error(`Can't find meta/_journal.json in ${migrationsFolder}`);
        }
        const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };

        const missingFiles = journal.entries
            .map(entry => `${entry.tag}.sql`)
            .filter(file => !fs.existsSync(join(migrationsFolder, file)));
        if (missingFiles.length > 0) {
            throw new Error(
                `Migrations folder is missing ${missingFiles.length} file(s) the journal expects: ${missingFiles.join(", ")} — this install looks corrupted or incomplete, not just out of date.`
            );
        }

        sqlite.exec(`
            CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
                id INTEGER PRIMARY KEY,
                hash text NOT NULL,
                created_at numeric
            )
        `);
        const appliedHashes = new Set(
            sqlite.prepare(`SELECT hash FROM ${MIGRATIONS_TABLE}`).all().map((row: unknown) => (row as { hash: string }).hash)
        );

        let appliedCount = 0;
        for (const entry of journal.entries) {
            const filePath = join(migrationsFolder, `${entry.tag}.sql`);
            const fileContents = fs.readFileSync(filePath, "utf8");
            const hash = crypto.createHash("sha256").update(fileContents).digest("hex");
            if (appliedHashes.has(hash)) continue;

            const statements = fileContents.split("--> statement-breakpoint");
            const applyOne = sqlite.transaction(() => {
                for (const statement of statements) sqlite.exec(statement);
                sqlite.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`).run(hash, entry.when);
            });
            applyOne();
            appliedCount++;
        }

        console.log(
            appliedCount > 0
                ? `Database migrations completed successfully (${appliedCount} applied, ${journal.entries.length - appliedCount} already up to date)`
                : "Database migrations completed successfully (already up to date)"
        );
    } catch (error) {
        console.error("Error running migrations:", error);
        throw error;
    }
};
