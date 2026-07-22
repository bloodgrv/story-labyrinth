import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import multer from "multer";
import { db, schema } from "../db/client.js";
import {
    getFeatureEndpoints,
    setFeatureEndpoints
} from "../services/aiClientFactory.js";
import { migrateSceneBeatNodesInContent } from "../services/sceneBeatContentMigration.js";
import type { FeatureEndpoint, FeatureKey } from "../../src/types/aiSettings.js";
import { FEATURE_KEYS } from "../../src/types/aiSettings.js";

// Kept as a plain string[] (not FeatureProvider[]) since this is a runtime validation boundary
// over unvalidated request bodies, not a typed context.
const VALID_FEATURE_PROVIDERS: string[] = ["local", "openai", "openrouter", "grok", "grok-oauth", "local-inprocess"];

// "local-inprocess" has no HTTP client — it's only meaningful for the "embedding" feature (see
// docs/Local_Embeddings_Design.md and the matching UI restriction in FeatureEndpointsCard.tsx).
const validateProviderForFeature = (feature: string, provider: string): string | null =>
    provider === "local-inprocess" && feature !== "embedding"
        ? `'local-inprocess' is only valid for the 'embedding' feature, not '${feature}'`
        : null;

type ImportedSeries = typeof schema.series.$inferSelect;
type ImportedStory = typeof schema.stories.$inferSelect;
type ImportedChapter = typeof schema.chapters.$inferSelect;
type ImportedPrompt = typeof schema.prompts.$inferSelect;
type ImportedLorebookEntry = typeof schema.lorebookEntries.$inferSelect;
type ImportedAiChat = typeof schema.aiChats.$inferSelect;
type ImportedNote = typeof schema.notes.$inferSelect;
type ImportedAiSetting = typeof schema.aiSettings.$inferSelect;

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.get("/export", async (_, res) => {
    const [error, tables] = await attemptPromise(() =>
        Promise.all([
            db.select().from(schema.series),
            db.select().from(schema.stories),
            db.select().from(schema.chapters),
            db.select().from(schema.prompts),
            db.select().from(schema.lorebookEntries),
            db.select().from(schema.aiChats),
            db.select().from(schema.notes),
            db.select().from(schema.aiSettings)
        ])
    );

    if (error) {
        console.error("Error exporting database:", error);
        res.status(500).json({ error: "Failed to export database", details: error.message });
        return;
    }

    const [series, stories, chapters, prompts, lorebookEntries, aiChats, notes, aiSettings] = tables;
    res.json({
        version: "1.0",
        exportedAt: new Date().toISOString(),
        tables: { series, stories, chapters, prompts, lorebookEntries, aiChats, notes, aiSettings }
    });
});

router.get("/demo/exists", async (_, res) => {
    const [error, result] = await attemptPromise(async () => {
        const demoStory = await db.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.isDemo, true)).limit(1);
        return demoStory.length > 0;
    });

    if (error) {
        console.error("Error checking demo data:", error);
        res.status(500).json({ error: "Failed to check demo data", details: error.message });
        return;
    }

    res.json({ exists: result });
});

router.post("/demo/import", async (_, res) => {
    const { seedDemoStory } = await import("../db/seedDemoStory.js");

    const [error] = await attemptPromise(async () => {
        await seedDemoStory();
    });

    if (error) {
        console.error("Error importing demo story:", error);
        res.status(500).json({ error: "Failed to import demo story", details: error.message });
        return;
    }

    res.json({ success: true, message: "Demo story imported successfully" });
});

router.delete("/demo", async (_, res) => {
    const [error, deletedCounts] = await attemptPromise(async () => {
        // Delete demo data from all tables (cascade will handle related records)
        const seriesResult = await db.delete(schema.series).where(eq(schema.series.isDemo, true));
        const storiesResult = await db.delete(schema.stories).where(eq(schema.stories.isDemo, true));

        // Note: chapters, aiChats, notes will cascade automatically
        // lorebook entries need explicit deletion
        const lorebookResult = await db.delete(schema.lorebookEntries).where(eq(schema.lorebookEntries.isDemo, true));

        return {
            series: seriesResult.changes || 0,
            stories: storiesResult.changes || 0,
            lorebookEntries: lorebookResult.changes || 0
        };
    });

    if (error) {
        console.error("Error deleting demo data:", error);
        res.status(500).json({ error: "Failed to delete demo data", details: error.message });
        return;
    }

    console.log("Demo data deleted successfully:", deletedCounts);
    res.json({
        success: true,
        deleted: deletedCounts
    });
});

