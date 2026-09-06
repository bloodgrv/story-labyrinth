// Story Labyrinth portable-build self-updater. Deliberately dependency-free (Node built-ins
// only — no npm install of its own, ever) so it's immune to the exact ABI-mismatch bug
// build-portable.mjs's own PATH fix addresses for the *app*; this script never touches a
// native module.
//
// Invoked as a DETACHED child process by the running server's POST /api/update/start handler
// (server/routes/update.ts), which then keeps running and answers GET /api/update/status by
// reading the shared status file this script writes to (lib/statusFile.mjs) — the two
// processes have no other way to talk, since this script outlives the request that spawned it
// and, partway through, stops that very process.
//
// Design invariant: this script NEVER writes into an existing versions/<x>/ folder. It only ever
// creates a brand-new one and, on success, flips the one-line current-version.txt pointer. That
// means every failure mode up to and including a bad download or a corrupt zip leaves the
// currently-running old version completely untouched — there is no "wait for the running .exe to
// release its file handles" problem to solve, because we never try to overwrite it.
//
// Second invariant, added after a review of the data-loss paths through this script: the user's
// data/ folder is snapshotted before the new version is ever allowed to touch it, and that
// snapshot is restored automatically if the new version fails to come up. Migrations here are
// forward-only (server/db/migrate.ts — there are no down-migrations), so rolling the *code* back
// without rolling the *database* back would leave old code facing a newer schema. See
// backupDatabase/restoreDatabase below.
//
// Usage:
//   node update-runner.mjs --root=<portableRoot> --platform=<win-x64|mac-arm64|mac-x64>
//     --target-version=<x.y.z> --download-url=<url> --digest=sha256:<hex> --old-pid=<pid>
//     --port=<port> [--shutdown-token=<hex>] [--db-path=<path>]

import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import path from "node:path";
import { writeStatus } from "./lib/statusFile.mjs";

const args = Object.fromEntries(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.replace(/^--/, "").split("=");
        return [key, rest.join("=")];
    })
);

const root = path.resolve(args.root);
const platform = args.platform; // "win-x64" | "mac-arm64" | "mac-x64"
const targetVersion = args["target-version"];
const downloadUrl = args["download-url"];
const expectedDigest = args.digest; // "sha256:<hex>"
const oldPid = Number(args["old-pid"]);
const port = args.port || "3000";
// Optional (see the two-way-compatibility note on POST /start): a runner may be handed these by a
// newer server than the one that shipped it, or by an older one that doesn't know about them.
const shutdownToken = args["shutdown-token"] || null;

if (!root || !platform || !targetVersion || !downloadUrl || !expectedDigest || !oldPid) {
    console.error("[update-runner] missing required args");
    process.exit(1);
}
if (platform !== "win-x64" && platform !== "mac-arm64" && platform !== "mac-x64") {
    console.error(`[update-runner] unknown --platform=${platform}`);
    process.exit(1);
}
const isWindows = platform === "win-x64";

const versionsDir = path.join(root, "versions");
const currentVersionFile = path.join(root, "current-version.txt");
const newVersionDir = path.join(versionsDir, targetVersion);
const downloadPath = path.join(versionsDir, `.download-${targetVersion}.zip`);
const dbPath = args["db-path"] || path.join(root, "data", "story-labyrinth.db");
const backupsDir = path.join(root, "data", "backups");

// How long the old server gets to stop the clean way (Manuscript Failsafe Save across every story
// + draining in-flight agent jobs) before we start signalling it. Generous on purpose: a slow,
// complete shutdown is strictly better than a fast, lossy one, and nothing is user-visible during
// this window beyond a progress label.
const GRACEFUL_STOP_TIMEOUT_MS = 60_000;
// How long the newly-spawned server gets to become *ready*, not merely alive. The old 10s budget
// was against liveness only and could expire on any slow first boot (a big database's migrations,
// sqlite-vec + onnxruntime loading, a cold disk), which then triggered a spurious rollback.
const READY_TIMEOUT_MS = 180_000;
const KEEP_DB_BACKUPS = 3;

