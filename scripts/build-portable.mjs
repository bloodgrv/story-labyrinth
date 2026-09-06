// Builds a Story Labyrinth portable release: a bundled Node runtime + production app code + an
// empty data/ folder, laid out as scripts/portable-updater's self-updater expects. See
// docs/Mac_Portable_Design.md for the full cross-platform design (MP0-MP5); this script covers
// MP0 (win-x64, two-zip split) and MP1/MP2 (mac-arm64/mac-x64 builder + launcher + README).
//
// Usage: node scripts/build-portable.mjs [--platform=win-x64|mac-arm64|mac-x64] [--skip-build] [--out=<dir>]
//   --platform=<id>   which portable to build. Defaults to win-x64 on a Windows host, or
//                     mac-arm64/mac-x64 on a Mac host (by arch) — must be passed explicitly on
//                     any other host. mac-* builds refuse to run on non-darwin (see below).
//   --skip-build      reuse the existing dist/ instead of running `npm run build` again (fast
//                     iteration only — never use this for a real release)
//   --out=<dir>       output root (default: portable-build/ at repo root)
//
// Every run adds a new versions/<version>/ folder. A from-scratch run (no existing --out dir)
// also lays down the stable scaffold (launcher, README.txt, current-version.txt, updater/).
// Rebuilding into an existing --out dir never touches current-version.txt or other versions —
// that's the running self-updater's job, not this script's.
//
// mac-* builds MUST run on darwin: better-sqlite3/sqlite-vec/canvas/onnxruntime-node are native
// modules, and `npm ci` under a bundled darwin Node still needs a real darwin host to produce
// (or compile) darwin binaries — there is no cross-build path from Windows.

import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
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

const NODE_RUNTIME_VERSION = "22.23.2";

// One row per shippable portable target. Everything platform-specific (Node download shape,
// where the node binary lands inside the runtime, which launcher/README asset to lay down)
// lives here so the rest of the script stays platform-agnostic.
const PLATFORMS = {
    "win-x64": {
        hostOS: "win32",
        nodeUrl: v => `https://nodejs.org/dist/v${v}/node-v${v}-win-x64.zip`,
        nodeArchiveExt: "zip",
        nodeExtractedDirName: v => `node-v${v}-win-x64`,
        nodeBinaryRelPath: ["node.exe"],
        npmCliRelPath: ["node_modules", "npm", "bin", "npm-cli.js"],
        launcherAsset: "Start Story Labyrinth.bat",
        readmeAsset: "README.txt"
    },
    "mac-arm64": {
        hostOS: "darwin",
        nodeUrl: v => `https://nodejs.org/dist/v${v}/node-v${v}-darwin-arm64.tar.gz`,
        nodeArchiveExt: "tar.gz",
        nodeExtractedDirName: v => `node-v${v}-darwin-arm64`,
        nodeBinaryRelPath: ["bin", "node"],
        npmCliRelPath: ["lib", "node_modules", "npm", "bin", "npm-cli.js"],
        launcherAsset: "Start Story Labyrinth.command",
        readmeAsset: "README-mac.txt"
    },
    "mac-x64": {
        hostOS: "darwin",
        nodeUrl: v => `https://nodejs.org/dist/v${v}/node-v${v}-darwin-x64.tar.gz`,
        nodeArchiveExt: "tar.gz",
        nodeExtractedDirName: v => `node-v${v}-darwin-x64`,
        nodeBinaryRelPath: ["bin", "node"],
        npmCliRelPath: ["lib", "node_modules", "npm", "bin", "npm-cli.js"],
        launcherAsset: "Start Story Labyrinth.command",
        readmeAsset: "README-mac.txt"
    }
};

// log/fail are defined before platform resolution below since resolvePlatformId() and the
// host-OS gate both need fail() available at module-evaluation time (not inside a later-called
// function) — using platformId in the prefix would be nicer but isn't known yet at this point.
const log = message => console.log(`[build-portable] ${message}`);
const fail = message => {
    console.error(`[build-portable] FAILED: ${message}`);
    process.exit(1);
};

