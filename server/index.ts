import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./db/migrate.js";
import { seedSystemPrompts } from "./db/seedSystemPrompts.js";
import { requireAuth } from "./middleware/auth.js";
import adminRouter from "./routes/admin.js";
import aiRouter from "./routes/ai.js";
import authRouter from "./routes/auth.js";
import beatsRouter from "./routes/beats.js";
import brainstormRouter from "./routes/brainstorm.js";
import chaptersRouter from "./routes/chapters.js";
import chatsRouter from "./routes/chats.js";
import codexRouter from "./routes/codex.js";
import grammarRouter from "./routes/grammar.js";
import humanizerRouter from "./routes/humanizer.js";
import lorebookRouter from "./routes/lorebook.js";
import notesRouter from "./routes/notes.js";
import outlineRouter from "./routes/outline.js";
import outlineCharactersRouter from "./routes/outlineCharacters.js";
import promptsRouter from "./routes/prompts.js";
import ragRouter from "./routes/rag.js";
import scenebeatsRouter from "./routes/scenebeats.js";
import seriesRouter from "./routes/series.js";
// Import routes
import storiesRouter from "./routes/stories.js";
import ttsRouter from "./routes/tts.js";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Run migrations and seed system prompts on startup
const initializeDatabase = async () => {
    runMigrations();
    await seedSystemPrompts();
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

// API routes
app.use("/api/series", seriesRouter);
app.use("/api/stories", storiesRouter);
app.use("/api/chapters", chaptersRouter);
app.use("/api/chats", chatsRouter);
app.use("/api/codex", codexRouter);
app.use("/api/lorebook", lorebookRouter);
app.use("/api/prompts", promptsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/brainstorm", brainstormRouter);
app.use("/api/scenebeats", scenebeatsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/rag", ragRouter);
app.use("/api/tts", ttsRouter);
app.use("/api/humanizer", humanizerRouter);
app.use("/api/beats", beatsRouter);
app.use("/api/grammar", grammarRouter);
app.use("/api/outline", outlineRouter);
app.use("/api/outline-characters", outlineCharactersRouter);

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
});