// Single choke point for "where's the node binary for this version" — matches server/routes/
// update.ts's own nodeBinaryFor helper (kept as two small copies rather than a shared import,
// since this script is deliberately dependency-free / no relative import outside its own tree,
// while update.ts's copy lives inside the TS server build). darwin ships the official
// node/bin/node tarball layout; win ships node/node.exe directly.
const nodeBinaryFor = versionDir => (isWindows ? path.join(versionDir, "node", "node.exe") : path.join(versionDir, "node", "bin", "node"));
const indexJsFor = versionDir => path.join(versionDir, "app", "dist", "server", "server", "index.js");

const readCurrentVersion = () => fs.readFileSync(currentVersionFile, "utf8").trim();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// PowerShell single-quoted strings escape an embedded quote by doubling it. Without this, a
// portable install under a path containing an apostrophe (C:\Users\O'Brien\... is the obvious
// real-world one) turned every extract into a PowerShell parse error — a permanent, unexplained
// update failure for that user, on every release.
const psQuote = value => `'${String(value).replace(/'/g, "''")}'`;

// Returns the spawned ChildProcess (NOT the result of .unref(), which is undefined) — the caller
// needs the handle to notice an early exit and, on rollback, to stop it again.
const spawnServer = (versionDir, extraEnv = {}) => {
    const child = spawn(nodeBinaryFor(versionDir), [indexJsFor(versionDir)], {
        cwd: root,
        env: {
            ...process.env,
            NODE_ENV: "production",
            PORTABLE_BUILD: "1",
            PORTABLE_PLATFORM: platform,
            PORT: port,
            DATABASE_PATH: dbPath,
            ...extraEnv
        },
        detached: true,
        stdio: "ignore"
    });
    child.unref();
    return child;
};

const isAlive = pid => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const waitForExit = async (pid, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isAlive(pid)) return true;
        await sleep(250);
    }
    return !isAlive(pid);
};

// A dead process does not always mean an immediately re-bindable port. index.ts has no
// EADDRINUSE handler on its listener (an unhandled 'error' event there takes the process down
// outright), so confirm the port is actually free before spawning anything onto it.
const isPortFree = () =>
    new Promise(resolve => {
        const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
        const settle = free => {
            socket.destroy();
            resolve(free);
        };
        socket.once("connect", () => settle(false));
        socket.once("error", () => settle(true));
        socket.setTimeout(1000, () => settle(true));
    });

const waitForPortFree = async (timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortFree()) return true;
        await sleep(250);
    }
    return false;
};

// Readiness, not liveness — the single most important change in this script. GET /api/health used
// to answer a flat {status:"ok"} the instant the HTTP listener bound, which happens BEFORE
// server/index.ts's initializeDatabase() has run migrations and seeds (it is deliberately not
// awaited) and even when that step then throws and exits the process. Waiting on that answer meant
// this updater declared success, self-updated and exited while the new build was busy failing to
// start — leaving current-version.txt pointing at something that cannot boot, with the rollback
// below structurally unable to fire. It now waits for `ready: true` plus a matching `version`.
//
// Two extra guards: an early exit of the spawned process fails immediately rather than burning the
// whole timeout, and a build whose /api/health predates the `ready` field falls back to liveness
// (that's all such a build can offer, and it's exactly what this script used to do everywhere).
const waitForReady = async (child, expectedVersion, timeoutMs = READY_TIMEOUT_MS) => {
    let exited = false;
    if (child) child.once("exit", () => (exited = true));

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (exited) return false;
        try {
            const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                const body = await res.json().catch(() => null);
                if (!body || body.ready === undefined) return true; // pre-readiness build
                if (body.ready === true && (!body.version || !expectedVersion || body.version === expectedVersion)) return true;
            }
        } catch {
            // not up yet — keep polling
        }
        await sleep(500);
    }
    return false;
};

// Best-effort free-space guard. A full update payload is ~500 MB compressed and lands as roughly
// 1.3 GB on disk once the bundled Node runtime and node_modules are extracted; running out of room
// partway through is a confusing failure to diagnose from the app's side. Never blocks the update
// on its own uncertainty: if statfs isn't available or the server didn't send a content-length, we
// simply proceed as before.
const ensureFreeSpace = requiredBytes => {
    if (!requiredBytes) return;
    let free;
    try {
        const stats = fs.statfsSync(versionsDir);
        free = stats.bavail * stats.bsize;
    } catch {
        return;
    }
    if (free >= requiredBytes) return;
    const gb = bytes => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    throw new Error(`not enough free disk space: need about ${gb(requiredBytes)} to install v${targetVersion}, only ${gb(free)} available`);
};