function resolvePlatformId() {
    if (typeof args.platform === "string") return args.platform;
    if (process.platform === "win32") return "win-x64";
    if (process.platform === "darwin") return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
    fail(
        `Cannot infer --platform on host OS "${process.platform}" — pass one explicitly: ` +
            `--platform=${Object.keys(PLATFORMS).join("|")}`
    );
}

const platformId = resolvePlatformId();
const platform = PLATFORMS[platformId];
if (!platform) {
    fail(`Unknown --platform=${platformId}. Valid: ${Object.keys(PLATFORMS).join("|")}`);
}
// Native modules (better-sqlite3/sqlite-vec/canvas/onnxruntime-node) can't be cross-installed —
// `npm ci` must run under a bundled runtime of the SAME OS it'll ship for. This is the one hard
// gate docs/Mac_Portable_Design.md calls out repeatedly: never let a Windows host produce a
// mac-* zip (or vice versa) even if someone passes --platform to force it.
if (process.platform !== platform.hostOS) {
    fail(
        `--platform=${platformId} must be built on ${platform.hostOS} (native modules can't be cross-installed). ` +
            `This host is ${process.platform}.`
    );
}

const outRoot = path.resolve(repoRoot, typeof args.out === "string" ? args.out : "portable-build");
const cacheDir = path.join(repoRoot, ".portable-build-cache");
const nodeCacheDir = path.join(cacheDir, `node-v${NODE_RUNTIME_VERSION}-${platformId}`);

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = pkg.version;

const versionDir = path.join(outRoot, "versions", version);
const appDir = path.join(versionDir, "app");
const nodeDir = path.join(versionDir, "node");

function run(command, cmdArgs, opts = {}) {
    execFileSync(command, cmdArgs, { stdio: "inherit", ...opts });
}

// PowerShell single-quoted strings escape an embedded quote by doubling it — without this, a repo
// checked out under a path containing an apostrophe turns every Compress-Archive call below into a
// parse error. Same helper, same reason, as update-runner.mjs's own copy.
const psQuote = value => `'${String(value).replace(/'/g, "''")}'`;

// Where the node binary lives inside a given <root>/node/ dir — same helper shape as server/
// routes/update.ts's and update-runner.mjs's own nodeBinaryFor(), kept as separate copies since
// this script, the server, and the updater are three independent runtimes.
const nodeBinaryFor = root => path.join(root, "node", ...platform.nodeBinaryRelPath);

async function ensureNodeRuntime() {
    const cachedBinary = path.join(nodeCacheDir, ...platform.nodeBinaryRelPath);
    if (fs.existsSync(cachedBinary)) {
        log(`Node ${NODE_RUNTIME_VERSION} runtime already cached at ${nodeCacheDir}`);
        return;
    }
    log(`Downloading Node ${NODE_RUNTIME_VERSION} ${platformId} runtime...`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const url = platform.nodeUrl(NODE_RUNTIME_VERSION);
    const archivePath = path.join(cacheDir, `node-runtime.${platform.nodeArchiveExt}`);
    const res = await fetch(url);
    if (!res.ok) fail(`Node runtime download failed: HTTP ${res.status} (${url})`);
    fs.writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));

    const extractedName = platform.nodeExtractedDirName(NODE_RUNTIME_VERSION);
    if (platform.nodeArchiveExt === "zip") {
        run("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Expand-Archive -LiteralPath ${psQuote(archivePath)} -DestinationPath ${psQuote(cacheDir)} -Force`
        ]);
    } else {
        run("tar", ["-xzf", archivePath, "-C", cacheDir]);
    }
    fs.rmSync(archivePath, { force: true });
    fs.renameSync(path.join(cacheDir, extractedName), nodeCacheDir);
    log(`Node runtime cached at ${nodeCacheDir}`);
}

function buildDist() {
    if (args["skip-build"]) {
        log("--skip-build passed, reusing existing dist/");
        if (!fs.existsSync(path.join(repoRoot, "dist", "server", "server", "index.js"))) {
            fail("--skip-build passed but dist/server/server/index.js doesn't exist — run a real build first");
        }
        return;
    }
    log("Running npm run build (this also bakes migrations, guide content, and the embedding model cache)...");
    run("npm", ["run", "build"], { cwd: repoRoot, shell: true });
}

