import cors from "cors";
import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./db/migrate.js";
import { recordSchemaVersion, takePreMigrationSnapshot } from "./db/preMigrationBackup.js";
import { seedCoreNamePools } from "./db/seedNamePools.js";
import { migrateSceneBeatPromptType, patchStaleSystemPrompts, seedSystemPrompts } from "./db/seedSystemPrompts.js";
import { blockViewerMutations, requireAuth, requireOwner } from "./middleware/auth.js";
import { renderStatusPage } from "./routes/statusPage.js";
import { getCurrentJobIds, start as startJobRunner, stop as stopJobRunner } from "./services/jobRunner.js";
import { writeAllManuscriptBackups } from "./services/manuscriptBackupService.js";
import { seedShippedPlaybookPacks } from "./services/playbookPackService.js";
import adminRouter from "./routes/admin.js";
import agentJobsRouter from "./routes/agentJobs.js";
import agentMemoriesRouter from "./routes/agentMemories.js";
import aiRouter from "./routes/ai.js";
import authRouter from "./routes/auth.js";
import beatsRouter from "./routes/beats.js";
import brainstormRouter from "./routes/brainstorm.js";
import chaptersRouter from "./routes/chapters.js";
import chatsRouter from "./routes/chats.js";
import codexRouter from "./routes/codex.js";
import deskTransfersRouter from "./routes/deskTransfers.js";
import foldersRouter from "./routes/folders.js";
import grammarRouter from "./routes/grammar.js";
import humanizerRouter from "./routes/humanizer.js";
import autoHumanizerRouter from "./routes/autoHumanizer.js";
import lorebookRouter from "./routes/lorebook.js";
import mcpConnectionsRouter from "./routes/mcpConnections.js";
import mcpServerRouter from "./routes/mcpServer.js";
import mcpServerSettingsRouter from "./routes/mcpServerSettings.js";
import nameGeneratorRouter from "./routes/nameGenerator.js";
import notesRouter from "./routes/notes.js";
import outlineRouter from "./routes/outline.js";
import outlineCharactersRouter from "./routes/outlineCharacters.js";
import outlineImportRouter from "./routes/outlineImport.js";
import playbookPacksRouter from "./routes/playbookPacks.js";
import promptsRouter from "./routes/prompts.js";
import ragRouter from "./routes/rag.js";
import aiReviewRouter from "./routes/aiReview.js";
import seriesRouter from "./routes/series.js";
// Import routes
import storiesRouter from "./routes/stories.js";
import trashRouter from "./routes/trash.js";
import storyGraphRouter from "./routes/storyGraph.js";
import storyMapRouter from "./routes/storyMap.js";
import storyMapsRouter from "./routes/storyMaps.js";
import storyTimelineRouter from "./routes/storyTimeline.js";
import ttsRouter from "./routes/tts.js";
import updateRouter, { consumeShutdownToken, isPortableBuild } from "./routes/update.js";
import usersRouter from "./routes/users.js";
import writerPrefsSettingsRouter from "./routes/writerPrefsSettings.js";
import pkg from "../package.json" with { type: "json" };

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "story-labyrinth.db");

// Assigned once app.listen() runs below; the /_status routes only read this at request time
// (after startup has finished), so the forward reference is safe.
let server: ReturnType<typeof app.listen>;
let jobRunnerStarted = false;

// Readiness, as distinct from liveness. initializeDatabase() below is deliberately NOT awaited
// before app.listen() (kept that way — the HTTP server binding early is what lets the browser
// show *something* while a slow first-boot migration runs), so for a window after startup this
// process answers HTTP fine while the database is still being migrated/seeded. GET /api/health
// reported a flat `{status:"ok"}` through that whole window, which made the portable self-updater's
// boot-failure rollback (scripts/portable-updater/update-runner.mjs) structurally unable to fire:
// it saw "healthy" milliseconds after spawning the new version, declared the update done and
// exited — even when initializeDatabase() then threw and process.exit(1)'d a moment later,
// leaving current-version.txt pointing at a build that can't start. `ready` closes that hole;
// the updater now waits for `ready === true` AND a matching `version` before it stops watching.
// Kept as an extra FIELD on a still-200 response rather than a 503-until-ready, so every existing
// consumer (four compose healthchecks, build-portable.mjs's smoke test, the frontend's
// reconnect poll) keeps behaving exactly as before.
let dbReady = false;

