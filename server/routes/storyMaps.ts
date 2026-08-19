import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import multer from "multer";
import { db, schema } from "../db/client.js";
import {
    createMap,
    getMap,
    getMapForLocation,
    listMapsForStory,
    setMapThumbnail,
    softDeleteMap,
    updateMap
} from "../services/storyMapsService.js";
import { getStoryMapThumbnailPath, isSupportedThumbnailMimetype, saveStoryMapThumbnail } from "../services/storyMapThumbnailStorage.js";

// Maps v2 (MV0, docs/Maps_V2_Sketch_Design.md) — sketch-canvas documents (Excalidraw scenes),
// distinct from server/routes/storyMap.ts's L3 spatial relationship graph (kept as-is, deprecated
// in the UI only per decision #8). Mounted at bare /api, same two-path-shape reasoning as
// storyGraph.ts/storyMap.ts: story-scoped list/create/by-location, flat id-addressed get/update/
// delete/thumbnail (map id is a global UUID). Editor-level auth (requireAuth +
// blockViewerMutations, already applied globally in server/index.ts) — matches storyMap.ts's
// posture, no requireOwner.
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get("/stories/:storyId/maps", async (req, res) => {
    const [error, result] = await attemptPromise(() => listMapsForStory(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load story maps", details: error.message });
        return;
    }
    res.json(result);
});

router.get("/stories/:storyId/maps/by-location/:locationId", async (req, res) => {
    const [error, result] = await attemptPromise(() => getMapForLocation(req.params.storyId, req.params.locationId));
    if (error) {
        res.status(500).json({ error: "Failed to load location's map", details: error.message });
        return;
    }
    res.json(result);
});

router.post("/stories/:storyId/maps", async (req, res) => {
    const { title, locationId, sceneJson } = req.body as { title?: unknown; locationId?: unknown; sceneJson?: unknown };
    if (typeof title !== "string" || !title.trim()) {
        res.status(400).json({ error: "title is required" });
        return;
    }
    if (locationId !== undefined && locationId !== null && typeof locationId !== "string") {
        res.status(400).json({ error: "locationId must be a string or null" });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        createMap({
            storyId: req.params.storyId,
            title,
            locationId: (locationId as string | null | undefined) ?? null,
            sceneJson
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to create story map", details: error.message });
        return;
    }
    res.status(201).json(result);
});

router.get("/maps/:id", async (req, res) => {
    const [error, result] = await attemptPromise(() => getMap(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to load story map", details: error.message });
        return;
    }
    if (!result) {
        res.status(404).json({ error: "Story map not found" });
        return;
    }
    res.json(result);
});

router.patch("/maps/:id", async (req, res) => {
    const { title, locationId, sceneJson } = req.body as { title?: unknown; locationId?: unknown; sceneJson?: unknown };
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
        res.status(400).json({ error: "title must be a non-empty string" });
        return;
    }
    if (locationId !== undefined && locationId !== null && typeof locationId !== "string") {
        res.status(400).json({ error: "locationId must be a string or null" });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        updateMap(req.params.id, {
            title: typeof title === "string" ? title : undefined,
            locationId: locationId === undefined ? undefined : (locationId as string | null),
            sceneJson
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to update story map", details: error.message });
        return;
    }
    res.json(result);
});

router.delete("/maps/:id", async (req, res) => {
    const [error] = await attemptPromise(() => softDeleteMap(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to delete story map", details: error.message });
        return;
    }
    res.json({ success: true });
});

// POST /maps/:id/thumbnail - Upload (or replace) a map's list-view thumbnail. Client-rendered
// (canvas export, MV2+) — the server just stores whatever image bytes it's given, same posture as
// lorebook's own image upload.
router.post("/maps/:id/thumbnail", upload.single("file"), async (req, res) => {
    const { file } = req;
    if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }
    if (!isSupportedThumbnailMimetype(file.mimetype)) {
        res.status(400).json({ error: `Unsupported image type: ${file.mimetype}` });
        return;
    }

    const [error, result] = await attemptPromise(async () => {
        const filename = await saveStoryMapThumbnail(file.buffer, file.mimetype);
        return setMapThumbnail(req.params.id, filename);
    });
    if (error) {
        res.status(400).json({ error: "Failed to upload thumbnail", details: error.message });
        return;
    }
    res.json(result);
});

// GET /maps/:id/thumbnail - Stream the map's thumbnail. Sits under /api (requireAuth applied
// globally), not a public static mount — same posture as lorebook's own image route.
router.get("/maps/:id/thumbnail", async (req, res) => {
    const [row] = await db.select().from(schema.storyMaps).where(eq(schema.storyMaps.id, req.params.id));
    const thumbnailFilename = row?.thumbnailFilename;
    if (!thumbnailFilename) {
        res.status(404).json({ error: "No thumbnail set for this map" });
        return;
    }
    const [error, thumbnailPath] = await attemptPromise(async () => getStoryMapThumbnailPath(thumbnailFilename));
    if (error) {
        res.status(404).json({ error: "No thumbnail set for this map" });
        return;
    }
    res.sendFile(thumbnailPath);
});

export default router;
