import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import multer from "multer";
import { importPoolFromCsv, importPoolsFromJson, type ImportScope } from "../services/nameGeneratorImportService.js";
import {
    deleteFavorite,
    getStoryDefaults,
    insertFavorite,
    listFavoritesForStory,
    listPoolsForScope,
    saveStoryDefaults
} from "../services/nameGeneratorRepository.js";
import { generateNames, listUsedNamesForStory, markNameUsed } from "../services/nameGeneratorService.js";
import { installPack, listPacks, uninstallPack } from "../services/nameGeneratorPackService.js";
import { GENERATE_KINDS, NAME_POOL_GENDERS, NAME_POOL_KINDS, USED_NAME_SOURCES, USED_NAME_TYPES } from "../../src/types/nameGenerator.js";
import type { GenerateKind, ImportLevel, NamePoolGender, NamePoolKind, UsedNameSource, UsedNameType } from "../../src/types/nameGenerator.js";

const router = express.Router();
// Same limits/config posture as lorebook.ts's own import upload — small text files (JSON/CSV
// packs), memory storage is fine (no need to touch disk for something this size).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /api/name-generator/pools?storyId=&kind=&gender=&region= — pools visible to the given
// scope (global always; + story/series level if storyId given), optionally filtered.
router.get("/pools", async (req, res) => {
    const { storyId, kind, gender, region } = req.query as { storyId?: string; kind?: string; gender?: string; region?: string };

    if (kind && !NAME_POOL_KINDS.includes(kind as NamePoolKind)) {
        res.status(400).json({ error: `kind must be one of: ${NAME_POOL_KINDS.join(", ")}` });
        return;
    }
    if (gender && !NAME_POOL_GENDERS.includes(gender as NamePoolGender)) {
        res.status(400).json({ error: `gender must be one of: ${NAME_POOL_GENDERS.join(", ")}` });
        return;
    }

    const [error, pools] = await attemptPromise(() =>
        listPoolsForScope(storyId, {
            kind: kind as NamePoolKind | undefined,
            gender: gender as NamePoolGender | undefined,
            region
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to load name pools", details: error.message });
        return;
    }
    res.json({ pools });
});

// POST /api/name-generator/generate — non-destructive: never writes to usedNames. The caller
// (panel/syntax/fence) records a pick via POST /use only once the user actually takes a name.
// Body: GenerateNamesRequest (see src/types/nameGenerator.ts)
router.post("/generate", async (req, res) => {
    const { storyId, kind, gender, region, era, poolId, count, maxLength, startsWith } = req.body as {
        storyId?: unknown;
        kind?: unknown;
        gender?: unknown;
        region?: unknown;
        era?: unknown;
        poolId?: unknown;
        count?: unknown;
        maxLength?: unknown;
        startsWith?: unknown;
    };

    if (typeof storyId !== "string" || !storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }
    if (typeof kind !== "string" || !GENERATE_KINDS.includes(kind as GenerateKind)) {
        res.status(400).json({ error: `kind must be one of: ${GENERATE_KINDS.join(", ")}` });
        return;
    }
    if (gender !== undefined && (typeof gender !== "string" || !NAME_POOL_GENDERS.includes(gender as NamePoolGender))) {
        res.status(400).json({ error: `gender must be one of: ${NAME_POOL_GENDERS.join(", ")}` });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        generateNames({
            storyId,
            kind: kind as GenerateKind,
            gender: gender as NamePoolGender | undefined,
            region: typeof region === "string" ? region : undefined,
            era: typeof era === "string" ? era : undefined,
            poolId: typeof poolId === "string" ? poolId : undefined,
            count: typeof count === "number" ? count : undefined,
            maxLength: typeof maxLength === "number" ? maxLength : undefined,
            startsWith: typeof startsWith === "string" ? startsWith : undefined
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to generate names", details: error.message });
        return;
    }
    res.json(result);
});

// POST /api/name-generator/use — record a name as used for a story (idempotent on
// storyId+name+nameType). Body: MarkNameUsedRequest
router.post("/use", async (req, res) => {
    const { storyId, name, nameType, source, poolNameId } = req.body as {
        storyId?: unknown;
        name?: unknown;
        nameType?: unknown;
        source?: unknown;
        poolNameId?: unknown;
    };

    if (typeof storyId !== "string" || !storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }
    if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
    }
    if (typeof nameType !== "string" || !USED_NAME_TYPES.includes(nameType as UsedNameType)) {
        res.status(400).json({ error: `nameType must be one of: ${USED_NAME_TYPES.join(", ")}` });
        return;
    }
    if (typeof source !== "string" || !USED_NAME_SOURCES.includes(source as UsedNameSource)) {
        res.status(400).json({ error: `source must be one of: ${USED_NAME_SOURCES.join(", ")}` });
        return;
    }

    const [error, usedName] = await attemptPromise(() =>
        markNameUsed({
            storyId,
            name: name.trim(),
            nameType: nameType as UsedNameType,
            source: source as UsedNameSource,
            poolNameId: typeof poolNameId === "string" ? poolNameId : null
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to record used name", details: error.message });
        return;
    }
    res.status(201).json({ usedName });
});

// GET /api/name-generator/used?storyId= — used-names ledger for a single story (not widened to
// series siblings — this is "what's used here", the widening only applies to the collision
// check inside /generate).
router.get("/used", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };
    if (!storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }

    const [error, usedNames] = await attemptPromise(() => listUsedNamesForStory(storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load used names", details: error.message });
        return;
    }
    res.json({ usedNames });
});

// ── Favorites (NG7) ──────────────────────────────────────────────────────────────

// GET /api/name-generator/favorites?storyId=
router.get("/favorites", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };
    if (!storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }

    const [error, favorites] = await attemptPromise(() => listFavoritesForStory(storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load favorites", details: error.message });
        return;
    }
    res.json({ favorites });
});

// POST /api/name-generator/favorites — idempotent on storyId+name+nameType.
// Body: { storyId, name, nameType, poolId? }
router.post("/favorites", async (req, res) => {
    const { storyId, name, nameType, poolId } = req.body as { storyId?: unknown; name?: unknown; nameType?: unknown; poolId?: unknown };

    if (typeof storyId !== "string" || !storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }
    if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
    }
    if (typeof nameType !== "string" || !USED_NAME_TYPES.includes(nameType as UsedNameType)) {
        res.status(400).json({ error: `nameType must be one of: ${USED_NAME_TYPES.join(", ")}` });
        return;
    }

    const [error, favorite] = await attemptPromise(() =>
        insertFavorite({ storyId, name: name.trim(), nameType: nameType as UsedNameType, poolId: typeof poolId === "string" ? poolId : null })
    );
    if (error) {
        res.status(500).json({ error: "Failed to add favorite", details: error.message });
        return;
    }
    res.status(201).json({ favorite });
});

// DELETE /api/name-generator/favorites/:id?storyId= — storyId required so a favorite can only
// be deleted by a request scoped to its own story (see deleteFavorite's own doc comment).
router.delete("/favorites/:id", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };
    if (!storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }

    const [error, deleted] = await attemptPromise(() => deleteFavorite(storyId, req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to remove favorite", details: error.message });
        return;
    }
    if (!deleted) {
        res.status(404).json({ error: "Favorite not found" });
        return;
    }
    res.json({ success: true });
});

// ── Story name defaults (NG7) ────────────────────────────────────────────────────

// GET /api/name-generator/defaults?storyId= — null fields (or a null defaults object entirely)
// mean "nothing saved yet / left as Any", not an error.
router.get("/defaults", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };
    if (!storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }

    const [error, defaults] = await attemptPromise(() => getStoryDefaults(storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load story defaults", details: error.message });
        return;
    }
    res.json({ defaults });
});

