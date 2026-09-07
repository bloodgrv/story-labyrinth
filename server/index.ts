import { attemptPromise } from "@jfdi/attempt";
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
import aiChatRouter from "./routes/aiChat.js";
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

// Readiness, as distinct from liveness. initializeDatabase() is deliberately NOT awaited before
// app.listen() answers requests (kept that way — the HTTP server binding early is what lets the
// browser show *something* while a slow first-boot migration runs), so for a window after startup this
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
// own app.listen() against this one still holding the port. That race is now caught rather than
// fatal (see `startServer`'s conflict handling at the bottom of this file), but a relaunch that
// reports a port conflict to a console nobody is watching is still a failed restart — the ordering
// here is what prevents it, not the handler.
const shutdown = async (relaunch = false) => {
    // `server` is assigned asynchronously (startServer awaits a port probe first), so a signal
    // arriving in that window would otherwise crash on `server.close` instead of exiting.
    if (!server) process.exit(0);
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

// initializeDatabase() is NOT called here — it runs from app.listen()'s callback at the bottom of
// this file, so nothing touches the database until this process actually owns the port. It used to
// fire right here, at module load, racing app.listen(): a second instance started against an
// already-running one would take a pre-migration VACUUM INTO snapshot and run migrations on the
// SQLite file the live instance was busy using, and only afterwards discover the port was taken and
// die. Two processes migrating one database is exactly what the rest of the update doctrine exists
// to prevent, and a second launch is easy to trigger by accident — see the EADDRINUSE handler.

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
// B45 — live chat's server-side streaming proxy. Deliberately its own mount at editor level
// rather than a route inside aiRouter above: /api/ai is requireOwner (it serves and writes
// provider settings), but *generating* is ordinary editor work. blockViewerMutations, already
// applied above, still stops a viewer from POSTing here.
app.use("/api/ai-chat", aiChatRouter);
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

// --- Second-instance handling -------------------------------------------------------------------
//
// Starting a second copy against a running one is easy to do by accident on a portable build: an
// in-app update stops the server that owns the console window and starts the replacement detached,
// with no window of its own (update-runner.mjs's spawnServer), so the old window sits there looking
// dead while the app is very much alive — and the obvious move is to double-click the launcher.
//
// Two things went wrong on that path, and the second is the serious one:
//   1. `server`'s 'error' event had no handler, so an EADDRINUSE bind failure killed the process
//      with a raw Node stack trace as its only explanation.
//   2. initializeDatabase() ran at module load, before/independently of the bind, so the doomed
//      second process took a VACUUM INTO snapshot and ran migrations against the SQLite file the
//      live instance was actively using — two processes migrating one database, which is precisely
//      what the rest of this project's update doctrine exists to prevent.
//
// Gating the database work on a successful bind is NOT sufficient on its own, which is only visible
// by running it: on Windows the 'listening' event fires *first* and EADDRINUSE arrives right after,
// so the callback's synchronous runMigrations() completes before the error is ever dispatched.
// Verified by running two instances — the second logged "Server running on port 3999" and a full
// migration pass before printing the conflict. Hence the belt-and-braces below.

// Positive detection, and the only part that is deterministic for the real-world case: something
// answering /api/health with our own payload is a Story Labyrinth we must not fight with; anything
// else that answers gets an honest "some other program" message rather than a confusing claim about
// this app.
//
// Deliberately FAILS OPEN. Only a completed HTTP response counts as occupied — every rejection
// (connection refused, timeout, or some error shape this code has never seen) is treated as free
// and left for the bind to adjudicate, because the bind is the real authority and the handler below
// catches it. The alternative, treating an unrecognised probe error as occupied, trades a rare
// cosmetic problem for a total outage: a refusal to start on a port that was never in use.
const probePortOccupant = async (): Promise<"free" | "story-labyrinth" | "other"> => {
    // 127.0.0.1 rather than localhost on purpose — an IP literal skips DNS, so a rejection is a
    // plain connection error rather than an AggregateError over several resolved addresses.
    const [error, response] = await attemptPromise(() =>
        fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(2000) })
    );
    if (error) return "free";
    const [, body] = await attemptPromise(() => response.json() as Promise<{ status?: string; version?: string }>);
    return body?.status === "ok" && typeof body.version === "string" ? "story-labyrinth" : "other";
};

const reportPortConflict = (occupant: "story-labyrinth" | "other") => {
    if (occupant === "story-labyrinth") {
        console.error(`\nStory Labyrinth is already running on port ${PORT}, so this copy can't start.`);
        console.error(`\n  Use it:   http://localhost:${PORT}`);
        console.error(`  Stop it:  http://localhost:${PORT}/_status  ("Shutdown server")`);
        console.error(`\nIf you updated from inside the app, the new version is what's holding the port:`);
        console.error(`it runs in the background without a window of its own.`);
    } else {
        console.error(`\nPort ${PORT} is already in use by another program, so Story Labyrinth can't start.`);
        console.error(`Close whatever is using it, or set a different port (PORT=3001) and try again.`);
    }
    console.error(`\nNothing on disk was changed, and your data has not been touched.`);
};

// Set by the 'error' handler; read by the deferred start below. The whole point is that on Windows
// the error is already queued behind our own synchronous work when 'listening' fires.
let bindFailed = false;

const startServer = async () => {
    const occupant = await probePortOccupant();
    if (occupant !== "free") {
        reportPortConflict(occupant);
        process.exit(1);
    }

    server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
        // Yield one macrotask before touching the database. On Windows a late EADDRINUSE is already
        // sitting in the queue at this point (see above), so this hands it the chance to run — and
        // its process.exit(1) — before any migration starts. Backstop for the genuine race the
        // probe above can't close: two cold starts within the same few milliseconds.
        setTimeout(() => {
            if (bindFailed) return;
            // Still deliberately not awaited (see `dbReady`'s comment) — binding early is what lets
            // the browser show something during a slow first-boot migration.
            initializeDatabase().catch(error => {
                console.error("Failed to initialize database:", error);
                process.exit(1);
            });
        }, 0);
    });

    // An unhandled 'error' event on an http.Server kills the process outright. Anything that isn't a
    // port conflict keeps that behaviour deliberately: it's genuinely unexpected, and a stack trace
    // is the right output for it.
    server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EADDRINUSE") throw error;
        // Synchronous, so the deferred initializeDatabase() above is skipped no matter what the
        // re-probe does next. That ordering is the data-safety guarantee; the message is cosmetic.
        bindFailed = true;
        // Re-probe rather than assume: reaching here means the pre-bind probe said "free", so the
        // occupant either arrived in the intervening milliseconds or never answered HTTP at all.
        // Ask again so the message names the right culprit; if it still won't answer, "some other
        // program" is the honest description.
        void probePortOccupant().then(occupant => {
            reportPortConflict(occupant === "story-labyrinth" ? "story-labyrinth" : "other");
            process.exit(1);
        });
    });
};

void startServer();

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