const cleanupDownload = () => fs.rmSync(downloadPath, { force: true });

async function downloadZip() {
    writeStatus(root, { phase: "downloading", pct: 0, targetVersion });
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);

    const total = Number(res.headers.get("content-length") || 0);
    // The zip itself, plus room for what it extracts to (~3x for a full payload) — checked before
    // a single byte is written, so a doomed update fails in seconds instead of half an hour in.
    ensureFreeSpace(total * 4);

    fs.mkdirSync(versionsDir, { recursive: true });
    const out = fs.createWriteStream(downloadPath);
    const nodeStream = Readable.fromWeb(res.body);

    let received = 0;
    let lastReported = -1;
    nodeStream.on("data", chunk => {
        received += chunk.length;
        if (total > 0) {
            const pct = Math.round((received / total) * 100);
            if (pct !== lastReported) {
                lastReported = pct;
                writeStatus(root, { phase: "downloading", pct, targetVersion });
            }
        }
    });

    await finished(nodeStream.pipe(out));
}

function verifyDigest() {
    writeStatus(root, { phase: "verifying", targetVersion });
    const [algo, expectedHex] = expectedDigest.split(":");
    if (algo !== "sha256") throw new Error(`unsupported digest algorithm: ${algo}`);
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(downloadPath));
    const actualHex = hash.digest("hex");
    if (actualHex !== expectedHex) {
        throw new Error(`digest mismatch: expected ${expectedHex}, got ${actualHex}`);
    }
}

