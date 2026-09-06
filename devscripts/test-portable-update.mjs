// End-to-end test for the portable self-updater (scripts/portable-updater/update-runner.mjs).
//
// Usage: node devscripts/test-portable-update.mjs [--scenario=happy|boot-failure] [--runner=<path>] [--keep]
//   --scenario=<id>  which case to run. Default: both, in sequence.
//   --runner=<path>  run an alternate update-runner.mjs instead of the working tree's — point it
//                    at a copy extracted from git (`git show <ref>:scripts/portable-updater/
//                    update-runner.mjs > /tmp/old.mjs`) to prove a regression, or to confirm a fix
//                    actually changes the outcome.
//   --keep           leave the scratch install on disk for inspection instead of deleting it.
//
// Why this exists: the update path is the one code path in this project that can destroy a user's
// install — it stops their server, migrates their database and repoints the launcher — and it is
// otherwise only exercisable by cutting a real GitHub release and updating onto it. So this builds
// a miniature portable install in a temp dir (the real versions/<ver>/{node,app} layout, a bundled
// copy of this host's own node binary, and a stub server standing in for dist/server/server/
// index.js), serves it a real LEAN update payload over local HTTP, and runs the REAL updater
// against it — no mocking of the updater itself.
//
// The stub server implements exactly the three behaviours the updater depends on:
//   * GET  /api/health              — reports { status, ready, version }, with `ready` flipping
//                                     true a beat AFTER the port binds (server/index.ts does not
//                                     await initializeDatabase() before app.listen(), so this gap
//                                     is real, not artificial).
//   * POST /api/update/prepare-shutdown — token-gated clean stop, which logs a marker. That marker
//                                     is the proof the graceful path ran: on Windows a
//                                     process.kill() would have skipped it entirely.
//   * "migrating" the database on boot, and — in the boot-failure scenario — binding the port,
//     mutating the database, and only THEN exiting non-zero. That is the shape of a failing
//     migration from outside, and it is what a liveness-only health check used to mistake for a
//     successful update.
//
// Runs on win32 and darwin only, matching scripts/build-portable.mjs's own host gate — a portable
// build's native modules can't be cross-installed, and neither can its layout be faithfully faked.

import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const args = Object.fromEntries(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.replace(/^--/, "").split("=");
        return [key, rest.length ? rest.join("=") : true];
    })
);

const CURRENT = "1.0.0";
const STALE = "0.9.0"; // an older version lying around, which a successful update should prune
const TARGET = "1.0.1";

const log = message => console.log(`[update-test] ${message}`);
const fail = message => {
    console.error(`[update-test] FAILED: ${message}`);
    process.exit(1);
};

const platformId =
    process.platform === "win32" ? "win-x64" : process.platform === "darwin" ? (process.arch === "arm64" ? "mac-arm64" : "mac-x64") : null;
if (!platformId) fail(`unsupported host OS "${process.platform}" — this test runs on win32 or darwin (same gate as build-portable.mjs)`);
const isWindows = platformId === "win-x64";

const runnerPath = typeof args.runner === "string" ? path.resolve(args.runner) : path.join(repoRoot, "scripts", "portable-updater", "update-runner.mjs");
if (!fs.existsSync(runnerPath)) fail(`no update-runner.mjs at ${runnerPath}`);