router.post("/import", upload.single("file"), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }

    console.log("[Import] Starting database import...");

    const fileBuffer = req.file.buffer;
    const [parseError, jsonData] = await attemptPromise(() =>
        Promise.resolve(JSON.parse(fileBuffer.toString("utf-8")))
    );

    if (parseError) {
        console.error("[Import] JSON parse failed:", parseError);
        res.status(400).json({ error: "Invalid JSON file", details: parseError.message });
        return;
    }

    if (!jsonData.version || !jsonData.tables) {
        console.error("[Import] Invalid format - missing version or tables");
        res.status(400).json({ error: "Invalid import file format - missing version or tables property" });
        return;
    }

    const { tables } = jsonData;
    console.log("[Import] File parsed. Tables found:", Object.keys(tables));

    const importTable = async <T, S extends (typeof schema)[keyof typeof schema]>(
        tableName: string,
        tableSchema: S,
        data: T[] | undefined,
        transform: (item: T) => S["$inferInsert"]
    ) => {
        if (!data || data.length === 0) {
            console.log(`[Import] Skipping ${tableName} - no data`);
            return 0;
        }

        console.log(`[Import] Importing ${data.length} ${tableName} records...`);
        const [error] = await attemptPromise(async () => {
            for (const item of data) 
                await db.insert(tableSchema).values(transform(item));
            
        });

        if (error) {
            console.error(`[Import] Failed to import ${tableName}:`, error);
            throw new Error(`Failed to import ${tableName}: ${error.message}`);
        }

        console.log(`[Import] ✓ Imported ${data.length} ${tableName}`);
        return data.length;
    };

    // Scene Beat Removal (SB5) — an old backup's own `tables.sceneBeats` (if present, taken
    // before the feature was removed) is the only source of command text left once there's no
    // live `sceneBeats` table row to look up from, so it's used below to rewrite any `scene-beat`
    // Lexical nodes into plain paragraphs before chapter content is ever restored — never
    // reinserted into a table itself (same posture as the story/series import routes).
    const sceneBeatCommandsById = new Map<string, string>(
        ((tables.sceneBeats as Array<{ id: string; command: string }>) ?? []).map(beat => [beat.id, beat.command])
    );

    const [error, counts] = await attemptPromise(async () => {
        console.log("[Import] Clearing existing data...");
        await db.delete(schema.notes);
        await db.delete(schema.lorebookEntries);
        await db.delete(schema.aiChats);
        await db.delete(schema.chapters);
        await db.delete(schema.prompts);
        await db.delete(schema.stories);
        await db.delete(schema.series);
        await db.delete(schema.aiSettings);
        console.log("[Import] ✓ Cleared existing data");

        return {
            series: await importTable("series", schema.series, tables.series, (s: ImportedSeries) => ({
                ...s,
                createdAt: new Date(s.createdAt)
            })),
            stories: await importTable("stories", schema.stories, tables.stories, (s: ImportedStory) => ({
                ...s,
                createdAt: new Date(s.createdAt)
            })),
            chapters: await importTable("chapters", schema.chapters, tables.chapters, (c: ImportedChapter) => ({
                ...c,
                content: migrateSceneBeatNodesInContent(c.content, sceneBeatCommandsById),
                createdAt: new Date(c.createdAt)
            })),
            prompts: await importTable("prompts", schema.prompts, tables.prompts, (p: ImportedPrompt) => ({
                ...p,
                createdAt: new Date(p.createdAt)
            })),
            lorebookEntries: await importTable(
                "lorebookEntries",
                schema.lorebookEntries,
                tables.lorebookEntries,
                (e: ImportedLorebookEntry) => ({ ...e, createdAt: new Date(e.createdAt) })
            ),
            aiChats: await importTable("aiChats", schema.aiChats, tables.aiChats, (c: ImportedAiChat) => ({
                ...c,
                createdAt: new Date(c.createdAt),
                updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined
            })),
            notes: await importTable("notes", schema.notes, tables.notes, (n: ImportedNote) => ({
                ...n,
                createdAt: new Date(n.createdAt),
                updatedAt: new Date(n.updatedAt)
            })),
            aiSettings: await importTable(
                "aiSettings",
                schema.aiSettings,
                tables.aiSettings,
                (s: ImportedAiSetting) => ({
                    ...s,
                    createdAt: new Date(s.createdAt),
                    lastModelsFetch: s.lastModelsFetch ? new Date(s.lastModelsFetch) : undefined
                })
            )
        };
    });

    if (error) {
        console.error("[Import] Import failed:", error);
        res.status(500).json({ error: "Failed to import database", details: error.message });
        return;
    }

    console.log("[Import] ✓ Import completed successfully");
    res.json({
        success: true,
        imported: counts
    });
});