function extractZip() {
    writeStatus(root, { phase: "extracting", targetVersion });
    fs.rmSync(newVersionDir, { recursive: true, force: true });
    fs.mkdirSync(newVersionDir, { recursive: true });
    if (isWindows) {
        // Expand-Archive is dramatically slower than calling .NET's ZipFile API directly — its
        // per-entry cmdlet/pipeline overhead dominates once an archive has tens of thousands of
        // small files, which this one does (bundled Node runtime + a full node_modules). Measured
        // 10+ minutes for a real ~55k-file update payload with Expand-Archive; ExtractToDirectory
        // does the same extraction in seconds. newVersionDir is freshly rm'd+mkdir'd just above,
        // so the two-arg (no-overwrite) overload — the only one available under Windows
        // PowerShell 5.1's bundled .NET Framework, unlike pwsh's .NET Core — is safe to use as-is.
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(downloadPath)}, ${psQuote(newVersionDir)})`
            ],
            { stdio: "ignore" }
        );
    } else {
        // -o overwrite, -q quiet — the download zip's top-level entries are node/ and app/
        // directly (see build-portable.mjs's zipUpdatePayload), same shape the Windows extract
        // above produces, so nothing else here needs to branch on platform. A LEAN zip (see
        // copyForwardUnchangedDeps below) only has app/ minus node_modules — unzip handles that
        // identically, it just extracts fewer entries.
        execFileSync("/usr/bin/unzip", ["-o", "-q", downloadPath, "-d", newVersionDir], { stdio: "ignore" });
    }
}

// A "lean" update zip (build-portable.mjs's zipUpdatePayload, when node/node_modules are
// unchanged since the last release per its checked-in baseline) ships app/ only, minus
// node_modules — no node/ at all. Detected here purely by absence, not a flag anywhere: if the
// extract above didn't produce a node/ dir or an app/node_modules dir, copy both forward from
// whichever version is currently installed and running (readCurrentVersion() — guaranteed to
// still be on disk, since pruning below only ever runs after a *successful* boot and always keeps
// the version we came from). A full zip leaves both already present post-extract, so this is a
// no-op in that case. Must run before applyMacPostExtractFixups, which assumes node/ already
// exists.
function copyForwardUnchangedDeps() {
    const previousVersionDir = path.join(versionsDir, readCurrentVersion());
    const newNodeDir = path.join(newVersionDir, "node");
    const newNodeModulesDir = path.join(newVersionDir, "app", "node_modules");

    if (!fs.existsSync(newNodeDir)) {
        writeStatus(root, { phase: "extracting", targetVersion, detail: "copying unchanged Node runtime forward" });
        fs.cpSync(path.join(previousVersionDir, "node"), newNodeDir, { recursive: true });
    }
    if (!fs.existsSync(newNodeModulesDir)) {
        writeStatus(root, { phase: "extracting", targetVersion, detail: "copying unchanged node_modules forward" });
        fs.cpSync(path.join(previousVersionDir, "app", "node_modules"), newNodeModulesDir, { recursive: true });
    }
}

// Split out from extractZip so it always runs after copyForwardUnchangedDeps has guaranteed
// node/ actually exists — a lean zip's own extract step never produces it directly.
function applyMacPostExtractFixups() {
    if (isWindows) return;
    // fs.cpSync-style POSIX mode bits generally survive a zip round-trip (and a plain fs.cpSync
    // copy-forward), but make the one binary that actually needs +x to run at all a hard guarantee
    // rather than an assumption (mirrors build-portable.mjs's own belt-and-suspenders chmod after
    // assembling a version).
    fs.chmodSync(nodeBinaryFor(newVersionDir), 0o755);
    // Quarantine can otherwise re-attach to the freshly-extracted binary/app bundle on darwin and
    // trip Gatekeeper on next launch — best-effort, ignore if xattr isn't present or the files were
    // never quarantined in the first place (e.g. downloaded over a non-Safari path, or copied
    // forward from an already-cleared previous version).
    try {
        execFileSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", newVersionDir], { stdio: "ignore" });
    } catch {
        // not quarantined, or xattr unavailable — non-fatal
    }
}

function sanityCheckExtracted() {
    if (!fs.existsSync(nodeBinaryFor(newVersionDir)) || !fs.existsSync(indexJsFor(newVersionDir))) {
        throw new Error(`extracted version is missing ${isWindows ? "node.exe" : "node/bin/node"} or dist/server/server/index.js`);
    }
}

// Stop the running server the *clean* way where we can. Previously this was a bare
// process.kill(oldPid): on Windows — the primary portable target — libuv maps every signal to
// TerminateProcess, so index.ts's SIGTERM handler never ran and an update silently skipped the
// Manuscript Failsafe Save pass and severed in-flight agent jobs mid-write. Asking the server to
// shut itself down (POST /api/update/prepare-shutdown, authenticated by the single-use token
// minted for this run) gives it the same clean stop as any other, on every platform. Signals stay
// as the fallback for a server that is wedged or predates that route.
//
// Throws rather than pressing on if the old process refuses to die: at this point in main() the
// current-version.txt pointer has NOT been flipped, so throwing is completely non-destructive —
// far better than spawning a second server onto a port the first one still holds.
async function stopOld(previousVersion) {
    writeStatus(root, { phase: "stopping", targetVersion, detail: "saving your work and stopping the running version" });

    if (!isAlive(oldPid)) {
        await waitForPortFree();
        return;
    }

    if (shutdownToken) {
        let accepted = false;
        try {
            const res = await fetch(`http://localhost:${port}/api/update/prepare-shutdown`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: shutdownToken }),
                signal: AbortSignal.timeout(5000)
            });
            accepted = res.ok;
        } catch {
            // route missing, or the server is already too busy/wedged to answer — fall through
        }
        if (accepted && (await waitForExit(oldPid, GRACEFUL_STOP_TIMEOUT_MS))) {
            await waitForPortFree();
            return;
        }
    }

    try {
        process.kill(oldPid);
    } catch {
        // already gone
    }
    if (!(await waitForExit(oldPid, 10_000))) {
        try {
            process.kill(oldPid, "SIGKILL");
        } catch {
            // already gone
        }
        if (!(await waitForExit(oldPid, 10_000))) {
            throw new Error(`the running v${previousVersion} server (pid ${oldPid}) wouldn't stop — nothing on disk has been changed`);
        }
    }
    await waitForPortFree();
}

