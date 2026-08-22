// Self-updater for the Windows portable build only (see scripts/portable-updater/ and
// scripts/build-portable.mjs). Docker's update path is `docker compose pull && up -d` and needs
// no code here. This whole router still mounts unconditionally (matching every other
// requireOwner-gated router in server/index.ts) — GET /mode is how the frontend decides whether
// to show anything at all, and /check and /start both refuse to act when not running in
// portable mode, as defense in depth against a direct API call bypassing the hidden UI.
import { attemptPromise } from "@jfdi/attempt";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import pkg from "../../package.json" with { type: "json" };

const router = express.Router();

const CURRENT_VERSION = pkg.version;
const RELEASES_API = "https://api.github.com/repos/bloodgrv/story-labyrinth/releases/latest";
const PORTABLE_ASSET_NAME = "Story-Labyrinth-portable-win-x64.zip";

const isPortableBuild = () => process.env.PORTABLE_BUILD === "1";

// This app's own tags are always plain x.y.z (see release history) — a full semver dependency
// would be overkill for a three-number tuple compare.
const isNewerVersion = (a: string, b: string): boolean => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
};

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    body: string;
    assets: Array<{ name: string; browser_download_url: string; digest: string | null; size: number }>;
}

const fetchLatestRelease = async (): Promise<GitHubRelease> => {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub releases API returned ${res.status}`);
    return (await res.json()) as GitHubRelease;
};

// The portable root is wherever Start Story Labyrinth.bat launched us from (it `cd /d`s there
// before invoking node) — the same directory update-runner.mjs treats as --root. In portable
// mode this is just process.cwd() at boot; nothing here mutates cwd afterward.
const portableRoot = () => process.cwd();

router.get("/mode", (_req, res) => {
    res.json({ portable: isPortableBuild() });
});

// GET /api/update/check — resolves the latest GitHub release and compares against this running
// build's own package.json version. No server-side caching (see plan doc): client-side
// staleTime plus GitHub's 60/hr unauthenticated rate limit are plenty for a manual, single-
// instance "Check for updates" click.
router.get("/check", async (_req, res) => {
    const [error, release] = await attemptPromise(fetchLatestRelease);
    if (error) {
        res.status(502).json({ error: "Failed to check for updates", details: error.message });
        return;
    }

    const latestVersion = release.tag_name.replace(/^v/, "");
    const asset = release.assets.find(a => a.name === PORTABLE_ASSET_NAME);

    res.json({
        currentVersion: CURRENT_VERSION,
        latestVersion,
        updateAvailable: isNewerVersion(latestVersion, CURRENT_VERSION),
        releaseUrl: release.html_url,
        releaseNotes: release.body,
        // Present only when a portable asset actually exists on the release — the frontend
        // disables "Update now" (but still shows the release exists) if this is missing.
        assetAvailable: !!asset && !!asset.digest
    });
});

router.get("/status", (_req, res) => {
    if (!isPortableBuild()) {
        res.json({ phase: "idle" });
        return;
    }
    const statusFile = path.join(portableRoot(), "versions", ".update-status.json");
    if (!fs.existsSync(statusFile)) {
        res.json({ phase: "idle" });
        return;
    }
    try {
        res.json(JSON.parse(fs.readFileSync(statusFile, "utf8")));
    } catch {
        res.json({ phase: "idle" });
    }
});

// POST /api/update/start — re-resolves "latest" itself rather than trusting whatever the client
// last saw from /check, so a stale tab can't kick off a download for a release that's since
// moved. Spawns the detached updater and returns immediately; the caller is expected to poll
// GET /status (this same process, until it gets killed) and then GET /api/health (once this
// process is gone and a new one should be answering instead).
router.post("/start", async (_req, res) => {
    if (!isPortableBuild()) {
        res.status(404).json({ error: "Not running in portable mode" });
        return;
    }

    const [error, release] = await attemptPromise(fetchLatestRelease);
    if (error) {
        res.status(502).json({ error: "Failed to resolve latest release", details: error.message });
        return;
    }

    const latestVersion = release.tag_name.replace(/^v/, "");
    if (!isNewerVersion(latestVersion, CURRENT_VERSION)) {
        res.status(400).json({ error: "Already on the latest version" });
        return;
    }

    const asset = release.assets.find(a => a.name === PORTABLE_ASSET_NAME);
    if (!asset || !asset.digest) {
        res.status(422).json({ error: "Latest release has no portable build asset" });
        return;
    }

    const root = portableRoot();
    const updaterEntry = path.join(root, "updater", "update-runner.mjs");
    const nodeExe = path.join(root, "versions", CURRENT_VERSION, "node", "node.exe");
    if (!fs.existsSync(updaterEntry) || !fs.existsSync(nodeExe)) {
        res.status(500).json({ error: "Updater not found in this install — was it built with scripts/build-portable.mjs?" });
        return;
    }

    res.status(202).json({ started: true, targetVersion: latestVersion });

    spawn(
        nodeExe,
        [
            updaterEntry,
            `--root=${root}`,
            `--target-version=${latestVersion}`,
            `--download-url=${asset.browser_download_url}`,
            `--digest=${asset.digest}`,
            `--old-pid=${process.pid}`,
            `--port=${process.env.PORT ?? "3000"}`
        ],
        { detached: true, stdio: "ignore" }
    ).unref();
});

export default router;