function assembleApp() {
    log(`Assembling ${appDir}...`);
    fs.rmSync(versionDir, { recursive: true, force: true });
    fs.mkdirSync(appDir, { recursive: true });

    for (const file of ["package.json", "package-lock.json"]) {
        fs.copyFileSync(path.join(repoRoot, file), path.join(appDir, file));
    }
    fs.cpSync(path.join(repoRoot, "patches"), path.join(appDir, "patches"), { recursive: true });
    fs.cpSync(path.join(repoRoot, "dist"), path.join(appDir, "dist"), { recursive: true });

    // Mirrors the Dockerfile's own `COPY --from=builder /app/server/data ./dist/server/server/data`.
    const serverDataDest = path.join(appDir, "dist", "server", "server", "data");
    fs.cpSync(path.join(repoRoot, "server", "data"), serverDataDest, { recursive: true });

    const embeddingCacheSrc = path.join(repoRoot, ".embedding-model-cache");
    if (!fs.existsSync(embeddingCacheSrc)) {
        fail("repo root's .embedding-model-cache is missing — `npm run build`'s prebuild step should have created it");
    }
    fs.cpSync(embeddingCacheSrc, path.join(appDir, ".embedding-model-cache"), { recursive: true });

    fs.cpSync(path.join(repoRoot, "scripts", "portable-updater"), path.join(appDir, "updater-src"), { recursive: true });

    // The launcher and README used to exist only in the from-scratch scaffold below, which meant an
    // already-installed copy could never receive a launcher fix — laydownScaffold explicitly skips
    // them on a rebuild, and the update payload is just versions/<ver>/, which didn't contain them
    // at all. Shipping this release's own copies inside the version lets update-runner.mjs's
    // refreshLauncherAssets() bring an existing install's launcher forward after a successful boot.
    // Platform-specific by construction: a payload only ever carries the launcher for its own
    // platform, because that's the only one this build produced.
    const launcherSrcDir = path.join(appDir, "launcher-src");
    fs.mkdirSync(launcherSrcDir, { recursive: true });
    fs.copyFileSync(path.join(repoRoot, "scripts", "portable-assets", platform.launcherAsset), path.join(launcherSrcDir, platform.launcherAsset));
    fs.copyFileSync(path.join(repoRoot, "scripts", "portable-assets", platform.readmeAsset), path.join(launcherSrcDir, "README.txt"));

    // Written unconditionally into every build (fresh + update alike) purely so a FUTURE update's
    // decision logic (see zipUpdatePayload's lean/full check below) always has something on disk
    // to compare against, once this version becomes the one someone is updating *from*. Deciding
    // whether to skip node/+node_modules in an update zip is made once, at build time, against the
    // repo-committed baseline in shippedDepsManifestPath — never on the client.
    fs.writeFileSync(path.join(appDir, "deps-manifest.json"), JSON.stringify(computeDepsManifest(), null, 2));
}

// { nodeRuntimeVersion, packageLockSha256 } — the two things that actually determine whether
// node/ and app/node_modules/ would come out byte-for-byte identical to a previous build. Nothing
// else (app code, migrations, guide content, etc.) affects either folder's contents.
function computeDepsManifest() {
    const packageLockSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "package-lock.json"))).digest("hex");
    return { nodeRuntimeVersion: NODE_RUNTIME_VERSION, packageLockSha256 };
}

