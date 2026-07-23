import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import { STORY_MAP_EDGE_TYPES } from "../../src/types/storyMap.js";
import {
    createMapEdge,
    deleteMapEdge,
    getMapLayout,
    getStoryMap,
    resetMapLayout,
    saveMapLayoutPosition,
    updateMapEdge
} from "../services/storyMapService.js";

// Mounted at bare /api, same reasoning as storyGraph.ts (two path shapes: story-scoped list/
// create, and flat id-addressed update/delete for edges — edge id is a global UUID). See
// server/index.ts's mount line.
const router = express.Router();

router.get("/stories/:storyId/map", async (req, res) => {
    const [error, result] = await attemptPromise(() => getStoryMap(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load story map", details: error.message });
        return;
    }
    res.json(result);
});

router.post("/stories/:storyId/map/edges", async (req, res) => {
    const { fromId, toId, edgeType, label, description } = req.body as {
        fromId?: unknown;
        toId?: unknown;
        edgeType?: unknown;
        label?: unknown;
        description?: unknown;
    };

    if (typeof fromId !== "string" || !fromId.trim() || typeof toId !== "string" || !toId.trim()) {
        res.status(400).json({ error: "fromId and toId are required" });
        return;
    }
    if (typeof edgeType !== "string" || !STORY_MAP_EDGE_TYPES.includes(edgeType as (typeof STORY_MAP_EDGE_TYPES)[number])) {
        res.status(400).json({ error: `edgeType must be one of: ${STORY_MAP_EDGE_TYPES.join(", ")}` });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        createMapEdge({
            storyId: req.params.storyId,
            fromId,
            toId,
            edgeType,
            label: typeof label === "string" ? label : null,
            description: typeof description === "string" ? description : null
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to create edge", details: error.message });
        return;
    }
    res.status(201).json(result);
});

router.patch("/map/edges/:id", async (req, res) => {
    const { edgeType, label, description } = req.body as { edgeType?: unknown; label?: unknown; description?: unknown };

    if (edgeType !== undefined && (typeof edgeType !== "string" || !STORY_MAP_EDGE_TYPES.includes(edgeType as (typeof STORY_MAP_EDGE_TYPES)[number]))) {
        res.status(400).json({ error: `edgeType must be one of: ${STORY_MAP_EDGE_TYPES.join(", ")}` });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        updateMapEdge(req.params.id, {
            edgeType: typeof edgeType === "string" ? edgeType : undefined,
            label: label === null || typeof label === "string" ? label : undefined,
            description: description === null || typeof description === "string" ? description : undefined
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to update edge", details: error.message });
        return;
    }
    res.json(result);
});

router.delete("/map/edges/:id", async (req, res) => {
    const [error] = await attemptPromise(() => deleteMapEdge(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to delete edge", details: error.message });
        return;
    }
    res.json({ success: true });
});

router.get("/stories/:storyId/map/layout", async (req, res) => {
    const [error, result] = await attemptPromise(() => getMapLayout(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load layout", details: error.message });
        return;
    }
    res.json({ positions: result });
});

router.put("/stories/:storyId/map/layout/:nodeId", async (req, res) => {
    const { x, y } = req.body as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") {
        res.status(400).json({ error: "x and y must be numbers" });
        return;
    }

    const [error, result] = await attemptPromise(() => saveMapLayoutPosition(req.params.storyId, req.params.nodeId, x, y));
    if (error) {
        res.status(500).json({ error: "Failed to save layout position", details: error.message });
        return;
    }
    res.json(result);
});

router.delete("/stories/:storyId/map/layout", async (req, res) => {
    const [error] = await attemptPromise(() => resetMapLayout(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to reset layout", details: error.message });
        return;
    }
    res.json({ success: true });
});

export default router;
