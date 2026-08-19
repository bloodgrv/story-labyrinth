import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client.js";
import {
    copyPackForEdit,
    createPlaybookPack,
    listPlaybookPacks,
    parsePackFrontmatter,
    readPackFileText,
    resolvePlaybookPack,
    softDeletePlaybookPack,
    updatePlaybookPack
} from "../services/playbookPackService.js";
import { PLAYBOOK_KEYS, PLAYBOOK_STYLES } from "../../src/types/playbookPack.js";
import type { PlaybookScope } from "../../src/types/playbookPack.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /api/playbook-packs?storyId= — shipped+global always; +story-scoped rows when storyId given.
router.get("/", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };
    const [error, packs] = await attemptPromise(() => listPlaybookPacks(storyId ?? null));
    if (error) {
        res.status(500).json({ error: "Failed to load playbook packs", details: error.message });
        return;
    }
    res.json({ packs });
});

// GET /api/playbook-packs/resolve?storyId=&playbookKey=&style= — ladder-resolved pack (or null).
router.get("/resolve", async (req, res) => {
    const { storyId, playbookKey, style } = req.query as { storyId?: string; playbookKey?: string; style?: string };
    if (!playbookKey || !style) {
        res.status(400).json({ error: "playbookKey and style are required" });
        return;
    }
    const [error, pack] = await attemptPromise(() => resolvePlaybookPack(storyId ?? null, playbookKey, style));
    if (error) {
        res.status(500).json({ error: "Failed to resolve playbook pack", details: error.message });
        return;
    }
    res.json({ pack });
});