function installProductionDeps() {
    log("Copying Node runtime into this version...");
    fs.cpSync(nodeCacheDir, nodeDir, { recursive: true });
    if (process.platform !== "win32") {
        // fs.cpSync generally preserves POSIX mode bits, but make the one binary that actually
        // needs +x to run at all a hard guarantee rather than an assumption.
        fs.chmodSync(nodeBinaryFor(versionDir), 0o755);
    }

    log("Running npm ci --omit=dev under the bundled Node runtime...");
    // THE fix (originally found on Windows, applies identically on darwin): prepend the bundled
    // node/ to PATH so native-module install scripts (better-sqlite3, sqlite-vec, onnxruntime-
    // node) resolve THIS runtime's ABI instead of whatever `node` is first on the system PATH —
    // confirmed that without this, better-sqlite3's prebuilt binary comes back built for the
    // system Node and fails with ERR_DLOPEN_FAILED the first time something actually opens a
    // Database (not on plain require(), which is why the boot smoke-test below has to actually
    // instantiate one, not just import the module).
    const nodeBinary = nodeBinaryFor(versionDir);
    const npmCli = path.join(nodeDir, ...platform.npmCliRelPath);
    run(nodeBinary, [npmCli, "ci", "--omit=dev"], {
        cwd: appDir,
        env: { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH}` }
    });
}

function laydownScaffold() {
    const isFromScratch = !fs.existsSync(path.join(outRoot, "current-version.txt"));

    fs.mkdirSync(path.join(outRoot, "data"), { recursive: true });
    // Compress-Archive/zip do not reliably preserve a truly empty directory — confirmed live: the
    // v0.8.18 Windows release zip shipped with no data/ folder at all, crashing on first boot
    // (server/db/client.ts now also defends against this directly, but keep this belt-and-
    // suspenders fix here too since a missing folder is a zip-tool footgun, not just a server one).
    fs.writeFileSync(path.join(outRoot, "data", ".keep"), "");

    if (isFromScratch) {
        log(`From-scratch build — laying down ${platform.launcherAsset}, README.txt, current-version.txt, updater/`);
        fs.writeFileSync(path.join(outRoot, "current-version.txt"), version);
        fs.cpSync(path.join(repoRoot, "scripts", "portable-updater"), path.join(outRoot, "updater"), { recursive: true });

        const launcherDest = path.join(outRoot, platform.launcherAsset);
        fs.copyFileSync(path.join(repoRoot, "scripts", "portable-assets", platform.launcherAsset), launcherDest);
        if (process.platform !== "win32") fs.chmodSync(launcherDest, 0o755);

        fs.copyFileSync(path.join(repoRoot, "scripts", "portable-assets", platform.readmeAsset), path.join(outRoot, "README.txt"));
    } else {
        log("Existing output dir — leaving current-version.txt, updater/, launcher, and other versions untouched.");
    }
}

async function smokeTest() {
    log("Boot smoke-test: starting the built server against a scratch database...");
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-portable-smoke-"));
    const dbPath = path.join(scratchDir, "story-labyrinth.db");
    const port = 34567;

    const child = spawn(nodeBinaryFor(versionDir), [path.join(appDir, "dist", "server", "server", "index.js")], {
        cwd: versionDir,
        env: { ...process.env, NODE_ENV: "production", PORT: String(port), DATABASE_PATH: dbPath },
        stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", d => (output += d));
    child.stderr.on("data", d => (output += d));

    try {
        await waitForHealth(port, 20_000);

        const registerRes = await fetch(`http://localhost:${port}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "smoketest", password: "SmokeTest12345!" })
        });
        if (!registerRes.ok) fail(`smoke test: register failed with HTTP ${registerRes.status}\n${output}`);
        const cookie = registerRes.headers.get("set-cookie");

        const settingsRes = await fetch(`http://localhost:${port}/api/ai/settings`, {
            headers: cookie ? { Cookie: cookie } : {}
        });
        if (!settingsRes.ok) fail(`smoke test: GET /api/ai/settings failed with HTTP ${settingsRes.status}\n${output}`);
        const settings = await settingsRes.json();

        // This is exactly the fresh-install regression fixed this session (a JSON-mode DB column
        // populated only by its SQL DEFAULT deserializing as a raw string instead of an array) —
        // encoding it here means every future portable build is automatically checked for it.
        if (!Array.isArray(settings.availableModels) || !Array.isArray(settings.localInjectPresets)) {
            fail(`smoke test: settings JSON columns didn't deserialize as arrays — got ${JSON.stringify(settings)}\n${output}`);
        }

        log("Boot smoke-test passed.");
    } finally {
        const exited = new Promise(resolve => child.once("exit", resolve));
        child.kill();
        await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]);
        // SQLite's WAL files can stay briefly locked after the process exits (seen on Windows;
        // harmless to retry the same way on darwin) — retry a few times rather than failing the
        // whole build over scratch-dir cleanup, and give up quietly (it's in the OS temp dir
        // either way) if it's still locked after that.
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                fs.rmSync(scratchDir, { recursive: true, force: true });
                break;
            } catch {
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }
}

