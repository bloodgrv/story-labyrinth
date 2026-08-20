import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./db/migrate.js";
import { seedCoreNamePools } from "./db/seedNamePools.js";
import { migrateSceneBeatPromptType, patchStaleSystemPrompts, seedSystemPrompts } from "./db/seedSystemPrompts.js";
import { blockViewerMutations, requireAuth, requireOwner } from "./middleware/auth.js";
import { renderStatusPage } from "./routes/statusPage.js";
import { getCurrentJobIds, start as startJobRunner, stop as stopJobRunner } from "./services/jobRunner.js";
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
import usersRouter from "./routes/users.js";
import writerPrefsSettingsRouter from "./routes/writerPrefsSettings.js";

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

// No graceful shutdown handling existed anywhere in this codebase before this — needed now so
// stopJobRunner() gets a chance to let an in-flight job finish before the process exits. Shared
// by SIGTERM/SIGINT and the /_status restart & shutdown actions below.
const shutdown = async () => {
    await stopJobRunner();
    server.close(() => process.exit(0));
};

// Run migrations, seed system prompts, and start the background job runner on startup.
// jobRunner starts last so the agentJobs table (and everything it references) definitely
// exists first — a failure here is caught by the same startup guard below.
const initializeDatabase = async () => {
    runMigrations();
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
    res.json({ status: "ok" });
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
// System-level infrastructure (LLM-spend-triggering, story-wide reindexing) that a
// viewer/editor has no legitimate reason to poke at directly — matching /api/admin/ai/users.
app.use("/api/agent/jobs", requireOwner, agentJobsRouter);
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
            currentJobIds: getCurrentJobIds()
        })
    );
});
// B44 (docs/CODE_REVIEW_2026-08-17.md) — restart and shutdown are deliberately identical, not an
// unfinished feature: a plain Node process has no way to relaunch itself, and under Docker's
// `restart: unless-stopped` policy (every compose file here), Docker can't tell "the app exited
// gracefully by request" apart from "the app exited and should come back" either way — both look
// like a graceful exit that wasn't an explicit `docker stop`. So "restart" really means "exit and
// trust whatever's supervising this process (Docker's restart policy, PM2, systemd, ...) to bring
// it back" — there's no code-level distinction to make here without also coordinating with the
// image's own entrypoint (a materially bigger change than this route pair). The status page's own
// note (routes/statusPage.ts) already explains this to the person clicking the button; this is
// the same explanation for whoever next reads this file and assumes two routes doing the exact
// same thing must be a bug.
app.post("/_status/shutdown", requireAuth, requireOwner, (_req, res) => {
    res.json({ ok: true });
    setTimeout(() => void shutdown(), 100);
});
app.post("/_status/restart", requireAuth, requireOwner, (_req, res) => {
    res.json({ ok: true });
    setTimeout(() => void shutdown(), 100);
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
