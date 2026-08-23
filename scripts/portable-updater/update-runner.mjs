// Story Labyrinth portable-build self-updater. Deliberately dependency-free (Node built-ins
// only — no npm install of its own, ever) so it's immune to the exact ABI-mismatch bug
// build-portable.mjs's own PATH fix addresses for the *app*; this script never touches a
// native module.
//
// Invoked as a DETACHED child process by the running server's POST /api/update/start handler
// (server/routes/update.ts), which then keeps running and answers GET /api/update/status by
// reading the shared status file this script writes to (lib/statusFile.mjs) — the two
// processes have no other way to talk, since this script outlives the request that spawned it
// and, partway through, kills that very process.
//
// Design invariant (see docs/CURRENT_BACKLOG.md-adjacent plan doc): this script NEVER writes
// into an existing versions/<x>/ folder. It only ever creates a brand-new one and, on success,
// flips the one-line current-version.txt pointer. That means every failure mode up to and
// including a bad download or a corrupt zip leaves the currently-running old version completely
// untouched — there is no "wait for the running .exe to release its file handles" problem to
// solve, because we never try to overwrite it.
//
// Usage:
//   node update-runner.mjs --root=<portableRoot> --platform=<win-x64|mac-arm64|mac-x64>
//     --target-version=<x.y.z> --download-url=<url> --digest=sha256:<hex> --old-pid=<pid>
//     --port=<port>

import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import path from "node:path";
import { readStatus, writeStatus } from "./lib/statusFile.mjs";

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

// Single choke point for "where's the node binary for this version" — matches server/routes/
// update.ts's own nodeBinaryFor helper (kept as two small copies rather than a shared import,
// since this script is deliberately dependency-free / no relative import outside its own tree,
// while update.ts's copy lives inside the TS server build). darwin ships the official
// node/bin/node tarball layout; win ships node/node.exe directly.
const nodeBinaryFor = versionDir => (isWindows ? path.join(versionDir, "node", "node.exe") : path.join(versionDir, "node", "bin", "node"));
const indexJsFor = versionDir => path.join(versionDir, "app", "dist", "server", "server", "index.js");

const readCurrentVersion = () => fs.readFileSync(currentVersionFile, "utf8").trim();

const spawnServer = (versionDir, extraEnv = {}) =>
    spawn(nodeBinaryFor(versionDir), [indexJsFor(versionDir)], {
        cwd: root,
        env: {
            ...process.env,
            NODE_ENV: "production",
            PORTABLE_BUILD: "1",
            PORTABLE_PLATFORM: platform,
            PORT: port,
            DATABASE_PATH: path.join(root, "data", "story-labyrinth.db"),
            ...extraEnv
        },
        detached: true,
        stdio: "ignore"
    }).unref();

const isAlive = pid => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const waitForHealth = async (timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
            if (res.ok) return true;
        } catch {
            // not up yet — keep polling
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
};

async function downloadZip() {
    writeStatus(root, { phase: "downloading", pct: 0, targetVersion });
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);

    const total = Number(res.headers.get("content-length") || 0);
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
        execFileSync(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${downloadPath}' -DestinationPath '${newVersionDir}' -Force`],
            { stdio: "ignore" }
        );
    } else {
        // -o overwrite, -q quiet — the download zip's top-level entries are node/ and app/
        // directly (see build-portable.mjs's zipUpdatePayload), same shape Expand-Archive above
        // produces, so nothing else here needs to branch on platform.
        execFileSync("/usr/bin/unzip", ["-o", "-q", downloadPath, "-d", newVersionDir], { stdio: "ignore" });
        // fs.cpSync-style POSIX mode bits generally survive a zip round-trip, but make the one
        // binary that actually needs +x to run at all a hard guarantee rather than an assumption
        // (mirrors build-portable.mjs's own belt-and-suspenders chmod after assembling a version).
        fs.chmodSync(nodeBinaryFor(newVersionDir), 0o755);
        // Quarantine can otherwise re-attach to the freshly-extracted binary/app bundle on darwin
        // and trip Gatekeeper on next launch — best-effort, ignore if xattr isn't present or the
        // files were never quarantined in the first place (e.g. downloaded over a non-Safari path).
        try {
            execFileSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", newVersionDir], { stdio: "ignore" });
        } catch {
            // not quarantined, or xattr unavailable — non-fatal
        }
    }
}

function sanityCheckExtracted() {
    if (!fs.existsSync(nodeBinaryFor(newVersionDir)) || !fs.existsSync(indexJsFor(newVersionDir))) {
        throw new Error(`extracted version is missing ${isWindows ? "node.exe" : "node/bin/node"} or dist/server/server/index.js`);
    }
}

async function killOld() {
    if (!isAlive(oldPid)) return;
    try {
        process.kill(oldPid);
    } catch {
        // already gone
    }
    const deadline = Date.now() + 10_000;
    while (isAlive(oldPid) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 250));
    }
}

function copyUpdaterSelfUpdate() {
    // Last step, on success only: let this release's copy of the updater become the one that
    // runs next time, without ever needing to replace itself mid-run.
    const updaterSrc = path.join(newVersionDir, "app", "updater-src");
    const updaterDest = path.join(root, "updater");
    if (fs.existsSync(updaterSrc)) {
        fs.cpSync(updaterSrc, updaterDest, { recursive: true, force: true });
    }
}

async function main() {
    const previousVersion = readCurrentVersion();

    await downloadZip();
    verifyDigest();
    extractZip();
    sanityCheckExtracted();
    fs.rmSync(downloadPath, { force: true });

    writeStatus(root, { phase: "restarting", targetVersion });
    fs.writeFileSync(currentVersionFile, targetVersion);

    await killOld();
    spawnServer(newVersionDir);

    const healthy = await waitForHealth();
    if (!healthy) {
        // Boot-failure rollback — the old version's files were never touched, so this is safe.
        writeStatus(root, { phase: "rolling-back", targetVersion, previousVersion });
        fs.writeFileSync(currentVersionFile, previousVersion);
        spawnServer(path.join(versionsDir, previousVersion));
        const oldHealthy = await waitForHealth();
        writeStatus(root, {
            phase: "error",
            targetVersion,
            rolledBack: true,
            message: oldHealthy
                ? `v${targetVersion} failed to start — rolled back to v${previousVersion}`
                : `v${targetVersion} failed to start, and the rollback to v${previousVersion} also failed to respond — manual intervention needed`
        });
        return;
    }

    copyUpdaterSelfUpdate();
    writeStatus(root, { phase: "done", targetVersion, previousVersion });
}

main().catch(error => {
    // Anything that threw before we wrote current-version.txt leaves the running old server and
    // every existing version folder completely untouched — this is the common failure path
    // (bad download, digest mismatch, corrupt zip) and the safest one.
    console.error("[update-runner] failed:", error);
    writeStatus(root, { phase: "error", targetVersion, message: error instanceof Error ? error.message : String(error) });
});