// Waits for READINESS, not just a bound port. server/index.ts starts its HTTP listener without
// awaiting initializeDatabase(), so /api/health answers 200 while migrations and seeds are still
// running — which used to let the smoke test's very next call (POST /api/auth/register) race the
// creation of the tables it needs. `ready` only flips true once initializeDatabase() has resolved.
async function waitForHealth(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
            if (res.ok) {
                const body = await res.json().catch(() => null);
                if (!body || body.ready === undefined || body.ready === true) return;
            }
        } catch {
            // not up yet
        }
        await new Promise(r => setTimeout(r, 500));
    }
    fail(`server never became ready on :${port}/api/health within ${timeoutMs}ms`);
}

// Two zip kinds, both produced from the same build (see docs/Mac_Portable_Design.md §3.4):
//   - fresh-install: the whole outRoot (launcher, README, current-version.txt, empty data/,
//     updater/, versions/<ver>/{node,app}) — for humans unzipping a brand-new install.
//   - update payload: just the INTERIOR of versions/<ver>/ (top-level entries node/ and app/,
//     no nested versions/<ver>/ wrapper) — this is what update-runner.mjs extracts straight
//     into a new versions/<target>/ folder. Zipping the fresh-install root for that purpose
//     was the actual Windows updater/asset-mismatch bug MP0 fixed: extracting a whole-root zip
//     into versions/<target>/ would have nested Start.bat/data/updater/versions one level too
//     deep instead of landing node/ and app/ where the updater expects them.
//
// Windows zips via PowerShell Compress-Archive (existing, unchanged); darwin zips via the
// system `zip` command — `ditto` was the other documented option but `zip -ry` gives the exact
// same "contents at top level, no wrapper folder" shape with more predictable, widely-understood
// behavior, and matches the plain `zip` tooling a future Linux CI leg would use too.
function zipFreshInstall() {
    const zipName = `Story-Labyrinth-portable-${platformId}.zip`;
    const zipPath = path.join(repoRoot, zipName);
    log(`Zipping fresh-install ${outRoot} -> ${zipPath} ...`);
    fs.rmSync(zipPath, { force: true });
    if (process.platform === "win32") {
        const outRootGlob = path.join(outRoot, "*");
        run("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Compress-Archive -Path ${psQuote(outRootGlob)} -DestinationPath ${psQuote(zipPath)} -CompressionLevel Optimal`
        ]);
    } else {
        run("zip", ["-ry", zipPath, "."], { cwd: outRoot });
    }
    log(`Done: ${zipPath}`);
    return zipPath;
}

// Checked into the repo (unlike everything else this script writes) — it's the one piece of
// cross-release state a "did node/node_modules change since the last shipped update?" check
// needs, since a build only ever sees its own working tree, never a previous release's artifacts.
// Deliberately NOT compared against git history/tags (would need `fetch-depth: 0` in CI and a
// second checkout-at-tag just to read one file) — a plain committed JSON file the release process
// updates alongside the version bump is simpler and just as reliable.
const shippedDepsManifestPath = path.join(repoRoot, "scripts", "portable-updater", "shipped-deps-manifest.json");

function readShippedDepsManifest() {
    if (!fs.existsSync(shippedDepsManifestPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(shippedDepsManifestPath, "utf8"));
    } catch {
        return null; // corrupt/unreadable — treat as "no baseline", falls through to a full build
    }
}

const sameDepsManifest = (a, b) => !!a && !!b && a.nodeRuntimeVersion === b.nodeRuntimeVersion && a.packageLockSha256 === b.packageLockSha256;