// PUT /api/name-generator/defaults — upsert. Body: { storyId, era?, region?, gender? }
// (undefined = leave unchanged, explicit null = clear back to "Any" — see saveStoryDefaults).
router.put("/defaults", async (req, res) => {
    const { storyId, era, region, gender } = req.body as { storyId?: unknown; era?: unknown; region?: unknown; gender?: unknown };

    if (typeof storyId !== "string" || !storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }
    if (gender !== undefined && gender !== null && !NAME_POOL_GENDERS.includes(gender as NamePoolGender)) {
        res.status(400).json({ error: `gender must be one of: ${NAME_POOL_GENDERS.join(", ")}` });
        return;
    }

    const [error, defaults] = await attemptPromise(() =>
        saveStoryDefaults({
            storyId,
            era: era === undefined ? undefined : (era as string | null),
            region: region === undefined ? undefined : (region as string | null),
            gender: gender === undefined ? undefined : (gender as NamePoolGender | null)
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to save story defaults", details: error.message });
        return;
    }
    res.json({ defaults });
});

// POST /api/name-generator/import — multipart: file + format ("json"|"csv") + level
// ("global"|"story") + storyId (required when level is "story"). CSV additionally requires
// poolName/kind/region (+ optional gender/eraStart/eraEnd) since a CSV file carries only the
// name/tier list, not pool metadata. JSON files carry full pool definitions (one object or an
// array of them) and need none of those extra fields.
router.post("/import", upload.single("file"), async (req, res) => {
    const { file } = req;
    if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }

    const { format, level, storyId, poolName, kind, gender, region, eraStart, eraEnd } = req.body as Record<string, string | undefined>;

    if (format !== "json" && format !== "csv") {
        res.status(400).json({ error: 'format must be "json" or "csv"' });
        return;
    }
    if (level !== "global" && level !== "story") {
        res.status(400).json({ error: 'level must be "global" or "story"' });
        return;
    }
    if (level === "story" && !storyId) {
        res.status(400).json({ error: "storyId is required when level is story" });
        return;
    }

    const scope: ImportScope = { level, storyId };
    const text = file.buffer.toString("utf-8");

    if (format === "json") {
        const [error, results] = await attemptPromise(() => importPoolsFromJson(text, scope));
        if (error) {
            res.status(400).json({ error: "Failed to import JSON pack", details: error.message });
            return;
        }
        res.status(201).json({
            pools: results.map(r => r.pool),
            namesImported: results.reduce((sum, r) => sum + r.namesImported, 0),
            duplicatesSkipped: results.reduce((sum, r) => sum + r.duplicatesSkipped, 0)
        });
        return;
    }

    if (!poolName || !kind || !region) {
        res.status(400).json({ error: "poolName, kind, and region are required for CSV import" });
        return;
    }
    if (!NAME_POOL_KINDS.includes(kind as NamePoolKind)) {
        res.status(400).json({ error: `kind must be one of: ${NAME_POOL_KINDS.join(", ")}` });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        importPoolFromCsv(
            text,
            {
                name: poolName,
                kind,
                gender,
                region,
                eraStart: eraStart ? Number(eraStart) : undefined,
                eraEnd: eraEnd ? Number(eraEnd) : undefined
            },
            scope
        )
    );
    if (error) {
        res.status(400).json({ error: "Failed to import CSV", details: error.message });
        return;
    }
    res.status(201).json({ pools: [result.pool], namesImported: result.namesImported, duplicatesSkipped: result.duplicatesSkipped });
});

// ── Region packs (NP0-NP5, docs/Name_Generator_Region_Packs_Design.md) ─────────────

// GET /api/name-generator/packs?storyId= — vendored pack catalog, annotated with per-scope
// install status (global always checked; story only when storyId is given).
router.get("/packs", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };

    const [error, packs] = await attemptPromise(() => listPacks(storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load name packs", details: error.message });
        return;
    }
    res.json({ packs });
});