// No graceful shutdown handling existed anywhere in this codebase before this — needed now so
// stopJobRunner() gets a chance to let an in-flight job finish before the process exits. Shared
// by SIGTERM/SIGINT and the /_status restart & shutdown actions below.
//
// Manuscript Failsafe Save's shutdown hook lives here too — best-effort, wrapped so a backup
// failure (or a slow one) never blocks or meaningfully delays actual shutdown.
//
// `relaunch` (portable builds only, see /_status/restart below): re-execs the exact command that
// started this process — `process.execPath`/`process.argv`/`process.cwd()`/`process.env` are all
// already correct as-is, since Start.bat/.command already `cd`s into the portable root and sets
// PORT/DATABASE_PATH/PORTABLE_BUILD/PORTABLE_PLATFORM as real env vars before launching node, and
// the update-runner's own respawn (scripts/portable-updater/update-runner.mjs) does the same.
// Spawned detached + unref'd, and — critically — only AFTER server.close()'s callback fires (the
// port is actually released by then), not before: spawning earlier would race the new process's
// own app.listen() against this one still holding the port, and index.ts has no EADDRINUSE
// handler on `server` (an unhandled 'error' event there crashes the process outright).
const shutdown = async (relaunch = false) => {
    await writeAllManuscriptBackups().catch(error => console.error("Manuscript backup pass failed on shutdown:", error));
    await stopJobRunner();
    server.close(() => {
        if (relaunch) {
            spawn(process.execPath, process.argv.slice(1), {
                cwd: process.cwd(),
                env: process.env,
                detached: true,
                stdio: "ignore"
            }).unref();
        }
        process.exit(0);
    });
    // Real bug caught live while verifying the relaunch above: `server.close()`'s callback only
    // fires once every already-accepted socket closes on its own — it does NOT close idle
    // keep-alive connections, which this app's own frontend keeps producing (Activity Stoplight's
    // 3s/20s job polling, etc.) as long as a browser tab is open. Verified directly: with a client
    // still making periodic requests, the server kept happily answering new requests for 15+
    // seconds after `.close()` was called and never actually went down — `restart`/`shutdown`
    // would silently hang rather than complete, which is arguably worse than the "shuts down but
    // doesn't come back" bug this whole change exists to fix. `closeAllConnections()` (Node
    // 18.2+, well within this project's bundled Node 22) force-closes every open socket
    // immediately after `.close()` stops accepting new ones, so the callback above fires promptly
    // regardless of what else is still polling this server.
    server.closeAllConnections();
};

// Run migrations, seed system prompts, and start the background job runner on startup.
// jobRunner starts last so the agentJobs table (and everything it references) definitely
// exists first — a failure here is caught by the same startup guard below.
const initializeDatabase = async () => {
    // Snapshot first, stamp after: if runMigrations() throws, the version marker stays on the old
    // version so the next boot still recognises this upgrade. See preMigrationBackup.ts for why
    // this lives here rather than only in the portable updater.
    takePreMigrationSnapshot();
    runMigrations();
    recordSchemaVersion();
    await seedSystemPrompts();
    await patchStaleSystemPrompts();
    // Scene Beat Removal (SB7) — recategorizes existing promptType: "scene_beat" rows to "other".
    await migrateSceneBeatPromptType();
    // NG4 (docs/Name_Generator_Design.md v0.4) — baked-in core name pools, same insert-only,
    // idempotent-on-every-boot shape as seedSystemPrompts above.
    await seedCoreNamePools();
    // Character Guided Playbook Packs (Hybrid D, PP1) — shipped shell packs, same insert-only,
    // idempotent-on-every-boot shape as seedCoreNamePools above.
    await seedShippedPlaybookPacks();
    await startJobRunner();
    jobRunnerStarted = true;
    dbReady = true;
};

initializeDatabase().catch(error => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
});

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS - allow all in development, restrict in production if needed
if (NODE_ENV === "development") app.use(cors());

// Auth routes — must stay reachable without a session (status/register/login/logout).
app.use("/api/auth", authRouter);

// Health check — must also stay reachable without a session (e.g. Docker healthcheck).
app.get("/api/health", (_, res) => {
    res.json({ status: "ok", ready: dbReady, version: pkg.version });
});

// POST /api/update/prepare-shutdown — the portable self-updater's graceful-stop channel, and the
// one /api/update/* route that deliberately sits ABOVE requireAuth. It has to: the updater
// (scripts/portable-updater/update-runner.mjs) is a detached child process with no cookie jar and
// no way to obtain one. It is NOT unauthenticated — it's authenticated by a single-use,
// in-memory-only token that POST /api/update/start minted for this exact updater run (see
// routes/update.ts's mintShutdownToken), plus a hard loopback-only check. The token never touches
// disk and dies with this process, so there is nothing to leak or replay across restarts.
//
// Why it exists at all: the updater used to stop the old server with process.kill(pid), which on
// Windows — the primary portable target — libuv maps to TerminateProcess. That is an instant,
// unblockable kill, so the SIGTERM handler at the bottom of this file never ran during an update:
// no Manuscript Failsafe Save pass, and every in-flight agent job severed mid-write. Routing the
// stop through shutdown() instead means an update now flushes the same backups and drains the
// same jobs as any other clean stop, on every platform.
const isLoopback = (address: string | undefined): boolean =>
    address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";