const nodeBinaryRelPath = isWindows ? ["node", "node.exe"] : ["node", "bin", "node"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const freePort = () =>
    new Promise(resolve => {
        const probe = net.createServer();
        probe.listen(0, "127.0.0.1", () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });

// --- the stub server ---------------------------------------------------------------------------

const stubServer = (version, { migrates = false, failsAfterBinding = false } = {}) => `
import fs from "node:fs";
import http from "node:http";

const VERSION = ${JSON.stringify(version)};
const root = process.cwd();
const dbPath = process.env.DATABASE_PATH;
const mark = event => fs.appendFileSync(root + "/events.log", event + "\\n");

fs.appendFileSync(root + "/pids.log", process.pid + "\\n");
mark("boot:" + VERSION);

// Stands in for runMigrations() — a write to the user's database that the pre-update snapshot has
// to be able to undo.
${
    migrates
        ? `fs.writeFileSync(dbPath, "MIGRATED-BY-" + VERSION);
fs.writeFileSync(dbPath + "-wal", "WAL-FROM-" + VERSION);
mark("migrated:" + VERSION);`
        : ""
}

let ready = false;

const server = http.createServer((req, res) => {
    if (req.url === "/api/health") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ status: "ok", ready, version: VERSION }));
        return;
    }
    if (req.method === "POST" && req.url === "/api/update/prepare-shutdown") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", () => {
            let token = null;
            try {
                token = JSON.parse(body || "{}").token;
            } catch {}
            if (token !== process.env.EXPECTED_TOKEN) {
                res.statusCode = 403;
                res.end("{}");
                return;
            }
            res.end(JSON.stringify({ ok: true }));
            // The marker that proves a CLEAN stop happened. A TerminateProcess-style kill can
            // never produce it, which is the whole point.
            setTimeout(() => {
                mark("graceful-shutdown:" + VERSION);
                server.close();
                process.exit(0);
            }, 100);
        });
        return;
    }
    res.statusCode = 404;
    res.end("{}");
});

process.on("SIGTERM", () => {
    mark("sigterm:" + VERSION);
    process.exit(0);
});

server.listen(process.env.PORT, () => {
    mark("listening:" + VERSION);
    ${
        failsAfterBinding
            ? `setTimeout(() => { mark("boot-failed:" + VERSION); process.exit(1); }, 1500);`
            : `setTimeout(() => { ready = true; mark("ready:" + VERSION); }, 1200);`
    }
});
`;

// --- building the miniature install --------------------------------------------------------------

const writeVersion = (versionsDir, version, stubOptions, { withNode, withNodeModules }) => {
    const appDist = path.join(versionsDir, version, "app", "dist", "server", "server");
    fs.mkdirSync(appDist, { recursive: true });
    fs.writeFileSync(path.join(appDist, "index.js"), stubServer(version, stubOptions));
    if (withNodeModules) {
        const nodeModules = path.join(versionsDir, version, "app", "node_modules");
        fs.mkdirSync(nodeModules, { recursive: true });
        fs.writeFileSync(path.join(nodeModules, ".keep"), "");
    }
    if (withNode) {
        const binary = path.join(versionsDir, version, ...nodeBinaryRelPath);
        fs.mkdirSync(path.dirname(binary), { recursive: true });
        fs.copyFileSync(process.execPath, binary);
        if (!isWindows) fs.chmodSync(binary, 0o755);
    }
};

// Deliberately a LEAN payload (app/ only — no node/, no node_modules), so the copy-forward path
// build-portable.mjs's lean/full split relies on is exercised on every run rather than only when
// a release happens to qualify for it.
const buildPayload = (stageDir, failsAfterBinding) => {
    fs.rmSync(stageDir, { recursive: true, force: true });
    const appDist = path.join(stageDir, "app", "dist", "server", "server");
    fs.mkdirSync(appDist, { recursive: true });
    fs.writeFileSync(path.join(appDist, "index.js"), stubServer(TARGET, { migrates: true, failsAfterBinding }));

    // Shipped alongside the app since this release, so the updater's self-update and
    // launcher-refresh steps are covered too.
    fs.cpSync(path.join(repoRoot, "scripts", "portable-updater"), path.join(stageDir, "app", "updater-src"), { recursive: true });
    fs.mkdirSync(path.join(stageDir, "app", "launcher-src"), { recursive: true });
    fs.writeFileSync(path.join(stageDir, "app", "launcher-src", "README.txt"), "REFRESHED-README");

    const zipPath = path.join(stageDir, "payload.zip");
    if (isWindows) {
        execFileSync("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Compress-Archive -Path '${path.join(stageDir, "app").replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Fastest`
        ]);
    } else {
        execFileSync("zip", ["-ryq", zipPath, "app"], { cwd: stageDir });
    }
    return zipPath;
};

// --- assertions -----------------------------------------------------------------------------------

const makeChecker = () => {
    const results = [];
    return {
        check(label, actual, expected) {
            const pass = typeof expected === "function" ? expected(actual) : JSON.stringify(actual) === JSON.stringify(expected);
            results.push({ label, pass, actual, expected });
            const mark = pass ? "PASS" : "FAIL";
            const detail = pass ? "" : `\n         expected ${typeof expected === "function" ? "(predicate)" : JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
            console.log(`  [${mark}] ${label}${detail}`);
        },
        failures: () => results.filter(r => !r.pass).length
    };
};

// --- one scenario ------------------------------------------------------------------------------------

async function runScenario(scenario) {
    const isFailureCase = scenario === "boot-failure";
    console.log(`\n=== scenario: ${scenario} ===`);

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `sl-update-${scenario}-`));
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), `sl-payload-${scenario}-`));
    const versionsDir = path.join(rootDir, "versions");
    const dbPath = path.join(rootDir, "data", "story-labyrinth.db");
    const appPort = await freePort();
    const zipPort = await freePort();
    const token = crypto.randomBytes(16).toString("hex");

    fs.mkdirSync(versionsDir, { recursive: true });
    fs.mkdirSync(path.join(rootDir, "data"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "current-version.txt"), CURRENT);
    fs.writeFileSync(dbPath, "ORIGINAL-DB-CONTENT");
    fs.writeFileSync(`${dbPath}-wal`, "ORIGINAL-WAL");
    // The running version never touches the database itself — only the incoming one "migrates",
    // so any change to these files is unambiguously the new version's doing.
    writeVersion(versionsDir, CURRENT, {}, { withNode: true, withNodeModules: true });
    writeVersion(versionsDir, STALE, {}, { withNode: false, withNodeModules: false });
    fs.writeFileSync(path.join(versionsDir, ".download-0.9.9.zip"), "stranded-by-an-earlier-failure");
    fs.cpSync(path.join(repoRoot, "scripts", "portable-updater"), path.join(rootDir, "updater"), { recursive: true });
    fs.copyFileSync(runnerPath, path.join(rootDir, "updater", "update-runner.mjs"));

    const zipPath = buildPayload(stageDir, isFailureCase);
    const digest = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex")}`;
    log(`payload: ${fs.statSync(zipPath).size} bytes, ${digest.slice(0, 24)}…`);

    const zipServer = http.createServer((_req, res) => {
        const buffer = fs.readFileSync(zipPath);
        res.setHeader("content-length", String(buffer.length));
        res.end(buffer);
    });
    await new Promise(resolve => zipServer.listen(zipPort, "127.0.0.1", resolve));

    const serverEnv = { ...process.env, PORT: String(appPort), DATABASE_PATH: dbPath, EXPECTED_TOKEN: token };
    const oldServer = spawn(
        path.join(versionsDir, CURRENT, ...nodeBinaryRelPath),
        [path.join(versionsDir, CURRENT, "app", "dist", "server", "server", "index.js")],
        { cwd: rootDir, env: serverEnv, stdio: "ignore" }
    );
    await sleep(2000);
    log(`v${CURRENT} running on :${appPort} as pid ${oldServer.pid}`);

    const started = Date.now();
    const runner = spawn(
        process.execPath,
        [
            path.join(rootDir, "updater", "update-runner.mjs"),
            `--root=${rootDir}`,
            `--platform=${platformId}`,
            `--target-version=${TARGET}`,
            `--download-url=http://127.0.0.1:${zipPort}/payload.zip`,
            `--digest=${digest}`,
            `--old-pid=${oldServer.pid}`,
            `--port=${appPort}`,
            `--shutdown-token=${token}`,
            `--db-path=${dbPath}`
        ],
        { stdio: "inherit", env: { ...process.env, EXPECTED_TOKEN: token } }
    );
    await new Promise(resolve => runner.once("exit", resolve));
    const elapsedSeconds = (Date.now() - started) / 1000;
    log(`updater exited after ${elapsedSeconds.toFixed(1)}s`);

    // --- observe ---------------------------------------------------------------------------------
    const read = file => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
    const status = JSON.parse(read(path.join(versionsDir, ".update-status.json")) || "{}");
    const events = (read(path.join(rootDir, "events.log")) || "").trim().split("\n").filter(Boolean);
    const backupsDir = path.join(rootDir, "data", "backups");
    const backups = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : [];
    const versionsOnDisk = fs.readdirSync(versionsDir).filter(name => /^\d+\.\d+\.\d+$/.test(name));

    let health = null;
    try {
        const res = await fetch(`http://127.0.0.1:${appPort}/api/health`, { signal: AbortSignal.timeout(3000) });
        health = await res.json();
    } catch {
        health = null;
    }

    // --- assert ----------------------------------------------------------------------------------
    const { check, failures } = makeChecker();
    const expectedVersion = isFailureCase ? CURRENT : TARGET;

    check("a server is answering", health !== null, true);
    check("serving version", health?.version, expectedVersion);
    check("server is ready", health?.ready, true);
    check("current-version.txt", read(path.join(rootDir, "current-version.txt")), expectedVersion);
    check("old version stopped cleanly (not force-killed)", events.includes(`graceful-shutdown:${CURRENT}`), true);
    check("new version really did migrate the database", events.includes(`migrated:${TARGET}`), true);
    check("a pre-update database backup was taken", backups.length, 1);
    check("target download cleaned up", fs.existsSync(path.join(versionsDir, `.download-${TARGET}.zip`)), false);

    if (isFailureCase) {
        check("status phase", status.phase, "error");
        check("status reports a rollback", status.rolledBack, true);
        check("status names the backup", typeof status.backupPath === "string", true);
        check("new version was seen to fail", events.includes(`boot-failed:${TARGET}`), true);
        // The headline data-safety property: the new version wrote to the database, then died, and
        // the rollback put the user's data back exactly as it was.
        check("database restored to pre-update content", read(dbPath), "ORIGINAL-DB-CONTENT");
        check("database -wal restored too", read(`${dbPath}-wal`), "ORIGINAL-WAL");
        check("rolled-back version is running again", events.lastIndexOf(`ready:${CURRENT}`) > events.indexOf(`boot-failed:${TARGET}`), true);
        // Fails fast off the spawned process's exit instead of burning the full ready timeout.
        check("failed fast rather than waiting out the timeout", elapsedSeconds < 60, true);
        // Cleanup is a reward for success only — a failed update must not tidy away the evidence.
        check("old versions NOT pruned after a failure", versionsOnDisk.includes(STALE), true);
    } else {
        check("status phase", status.phase, "done");
        check("database keeps the new version's migration", read(dbPath), `MIGRATED-BY-${TARGET}`);
        check("stale version pruned", versionsOnDisk.includes(STALE), false);
        check("previous version kept for manual fallback", versionsOnDisk.includes(CURRENT), true);
        check("stranded download from an earlier failure swept", fs.existsSync(path.join(versionsDir, ".download-0.9.9.zip")), false);
        check("launcher assets refreshed from the payload", read(path.join(rootDir, "README.txt")), "REFRESHED-README");
        check("updater self-updated", fs.existsSync(path.join(rootDir, "updater", "update-runner.mjs")), true);
    }

    // --- tear down --------------------------------------------------------------------------------
    zipServer.close();
    for (const pid of (read(path.join(rootDir, "pids.log")) || "").trim().split("\n").filter(Boolean)) {
        try {
            process.kill(Number(pid));
        } catch {
            // already gone
        }
    }
    await sleep(500);
    if (args.keep) {
        log(`kept: ${rootDir}`);
    } else {
        for (const dir of [rootDir, stageDir]) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch {
                // a just-exited process can briefly hold a handle on Windows — it's in the temp dir
            }
        }
    }

    return failures();
}

// --- entry point ---------------------------------------------------------------------------------

const scenarios = typeof args.scenario === "string" ? [args.scenario] : ["happy", "boot-failure"];
for (const scenario of scenarios) {
    if (scenario !== "happy" && scenario !== "boot-failure") fail(`unknown --scenario=${scenario} (happy|boot-failure)`);
}

log(`runner under test: ${path.relative(repoRoot, runnerPath) || runnerPath}`);
let totalFailures = 0;
for (const scenario of scenarios) totalFailures += await runScenario(scenario);

console.log("");
if (totalFailures > 0) fail(`${totalFailures} assertion(s) failed`);
log(`all scenarios passed (${scenarios.join(", ")})`);
