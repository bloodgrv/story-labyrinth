// Builds the Windows portable release: a bundled Node runtime + production app code + an empty
// data/ folder, laid out as scripts/portable-updater's self-updater expects (see
// C:\Users\Reuben\.claude\plans\bubbly-floating-octopus.md for the full design, or
// docs/ once that plan's summary lands there).
//
// Usage: node scripts/build-portable.mjs [--skip-build] [--out=<dir>]
//   --skip-build   reuse the existing dist/ instead of running `npm run build` again (fast
//                  iteration only — never use this for a real release)
//   --out=<dir>    output root (default: portable-build/ at repo root)
//
// Every run adds a new versions/<version>/ folder. A from-scratch run (no existing --out dir)
// also lays down the stable scaffold (Start.bat, README.txt, current-version.txt, updater/).
// Rebuilding into an existing --out dir never touches current-version.txt or other versions —
// that's the running self-updater's job, not this script's.

import { execFileSync, spawn } from "node:child_process";
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
const outRoot = path.resolve(repoRoot, typeof args.out === "string" ? args.out : "portable-build");
const cacheDir = path.join(repoRoot, ".portable-build-cache");
const nodeCacheDir = path.join(cacheDir, `node-v${NODE_RUNTIME_VERSION}-win-x64`);

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = pkg.version;

const versionDir = path.join(outRoot, "versions", version);
const appDir = path.join(versionDir, "app");
const nodeDir = path.join(versionDir, "node");

const log = message => console.log(`[build-portable] ${message}`);
const fail = message => {
    console.error(`[build-portable] FAILED: ${message}`);
    process.exit(1);
};

function run(command, cmdArgs, opts = {}) {
    execFileSync(command, cmdArgs, { stdio: "inherit", ...opts });
}

async function ensureNodeRuntime() {
    if (fs.existsSync(path.join(nodeCacheDir, "node.exe"))) {
        log(`Node ${NODE_RUNTIME_VERSION} runtime already cached at ${nodeCacheDir}`);
        return;
    }
    log(`Downloading Node ${NODE_RUNTIME_VERSION} win-x64 runtime...`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const zipUrl = `https://nodejs.org/dist/v${NODE_RUNTIME_VERSION}/node-v${NODE_RUNTIME_VERSION}-win-x64.zip`;
    const zipPath = path.join(cacheDir, "node-runtime.zip");
    const res = await fetch(zipUrl);
    if (!res.ok) fail(`Node runtime download failed: HTTP ${res.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

    const extractedName = `node-v${NODE_RUNTIME_VERSION}-win-x64`;
    const extractParent = cacheDir;
    run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractParent}' -Force`
    ]);
    fs.rmSync(zipPath, { force: true });
    fs.renameSync(path.join(extractParent, extractedName), nodeCacheDir);
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
}

function installProductionDeps() {
    log("Copying Node runtime into this version...");
    fs.cpSync(nodeCacheDir, nodeDir, { recursive: true });

    log("Running npm ci --omit=dev under the bundled Node runtime...");
    // THE fix: prepend the bundled node/ to PATH so native-module install scripts (better-
    // sqlite3, sqlite-vec, onnxruntime-node) resolve THIS node.exe's ABI instead of whatever
    // `node` is first on the system PATH — confirmed today that without this, better-sqlite3's
    // prebuilt binary comes back built for the system Node and fails with ERR_DLOPEN_FAILED the
    // first time something actually opens a Database (not on plain require(), which is why the
    // boot smoke-test below has to actually instantiate one, not just import the module).
    const nodeExe = path.join(nodeDir, "node.exe");
    const npmCli = path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
    run(nodeExe, [npmCli, "ci", "--omit=dev"], {
        cwd: appDir,
        env: { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH}` }
    });
}

function laydownScaffold() {
    const isFromScratch = !fs.existsSync(path.join(outRoot, "current-version.txt"));

    fs.mkdirSync(path.join(outRoot, "data"), { recursive: true });
    // Compress-Archive does not reliably preserve a truly empty directory — confirmed live: the
    // v0.8.18 release zip shipped with no data/ folder at all, crashing on first boot (server/db/
    // client.ts now also defends against this directly, but keep this belt-and-suspenders fix
    // here too since a missing folder is a zip-tool footgun, not just a server one).
    fs.writeFileSync(path.join(outRoot, "data", ".keep"), "");

    if (isFromScratch) {
        log("From-scratch build — laying down Start.bat, README.txt, current-version.txt, updater/");
        fs.writeFileSync(path.join(outRoot, "current-version.txt"), version);
        fs.cpSync(path.join(repoRoot, "scripts", "portable-updater"), path.join(outRoot, "updater"), { recursive: true });
        fs.copyFileSync(
            path.join(repoRoot, "scripts", "portable-assets", "Start Story Labyrinth.bat"),
            path.join(outRoot, "Start Story Labyrinth.bat")
        );
        fs.copyFileSync(path.join(repoRoot, "scripts", "portable-assets", "README.txt"), path.join(outRoot, "README.txt"));
    } else {
        log("Existing output dir — leaving current-version.txt, updater/, Start.bat, and other versions untouched.");
    }
}

async function smokeTest() {
    log("Boot smoke-test: starting the built server against a scratch database...");
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-portable-smoke-"));
    const dbPath = path.join(scratchDir, "story-labyrinth.db");
    const port = 34567;

    const child = spawn(path.join(nodeDir, "node.exe"), [path.join(appDir, "dist", "server", "server", "index.js")], {
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
        // SQLite's WAL files can stay briefly locked after the process exits on Windows — retry
        // a few times rather than failing the whole build over scratch-dir cleanup, and give up
        // quietly (it's in the OS temp dir either way) if it's still locked after that.
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

async function waitForHealth(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
            if (res.ok) return;
        } catch {
            // not up yet
        }
        await new Promise(r => setTimeout(r, 500));
    }
    fail(`server never responded on :${port}/api/health within ${timeoutMs}ms`);
}

function zip() {
    const zipName = "Story-Labyrinth-portable-win-x64.zip";
    const zipPath = path.join(repoRoot, zipName);
    log(`Zipping ${outRoot} -> ${zipPath} ...`);
    fs.rmSync(zipPath, { force: true });
    run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -Path '${outRoot}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal`
    ]);
    log(`Done: ${zipPath}`);
    return zipPath;
}

async function main() {
    log(`Building portable v${version} into ${outRoot}`);
    await ensureNodeRuntime();
    buildDist();
    assembleApp();
    installProductionDeps();
    laydownScaffold();
    await smokeTest();
    const zipPath = zip();
    log(`Portable build complete: ${zipPath}`);
    log(`Upload with: gh release upload v${version} "${zipPath}#${path.basename(zipPath)}" -R bloodgrv/story-labyrinth`);
}

main().catch(error => fail(error instanceof Error ? (error.stack ?? error.message) : String(error)));