// POST /api/name-generator/packs/:packId/install — body: { level, storyId?, replace? }.
// Idempotent (deterministic pool ids): a plain re-install is a clean no-op per pool; replace:true
// clears every pool this pack previously installed at this scope first.
router.post("/packs/:packId/install", async (req, res) => {
    const { level, storyId, replace } = req.body as { level?: unknown; storyId?: unknown; replace?: unknown };

    if (level !== "global" && level !== "story") {
        res.status(400).json({ error: 'level must be "global" or "story"' });
        return;
    }
    if (level === "story" && (typeof storyId !== "string" || !storyId)) {
        res.status(400).json({ error: "storyId is required when level is story" });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        installPack(
            req.params.packId,
            { level: level as ImportLevel, scopeId: level === "story" ? (storyId as string) : null },
            Boolean(replace)
        )
    );
    if (error) {
        res.status(400).json({ error: "Failed to install pack", details: error.message });
        return;
    }
    res.status(201).json(result);
});

// POST /api/name-generator/packs/:packId/uninstall — body: { level, storyId? }. Deletes every
// pool previously installed under this pack's id prefix at the given scope (cascade-deletes names).
router.post("/packs/:packId/uninstall", async (req, res) => {
    const { level, storyId } = req.body as { level?: unknown; storyId?: unknown };

    if (level !== "global" && level !== "story") {
        res.status(400).json({ error: 'level must be "global" or "story"' });
        return;
    }
    if (level === "story" && (typeof storyId !== "string" || !storyId)) {
        res.status(400).json({ error: "storyId is required when level is story" });
        return;
    }

    const [error, poolsRemoved] = await attemptPromise(() =>
        uninstallPack(req.params.packId, { level: level as ImportLevel, scopeId: level === "story" ? (storyId as string) : null })
    );
    if (error) {
        res.status(500).json({ error: "Failed to uninstall pack", details: error.message });
        return;
    }
    res.json({ poolsRemoved });
});

export default router;