app.post("/api/update/prepare-shutdown", (req, res) => {
    if (!isLoopback(req.socket.remoteAddress)) {
        res.status(403).json({ error: "Not available off-loopback" });
        return;
    }
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || !consumeShutdownToken(token)) {
        res.status(403).json({ error: "Invalid or already-used shutdown token" });
        return;
    }
    res.json({ ok: true });
    // Same defer-past-the-response shape as /_status/shutdown below, so the updater actually
    // receives its 200 before this process starts tearing itself down.
    setTimeout(() => void shutdown(false), 100);
});

// Every other /api/* route requires a valid session from here on.
app.use("/api", requireAuth);

// Viewers get read-only access everywhere; owner-only surfaces (API keys, DB admin, user
// management) are gated further below.
app.use("/api", blockViewerMutations);

// API routes
app.use("/api/series", seriesRouter);
app.use("/api/stories", storiesRouter);
app.use("/api/trash", trashRouter);
app.use("/api/chapters", chaptersRouter);
app.use("/api/chats", chatsRouter);
app.use("/api/codex", codexRouter);
app.use("/api/lorebook", lorebookRouter);
// Editor-level auth (requireAuth + blockViewerMutations, already applied globally above) — same
// posture as /api/codex and /api/lorebook. No LLM access, so no per-feature endpoint routing here.
app.use("/api/name-generator", nameGeneratorRouter);
app.use("/api/prompts", promptsRouter);
app.use("/api/ai", requireOwner, aiRouter);
app.use("/api/brainstorm", brainstormRouter);
app.use("/api/notes", notesRouter);
app.use("/api/admin", requireOwner, adminRouter);
// MCP Tool Connections (M0, docs/MCP_Tool_Connections_Design.md) — every route touches
// owner-only data (URLs, bearer tokens), so the whole router sits under requireOwner rather
// than TTS's per-route split.
app.use("/api/mcp/connections", requireOwner, mcpConnectionsRouter);
// M4 — Settings CRUD for exposing this app's own /mcp endpoint (enable/disable, rotate/revoke the
// install bearer token). Owner-only, same posture as the connections router above.
app.use("/api/mcp-server", requireOwner, mcpServerSettingsRouter);
// M4 — the actual /mcp protocol endpoint. Deliberately mounted OUTSIDE /api (design §4.1) so it
// does not inherit the session-cookie requireAuth gate above — external MCP clients have no
// browser session; mcpServer.ts's own bearer-token middleware gates it instead.
app.use("/mcp", mcpServerRouter);
// System-level infrastructure (LLM-spend-triggering, story-wide reindexing) that a
// viewer/editor has no legitimate reason to poke at directly — matching /api/admin/ai/users.
app.use("/api/agent/jobs", requireOwner, agentJobsRouter);
// Portable-build self-updater (see scripts/portable-updater/) — inert (mode: "portable" false,
// /check and /start both no-op) outside PORTABLE_BUILD=1, but still mounted unconditionally,
// matching every other requireOwner-gated router here.
app.use("/api/update", requireOwner, updateRouter);
// Memory approval is an editorial decision (analogous to Codex proposal approval, editor-allowed
// today), not system administration — no requireOwner here, matching /api/codex's auth level.
app.use("/api/agent/memories", agentMemoriesRouter);
// Mounted at bare /api, not a resource prefix — storyGraph.ts's own routes span two path shapes
// (/stories/:storyId/graph/... and /graph/edges/:id) that don't share one top-level segment. See
// storyGraph.ts's own top-of-file comment. Editor-level auth (requireAuth + blockViewerMutations,
// both already applied globally above), no requireOwner — matches /api/codex's auth level.
app.use("/api", storyGraphRouter);
// Story Map (L3, docs/Locations_And_Maps_Design.md) — same bare-/api mounting reasoning as
// storyGraphRouter directly above (its routes span /stories/:storyId/map/... and
// /map/edges/:id). Same editor-level auth.
app.use("/api", storyMapRouter);
// Maps v2 (MV0, docs/Maps_V2_Sketch_Design.md) — sketch-canvas documents, separate router from
// storyMapRouter directly above (that one stays as the L3 spatial graph, deprecated in the UI only
// per decision #8). Same bare-/api mounting reasoning, same editor-level auth.
app.use("/api", storyMapsRouter);
// Story Timeline (T6, TL0-TL4, docs/Story_Timeline_Design.md) — in-world chronology board, same
// bare-/api mounting reasoning as storyMapsRouter directly above. Same editor-level auth.
app.use("/api", storyTimelineRouter);
// Transfer Log (docs/Transfer_Log_And_Settings_IA_Design.md) — mounted at bare /api for the same
// reason storyGraphRouter is: its routes are /stories/:storyId/transfers, a story sub-resource
// rather than its own top-level prefix. Editor-level auth (requireAuth + blockViewerMutations,
// already applied globally above) — a viewer can read the log but not create rows, same posture
// as every other editor-gated write in this app.
app.use("/api", deskTransfersRouter);
app.use("/api/rag", ragRouter);
// AI Review (AR1, docs/AI_Review_Design.md) — same editor-level auth as /api/rag's own
// findings/issue routes; the LLM-spend-triggering trigger itself goes through the owner-gated
// /api/agent/jobs queue (jobType: "ai_review_quick"), not this router.
app.use("/api/ai-review", aiReviewRouter);
app.use("/api/tts", ttsRouter);
app.use("/api/humanizer", humanizerRouter);
app.use("/api/auto-humanizer", autoHumanizerRouter);
app.use("/api/beats", beatsRouter);
app.use("/api/grammar", grammarRouter);
app.use("/api/writer-prefs", writerPrefsSettingsRouter);
app.use("/api/outline", outlineRouter);
app.use("/api/outline-characters", outlineCharactersRouter);
app.use("/api/outline-import", outlineImportRouter);
app.use("/api/folders", foldersRouter);
// Character Guided Playbook Packs (Hybrid D) — editor-level auth (requireAuth +
// blockViewerMutations, already applied globally above), same posture as /api/notes: reading and
// arming a pack is editorial, not system administration.
app.use("/api/playbook-packs", playbookPacksRouter);
app.use("/api/users", requireOwner, usersRouter);