// ── Feature endpoint routes ────────────────────────────────────────────────────
// Per-feature AI model/endpoint overrides. When a feature has an override it
// takes precedence over the global aiSettings defaults.

// GET /api/admin/feature-endpoints — return the current per-feature config
router.get("/feature-endpoints", async (_, res) => {
    const [error, endpoints] = await attemptPromise(() => getFeatureEndpoints());
    if (error) {
        res.status(500).json({ error: "Failed to load feature endpoints", details: error.message });
        return;
    }
    res.json(endpoints);
});

// PUT /api/admin/feature-endpoints — replace the entire feature endpoint map
// Body: FeatureEndpoints object (partial Record<FeatureKey, FeatureEndpoint>)
router.put("/feature-endpoints", async (req, res) => {
    const body = req.body as Record<string, unknown>;

    // Validate each entry in the payload
    for (const [key, value] of Object.entries(body)) {
        if (!FEATURE_KEYS.includes(key as FeatureKey)) {
            res.status(400).json({ error: `Unknown feature key: ${key}` });
            return;
        }
        if (typeof value !== "object" || value === null) {
            res.status(400).json({ error: `Value for '${key}' must be an object` });
            return;
        }
        const ep = value as Record<string, unknown>;
        if (!VALID_FEATURE_PROVIDERS.includes(ep.provider as string)) {
            res.status(400).json({ error: `'${key}.provider' must be one of: ${VALID_FEATURE_PROVIDERS.join(", ")}` });
            return;
        }
        const scopeError = validateProviderForFeature(key, ep.provider as string);
        if (scopeError) {
            res.status(400).json({ error: scopeError });
            return;
        }
        if (typeof ep.model !== "string" || !ep.model.trim()) {
            res.status(400).json({ error: `'${key}.model' must be a non-empty string` });
            return;
        }
    }

    const [error] = await attemptPromise(() =>
        setFeatureEndpoints(body as Parameters<typeof setFeatureEndpoints>[0])
    );
    if (error) {
        res.status(500).json({ error: "Failed to save feature endpoints", details: error.message });
        return;
    }
    res.json(body);
});

// PUT /api/admin/feature-endpoints/:feature — set or update a single feature override
// Body: FeatureEndpoint object
router.put("/feature-endpoints/:feature", async (req, res) => {
    const feature = req.params.feature as FeatureKey;
    if (!FEATURE_KEYS.includes(feature)) {
        res.status(400).json({ error: `Unknown feature key: ${feature}` });
        return;
    }

    const { provider, apiUrl, apiKey, model } = req.body as {
        provider?: unknown;
        apiUrl?: unknown;
        apiKey?: unknown;
        model?: unknown;
    };

    if (!VALID_FEATURE_PROVIDERS.includes(provider as string)) {
        res.status(400).json({ error: `provider must be one of: ${VALID_FEATURE_PROVIDERS.join(", ")}` });
        return;
    }
    const scopeError = validateProviderForFeature(feature, provider as string);
    if (scopeError) {
        res.status(400).json({ error: scopeError });
        return;
    }
    if (typeof model !== "string" || !model.trim()) {
        res.status(400).json({ error: "model must be a non-empty string" });
        return;
    }

    const endpoint: FeatureEndpoint = {
        provider: provider as FeatureEndpoint["provider"],
        model: model.trim(),
        apiUrl: typeof apiUrl === "string" ? apiUrl : null,
        apiKey: typeof apiKey === "string" ? apiKey : null
    };

    const [error, updated] = await attemptPromise(async () => {
        const current = await getFeatureEndpoints();
        const next = { ...current, [feature]: endpoint };
        await setFeatureEndpoints(next);
        return next;
    });

    if (error) {
        res.status(500).json({ error: "Failed to save feature endpoint", details: error.message });
        return;
    }
    res.json(updated);
});

// DELETE /api/admin/feature-endpoints/:feature — remove a single feature override
// The feature will fall back to global defaults after this.
router.delete("/feature-endpoints/:feature", async (req, res) => {
    const feature = req.params.feature as FeatureKey;
    if (!FEATURE_KEYS.includes(feature)) {
        res.status(400).json({ error: `Unknown feature key: ${feature}` });
        return;
    }

    const [error, updated] = await attemptPromise(async () => {
        const next = await getFeatureEndpoints();
        delete next[feature];
        await setFeatureEndpoints(next);
        return next;
    });

    if (error) {
        res.status(500).json({ error: "Failed to remove feature endpoint", details: error.message });
        return;
    }
    res.json(updated);
});

export default router;
