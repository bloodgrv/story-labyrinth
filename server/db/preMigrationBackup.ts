// Pre-migration database snapshot — a single, openable copy of the user's database taken on the
// first boot of any build whose version differs from the one that last ran against it, before
// runMigrations() touches anything.
//
// Why this exists separately from the portable self-updater's own snapshot (scripts/portable-
// updater/update-runner.mjs's backupDatabase): that one is taken by the *updater*, and the updater
// that executes any given update is the one the PREVIOUS release installed — it only self-updates
// at the end of a successful run. So the very first update onto a release carrying an updater fix
// still runs the old updater, with none of its protections. This runs inside the new server's own
// startup, which the old updater does spawn, so it reaches that first hop.
//
// It also covers the deployments the updater never sees at all:
//   * Docker — `docker compose pull && up -d` runs migrations with no snapshot and no rollback.
//   * A portable install upgraded by hand (unzipping over it, or repointing current-version.txt).
//
// Migrations here are forward-only (migrate.ts — there are no down-migrations), so this is the
// only thing standing between a bad migration and unrecoverable data. It cannot roll the app back
// on its own the way the updater can; what it guarantees is that recovery is always "copy one file
// back" rather than "restore from whatever you happened to have".
//
// Deliberately NOT gated on PORTABLE_BUILD: every deployment mode migrates, so every deployment
// mode gets a snapshot.
import fs from "node:fs";
import path from "node:path";
import { DB_PATH, sqlite } from "./client.js";
import pkg from "../../package.json" with { type: "json" };

const dataDir = path.dirname(DB_PATH);
// Kept beside the database rather than inside it: it describes the file, it has to survive a
// migration that corrupts the schema, and it must be readable without opening the database at all.
const markerPath = path.join(dataDir, ".app-version");
// Shared with the updater's own `pre-update-*` snapshot directories — one obvious place for a user
// to look. The two prefixes are distinct and each prune only ever touches its own.
const backupsDir = path.join(dataDir, "backups");
const SNAPSHOT_PREFIX = "pre-migration-";
const KEEP_SNAPSHOTS = 3;

const readMarker = (): string | null => {
    try {
        return fs.readFileSync(markerPath, "utf8").trim() || null;
    } catch {
        return null;
    }
};

// A brand-new install has no schema yet, so there is nothing to lose and nothing worth writing a
// snapshot of. `__drizzle_migrations` is the right probe: migrate.ts creates it before applying
// anything, so its presence means this database has been migrated at least once already.
const hasExistingSchema = (): boolean =>
    !!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get();

const byteSize = (file: string): number => {
    try {
        return fs.statSync(file).size;
    } catch {
        return 0;
    }
};

const freeBytes = (): number | null => {
    try {
        const stats = fs.statfsSync(dataDir);
        return stats.bavail * stats.bsize;
    } catch {
        return null; // statfs unavailable — don't let an uncertain check block a boot
    }
};

const mb = (bytes: number): string => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

// Runs BEFORE creating the new snapshot, never after, so the one we are about to take can't be the
// one evicted. Only touches this feature's own files.
const pruneOldSnapshots = (): void => {
    let entries: string[];
    try {
        entries = fs.readdirSync(backupsDir);
    } catch {
        return;
    }
    const snapshots = entries
        .filter(name => name.startsWith(SNAPSHOT_PREFIX) && name.endsWith(".db"))
        .map(name => {
            const full = path.join(backupsDir, name);
            try {
                const stats = fs.statSync(full);
                return stats.isFile() ? { full, mtime: stats.mtimeMs } : null;
            } catch {
                return null;
            }
        })
        .filter((entry): entry is { full: string; mtime: number } => entry !== null)
        .sort((a, b) => b.mtime - a.mtime);

    for (const stale of snapshots.slice(KEEP_SNAPSHOTS - 1)) {
        try {
            fs.rmSync(stale.full, { force: true });
        } catch {
            // still locked — it'll be swept on a later version change
        }
    }
};

export const takePreMigrationSnapshot = (): void => {
    const version = pkg.version;
    const recorded = readMarker();
    if (recorded === version) return; // same build as last boot — nothing is about to change

    if (!hasExistingSchema()) {
        // Fresh database: recordSchemaVersion() below still stamps it, so the NEXT upgrade knows
        // exactly which version it's coming from instead of having to say "unknown".
        return;
    }

    // Deterministic name, no timestamp, so a crash-loop (migration throws → exit(1) → restart →
    // same version gap → here again) re-uses this one file instead of taking a fresh snapshot of a
    // progressively-more-broken database and eventually pruning away the only good copy.
    const dest = path.join(backupsDir, `${SNAPSHOT_PREFIX}v${recorded ?? "unknown"}-to-v${version}.db`);
    if (fs.existsSync(dest)) {
        console.log(`Pre-migration snapshot already exists for this upgrade: ${dest}`);
        return;
    }

    const sourceBytes = byteSize(DB_PATH) + byteSize(`${DB_PATH}-wal`);
    const free = freeBytes();
    if (free !== null && free < sourceBytes * 1.2) {
        console.error(
            `\n!! Skipping the pre-migration database snapshot: about ${mb(sourceBytes * 1.2)} of free space needed, ` +
                `only ${mb(free)} available in ${dataDir}.\n` +
                `!! Migrations for v${version} will now run WITHOUT a backup. Free some space and restart if you'd rather not risk that.\n`
        );
        return;
    }

    fs.mkdirSync(backupsDir, { recursive: true });
    pruneOldSnapshots();

    const started = Date.now();
    try {
        // VACUUM INTO gives one self-contained, already-consistent file — it folds in whatever the
        // WAL still holds, so unlike a raw three-file copy there are no sidecars to keep together.
        // Verified against this project's real schema, vec0 + FTS5 virtual tables included.
        // Parameterised rather than interpolated: a data directory containing an apostrophe would
        // otherwise be a SQL syntax error at the worst possible moment.
        sqlite.prepare("VACUUM INTO ?").run(dest);
        console.log(
            `Pre-migration snapshot written before upgrading v${recorded ?? "unknown"} -> v${version}: ` +
                `${dest} (${mb(byteSize(dest))} in ${Date.now() - started}ms)`
        );
    } catch (error) {
        // Loud, but never fatal. Refusing to boot because a backup failed would turn a full disk
        // into an app that won't start — the exact failure mode this whole area exists to remove.
        fs.rmSync(dest, { force: true }); // a half-written snapshot is worse than none
        console.error(
            `\n!! Could not write the pre-migration database snapshot: ${error instanceof Error ? error.message : String(error)}\n` +
                `!! Migrations for v${version} will now run WITHOUT a backup. Your data is at ${DB_PATH} — ` +
                `copy it somewhere safe if you want a fallback.\n`
        );
    }
};

// Stamped only AFTER migrations succeed. If they throw, the process exits with the marker still on
// the old version, so the next boot recognises the same upgrade and finds (or re-takes) its
// snapshot rather than assuming the upgrade already happened.
export const recordSchemaVersion = (): void => {
    try {
        fs.writeFileSync(markerPath, pkg.version);
    } catch (error) {
        // Non-fatal: the cost is a redundant snapshot next boot, not a broken install.
        console.error(`Couldn't record the schema version marker at ${markerPath}:`, error);
    }
};