// Server status/control page — owner-only (same posture as /api/admin). Registered before the
// production static/SPA-fallback block below so that catch-all doesn't swallow it.
app.get("/_status", requireAuth, requireOwner, (_req, res) => {
    res.send(
        renderStatusPage({
            nodeEnv: NODE_ENV,
            port: PORT,
            dbPath: DB_PATH,
            jobRunnerStarted,
            currentJobIds: getCurrentJobIds(),
            isPortableBuild: isPortableBuild()
        })
    );
});
// B44 (docs/CODE_REVIEW_2026-08-17.md), amended 2026-08-23 for portable restart — restart and
// shutdown were deliberately identical, not an unfinished feature: a plain Node process has no
// way to relaunch itself, and under Docker's `restart: unless-stopped` policy (every compose file
// here), Docker can't tell "the app exited gracefully by request" apart from "the app exited and
// should come back" either way. That reasoning still holds for Docker/dev — self-relaunching
// inside a container wouldn't even work, since the container's namespace tears down (killing any
// detached child) the moment its PID 1 process exits, which is exactly what `server.close()`'s
// callback triggers. Portable builds are the genuine exception: there's no supervisor at all
// (closing the console window IS the shutdown path), but there's also no container boundary
// stopping a detached child from surviving its parent — and the self-updater already proves this
// exact "spawn a new node process, then let the old one exit" shape works for real (`update.ts`/
// `update-runner.mjs`). So on a portable build specifically, "restart" now really does restart:
// shutdown's `relaunch` flag spawns a fresh copy of this exact process (see shutdown's own
// comment) after the port is actually free. Everywhere else, "restart" still just means "exit and
// trust whatever's supervising this process to bring it back" — the status page's own note
// (routes/statusPage.ts) explains that to the person clicking the button on those builds.
app.post("/_status/shutdown", requireAuth, requireOwner, (_req, res) => {
    res.json({ ok: true });
    setTimeout(() => void shutdown(false), 100);
});
app.post("/_status/restart", requireAuth, requireOwner, (_req, res) => {
    res.json({ ok: true });
    setTimeout(() => void shutdown(isPortableBuild()), 100);
});

// Serve static files in production
if (NODE_ENV === "production") {
    const staticPath = path.join(__dirname, "../../client");
    app.use(express.static(staticPath));

    // Serve index.html for all non-API routes (SPA routing)
    app.use((_req, res) => {
        res.sendFile(path.join(staticPath, "index.html"));
    });
}

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
});

server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
});

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