// Snapshot the SQLite database (and its WAL/SHM sidecars) before the new version gets a chance to
// migrate it. Runs only after stopOld() has confirmed nothing holds the file, so a plain file copy
// is a consistent snapshot — copying the three files together preserves whatever the WAL still
// holds, and SQLite replays it on next open. Deliberately not `VACUUM INTO` or the backup API:
// this script must stay dependency-free, and better-sqlite3 is a native module.
//
// This is the piece that makes "roll the code back" actually mean "roll the install back":
// migrations are forward-only, so without it a failed update leaves old code against a newer
// schema. Kept afterwards too (last KEEP_DB_BACKUPS), as a plain, openable file — the same
// disaster-recovery posture as data/manuscript-backups.
function backupDatabase(previousVersion) {
    if (!fs.existsSync(dbPath)) return null;
    writeStatus(root, { phase: "backing-up", targetVersion, detail: "backing up your database" });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(backupsDir, `pre-update-v${previousVersion}-to-v${targetVersion}-${stamp}`);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(dbPath);
    for (const suffix of ["", "-wal", "-shm"]) {
        const from = `${dbPath}${suffix}`;
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, `${base}${suffix}`));
    }
    return dir;
}

function restoreDatabase(backupDir) {
    if (!backupDir) return false;
    const base = path.basename(dbPath);
    if (!fs.existsSync(path.join(backupDir, base))) return false;

    // Clear the live sidecars first: a stale -wal left over from the failed new version would
    // otherwise be replayed on top of the restored database file, which is exactly the corruption
    // this whole step exists to prevent.
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
    for (const suffix of ["", "-wal", "-shm"]) {
        const from = path.join(backupDir, `${base}${suffix}`);
        if (fs.existsSync(from)) fs.copyFileSync(from, `${dbPath}${suffix}`);
    }
    return true;
}