// POST /api/playbook-packs — manual create. packScope must be 'global' or 'story' (never 'shipped').
router.post("/", async (req, res) => {
    const { playbookKey, style, packScope, storyId, title, body } = req.body as {
        playbookKey?: unknown;
        style?: unknown;
        packScope?: unknown;
        storyId?: unknown;
        title?: unknown;
        body?: unknown;
    };

    if (typeof playbookKey !== "string" || !PLAYBOOK_KEYS.includes(playbookKey as (typeof PLAYBOOK_KEYS)[number])) {
        res.status(400).json({ error: `playbookKey must be one of: ${PLAYBOOK_KEYS.join(", ")}` });
        return;
    }
    if (typeof style !== "string" || !PLAYBOOK_STYLES.includes(style as (typeof PLAYBOOK_STYLES)[number])) {
        res.status(400).json({ error: `style must be one of: ${PLAYBOOK_STYLES.join(", ")}` });
        return;
    }
    if (packScope !== "global" && packScope !== "story") {
        res.status(400).json({ error: "packScope must be 'global' or 'story'" });
        return;
    }
    if (packScope === "story" && typeof storyId !== "string") {
        res.status(400).json({ error: "storyId is required when packScope is 'story'" });
        return;
    }
    if (typeof title !== "string" || !title.trim() || typeof body !== "string" || !body.trim()) {
        res.status(400).json({ error: "title and body are required" });
        return;
    }

    const [error, pack] = await attemptPromise(() =>
        createPlaybookPack({
            playbookKey,
            style,
            packScope,
            storyId: packScope === "story" ? (storyId as string) : null,
            title,
            body
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to create playbook pack", details: error.message });
        return;
    }
    res.status(201).json(pack);
});

// POST /api/playbook-packs/:id/copy — copy-on-edit: shipped/global -> a new global/story override.
router.post("/:id/copy", async (req, res) => {
    const { targetScope, targetStoryId } = req.body as { targetScope?: unknown; targetStoryId?: unknown };
    if (targetScope !== "global" && targetScope !== "story") {
        res.status(400).json({ error: "targetScope must be 'global' or 'story'" });
        return;
    }
    if (targetScope === "story" && typeof targetStoryId !== "string") {
        res.status(400).json({ error: "targetStoryId is required when targetScope is 'story'" });
        return;
    }

    const [error, pack] = await attemptPromise(() =>
        copyPackForEdit(req.params.id, targetScope, targetScope === "story" ? (targetStoryId as string) : null)
    );
    if (error) {
        res.status(500).json({ error: "Failed to copy playbook pack", details: error.message });
        return;
    }
    if (!pack) {
        res.status(404).json({ error: "Source playbook pack not found" });
        return;
    }
    res.status(201).json(pack);
});

// PUT /api/playbook-packs/:id — edit title/body. 404s for shipped rows (client should copy instead).
router.put("/:id", async (req, res) => {
    const { title, body } = req.body as { title?: unknown; body?: unknown };
    const [error, pack] = await attemptPromise(() =>
        updatePlaybookPack(req.params.id, {
            title: typeof title === "string" ? title : undefined,
            body: typeof body === "string" ? body : undefined
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to update playbook pack", details: error.message });
        return;
    }
    if (!pack) {
        res.status(404).json({ error: "Playbook pack not found, or it's a shipped pack (copy it to edit)" });
        return;
    }
    res.json(pack);
});

// DELETE /api/playbook-packs/:id — 404s for shipped rows (permanent floor of the ladder).
router.delete("/:id", async (req, res) => {
    const [error, deleted] = await attemptPromise(() => softDeletePlaybookPack(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to delete playbook pack", details: error.message });
        return;
    }
    if (!deleted) {
        res.status(404).json({ error: "Playbook pack not found, or it's a shipped pack" });
        return;
    }
    res.json({ success: true });
});

// POST /api/playbook-packs/import — .md/.txt file, optional frontmatter (playbookKey/style/
// packScope/title). Fields not present in frontmatter must be supplied as form fields.
router.post("/import", upload.single("file"), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }

    const [readError, rawText] = await attemptPromise(() => readPackFileText(req.file!.buffer, req.file!.originalname));
    if (readError) {
        res.status(400).json({ error: "Failed to read file", details: readError.message });
        return;
    }

    const parsed = parsePackFrontmatter(rawText);
    const form = req.body as { playbookKey?: string; style?: string; packScope?: string; storyId?: string; title?: string };

    const playbookKey = parsed.playbookKey ?? form.playbookKey;
    const style = parsed.style ?? form.style;
    const packScope = (parsed.packScope ?? form.packScope) as PlaybookScope | undefined;
    const storyId = form.storyId ?? null;
    const title = parsed.title ?? form.title ?? req.file.originalname.replace(/\.(md|txt)$/i, "");

    if (!playbookKey || !PLAYBOOK_KEYS.includes(playbookKey as (typeof PLAYBOOK_KEYS)[number])) {
        res.status(400).json({ error: `playbookKey must be one of: ${PLAYBOOK_KEYS.join(", ")}` });
        return;
    }
    if (!style || !PLAYBOOK_STYLES.includes(style as (typeof PLAYBOOK_STYLES)[number])) {
        res.status(400).json({ error: `style must be one of: ${PLAYBOOK_STYLES.join(", ")}` });
        return;
    }
    if (packScope !== "global" && packScope !== "story") {
        res.status(400).json({ error: "packScope must be 'global' or 'story'" });
        return;
    }
    if (packScope === "story" && !storyId) {
        res.status(400).json({ error: "storyId is required when packScope is 'story'" });
        return;
    }

    const [error, pack] = await attemptPromise(() =>
        createPlaybookPack({ playbookKey, style, packScope, storyId: packScope === "story" ? storyId : null, title, body: parsed.body })
    );
    if (error) {
        res.status(500).json({ error: "Failed to import playbook pack", details: error.message });
        return;
    }
    res.status(201).json(pack);
});

// GET /api/playbook-packs/global/export — backup for global-scope packs (mirrors Lorebook's own
// global export/import pair, server/routes/lorebook.ts). Shipped packs aren't included — they're
// code-seeded, not user data.
router.get("/global/export", async (_req, res) => {
    const [error, entries] = await attemptPromise(() =>
        db.select().from(schema.playbookPacks).where(eq(schema.playbookPacks.packScope, "global")).orderBy(schema.playbookPacks.createdAt)
    );
    if (error) {
        res.status(500).json({ error: "Failed to export global playbook packs", details: error.message });
        return;
    }
    res.json({
        version: "1.0",
        type: "global-playbook-packs",
        exportDate: new Date().toISOString(),
        playbookPacks: entries
    });
});

// POST /api/playbook-packs/global/import
router.post("/global/import", upload.single("file"), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }

    const [parseError, importData] = await attemptPromise(() => Promise.resolve(JSON.parse(req.file!.buffer.toString("utf-8"))));
    if (parseError) {
        res.status(400).json({ error: "Invalid JSON file", details: parseError.message });
        return;
    }
    if (!importData.type || importData.type !== "global-playbook-packs" || !Array.isArray(importData.playbookPacks)) {
        res.status(400).json({ error: "Invalid global playbook packs data format" });
        return;
    }

    const now = new Date();
    const newRows = importData.playbookPacks
        .filter((row: { packScope?: string }) => !row.packScope || row.packScope === "global")
        .map((row: Record<string, unknown>) => ({
            ...row,
            id: nanoid(),
            packScope: "global",
            storyId: null,
            createdAt: now,
            updatedAt: now
        }));

    if (newRows.length === 0) {
        res.json({ imported: 0 });
        return;
    }

    const [error] = await attemptPromise(() => db.insert(schema.playbookPacks).values(newRows));
    if (error) {
        res.status(500).json({ error: "Failed to import global playbook packs", details: error.message });
        return;
    }
    res.json({ imported: newRows.length });
});

export default router;