// Full update zip: node/ + app/ as a whole, byte-identical to what a fresh install ships — always
// the safe fallback. A "lean" zip (node/node_modules unchanged since the last release, per the
// checked-in baseline above) omits both entirely; update-runner.mjs then copies them forward from
// the currently-installed version instead of re-downloading/re-extracting ~55k files that would
// have come out identical anyway. When in doubt (no baseline yet, unreadable baseline, anything
// mismatched) this always falls back to full — a lean zip is only ever produced when the manifests
// provably match.
function zipUpdatePayload() {
    const zipName = `Story-Labyrinth-portable-${platformId}-update.zip`;
    const zipPath = path.join(repoRoot, zipName);
    const currentManifest = computeDepsManifest();
    const isLean = sameDepsManifest(readShippedDepsManifest(), currentManifest);

    log(
        isLean
            ? `Zipping LEAN update payload ${versionDir}/app (node/ and node_modules/ unchanged since the last release, omitted) -> ${zipPath} ...`
            : `Zipping FULL update payload ${versionDir} {node,app} -> ${zipPath} ...`
    );
    fs.rmSync(zipPath, { force: true });

    if (isLean) {
        zipLeanAppOnly(zipPath);
    } else if (process.platform === "win32") {
        run("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Compress-Archive -Path ${psQuote(nodeDir)},${psQuote(appDir)} -DestinationPath ${psQuote(zipPath)} -CompressionLevel Optimal`
        ]);
    } else {
        run("zip", ["-ry", zipPath, "node", "app"], { cwd: versionDir });
    }

    if (!isLean) {
        // Only advance the baseline once a FULL payload has actually shipped with these deps —
        // this is what the *next* build's lean/full decision compares against. A lean build never
        // touches this file: the baseline is already correct (that's exactly why it qualified).
        fs.writeFileSync(shippedDepsManifestPath, JSON.stringify(currentManifest, null, 2));
        log(`Updated ${path.relative(repoRoot, shippedDepsManifestPath)} — commit this alongside the version bump.`);
    }

    log(`Done: ${zipPath}`);
    return zipPath;
}

// Stages a copy of appDir with node_modules stripped out, then zips just that — Compress-Archive
// has no exclude flag, so on Windows this staging copy is the simplest way to get the same result
// `zip -x` gives natively on darwin/Linux. Runs only during a release build, never on a user's
// machine, so the extra disk I/O here is a non-issue.
function zipLeanAppOnly(zipPath) {
    if (process.platform === "win32") {
        const stagingRoot = path.join(cacheDir, "lean-app-staging");
        const stagedAppDir = path.join(stagingRoot, "app");
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        fs.mkdirSync(stagingRoot, { recursive: true });
        fs.cpSync(appDir, stagedAppDir, {
            recursive: true,
            filter: src => path.relative(appDir, src).split(path.sep)[0] !== "node_modules"
        });
        run("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Compress-Archive -Path ${psQuote(stagedAppDir)} -DestinationPath ${psQuote(zipPath)} -CompressionLevel Optimal`
        ]);
        fs.rmSync(stagingRoot, { recursive: true, force: true });
    } else {
        run("zip", ["-ry", zipPath, "app", "-x", "app/node_modules/*"], { cwd: versionDir });
    }
}

async function main() {
    log(`Building portable v${version} into ${outRoot}`);
    await ensureNodeRuntime();
    buildDist();
    assembleApp();
    installProductionDeps();
    laydownScaffold();
    await smokeTest();
    const freshZipPath = zipFreshInstall();
    const updateZipPath = zipUpdatePayload();
    log(`Portable build complete: ${freshZipPath}`);
    log(`Upload both with:`);
    log(`  gh release upload v${version} "${freshZipPath}#${path.basename(freshZipPath)}" -R bloodgrv/story-labyrinth`);
    log(`  gh release upload v${version} "${updateZipPath}#${path.basename(updateZipPath)}" -R bloodgrv/story-labyrinth`);
}

main().catch(error => fail(error instanceof Error ? (error.stack ?? error.message) : String(error)));