function pruneDatabaseBackups() {
    if (!fs.existsSync(backupsDir)) return;
    const entries = fs
        .readdirSync(backupsDir)
        .filter(name => name.startsWith("pre-update-"))
        .map(name => {
            const full = path.join(backupsDir, name);
            try {
                const stats = fs.statSync(full);
                return stats.isDirectory() ? { full, mtime: stats.mtimeMs } : null;
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime);

    for (const stale of entries.slice(KEEP_DB_BACKUPS)) {
        try {
            fs.rmSync(stale.full, { recursive: true, force: true });
        } catch {
            // a locked/again-in-use backup dir is not worth failing a successful update over
        }
    }
}

// Every version folder is ~1.3 GB extracted and nothing used to remove them, so a handful of
// updates could quietly fill a small SSD. Runs only after the new version has proved it boots, and
// always keeps the version we came from so a manual fallback (edit current-version.txt) stays
// possible. Also sweeps `.download-*.zip` leftovers from earlier failed attempts — those used to
// be deleted only on the success path, stranding ~500 MB per failure.
function pruneOldVersions(keep) {
    for (const name of fs.readdirSync(versionsDir)) {
        const full = path.join(versionsDir, name);
        if (name.startsWith(".")) {
            if (/^\.download-.*\.zip$/.test(name)) fs.rmSync(full, { force: true });
            continue;
        }
        if (keep.includes(name) || !/^\d+\.\d+\.\d+$/.test(name)) continue;
        try {
            fs.rmSync(full, { recursive: true, force: true });
        } catch {
            // still locked by something — it'll be swept on a later update
        }
    }
}

function copyUpdaterSelfUpdate() {
    // On success only: let this release's copy of the updater become the one that runs next time,
    // without ever needing to replace itself mid-run.
    const updaterSrc = path.join(newVersionDir, "app", "updater-src");
    const updaterDest = path.join(root, "updater");
    if (fs.existsSync(updaterSrc)) {
        fs.cpSync(updaterSrc, updaterDest, { recursive: true, force: true });
    }
}

// The launcher script and README are laid down once, by build-portable.mjs's from-scratch branch,
// and were previously unreachable forever after — an install could never receive a launcher fix
// (a new env var, a changed default port) no matter how many updates it took. Each release now
// carries its own copies in app/launcher-src/ and this refreshes them post-boot.
//
// Strictly best-effort, and only when the content actually differs: the very launcher that started
// the old server may still be open in cmd.exe/Terminal and holding a lock. Failing to refresh it
// just means keeping the one that already works, which is exactly the old behaviour.
function refreshLauncherAssets() {
    const src = path.join(newVersionDir, "app", "launcher-src");
    if (!fs.existsSync(src)) return;
    for (const name of fs.readdirSync(src)) {
        try {
            const incoming = fs.readFileSync(path.join(src, name));
            const dest = path.join(root, name);
            if (fs.existsSync(dest) && fs.readFileSync(dest).equals(incoming)) continue;
            fs.writeFileSync(dest, incoming);
            if (!isWindows && name.endsWith(".command")) fs.chmodSync(dest, 0o755);
        } catch {
            // locked or unreadable — leave the existing launcher alone
        }
    }
}

async function stopChild(child) {
    if (!child || !child.pid || !isAlive(child.pid)) return;
    try {
        process.kill(child.pid);
    } catch {
        // already gone
    }
    if (!(await waitForExit(child.pid, 10_000))) {
        try {
            process.kill(child.pid, "SIGKILL");
        } catch {
            // already gone
        }
        await waitForExit(child.pid, 10_000);
    }
}

// Boot-failure rollback. The old version's files were never touched, so restoring it is only a
// matter of putting the database back the way it was, flipping the pointer and starting it —
// but the failed new server has to be stopped first: it may simply have been slow rather than
// broken, and two servers sharing one SQLite file (and racing for one port) is a far worse
// outcome than the failure being rolled back.
async function rollback(child, previousVersion, backupDir) {
    writeStatus(root, { phase: "rolling-back", targetVersion, previousVersion });

    await stopChild(child);
    await waitForPortFree();
    const restored = restoreDatabase(backupDir);
    fs.writeFileSync(currentVersionFile, previousVersion);

    const old = spawnServer(path.join(versionsDir, previousVersion));
    const oldHealthy = await waitForReady(old, previousVersion);

    const dbNote = restored
        ? " Your database was restored from the pre-update backup."
        : backupDir
          ? ` Your pre-update database backup is at ${backupDir}.`
          : "";
    writeStatus(root, {
        phase: "error",
        targetVersion,
        previousVersion,
        rolledBack: true,
        backupPath: backupDir ?? undefined,
        message: oldHealthy
            ? `v${targetVersion} failed to start — rolled back to v${previousVersion}.${dbNote}`
            : `v${targetVersion} failed to start, and the rollback to v${previousVersion} also failed to respond — manual intervention needed.${dbNote}`
    });
}

async function main() {
    const previousVersion = readCurrentVersion();
    // Defense in depth against the route's own isNewerVersion check: extractZip() starts by
    // rm -rf'ing versions/<target>/, which for target === current would delete the very version
    // that is running right now.
    if (previousVersion === targetVersion) {
        throw new Error(`refusing to update v${previousVersion} to itself`);
    }

    await downloadZip();
    verifyDigest();
    extractZip();
    copyForwardUnchangedDeps();
    applyMacPostExtractFixups();
    sanityCheckExtracted();
    cleanupDownload();

    // Everything above is non-destructive and reversible by doing nothing. Everything below
    // changes the running install, in this order specifically: stop cleanly, snapshot the data,
    // then and only then flip the pointer.
    await stopOld(previousVersion);
    const backupDir = backupDatabase(previousVersion);

    writeStatus(root, { phase: "restarting", targetVersion });
    fs.writeFileSync(currentVersionFile, targetVersion);
    const child = spawnServer(newVersionDir);

    if (!(await waitForReady(child, targetVersion))) {
        await rollback(child, previousVersion, backupDir);
        return;
    }

    copyUpdaterSelfUpdate();
    refreshLauncherAssets();
    pruneOldVersions([targetVersion, previousVersion]);
    pruneDatabaseBackups();
    writeStatus(root, { phase: "done", targetVersion, previousVersion, backupPath: backupDir ?? undefined });
}

main().catch(error => {
    // Anything that threw before we wrote current-version.txt leaves the running old server and
    // every existing version folder completely untouched — this is the common failure path
    // (bad download, digest mismatch, corrupt zip, not enough disk) and the safest one.
    console.error("[update-runner] failed:", error);
    cleanupDownload();
    writeStatus(root, { phase: "error", targetVersion, message: error instanceof Error ? error.message : String(error) });
});
