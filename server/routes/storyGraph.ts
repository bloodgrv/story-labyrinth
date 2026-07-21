import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import { STORY_GRAPH_EDGE_TYPES } from "../../src/types/storyGraph.js";
import {
    approveEdge,
    createEdge,
    deleteEdge,
    getNeighborhood,
    getStoryGraph,
    listPendingEdges,
    migrateStoryRelationships,
    rejectEdge,
    updateEdge
} from "../services/storyGraphService.js";

// Mounted at bare /api (not a single resource prefix, unlike every other router in this
// codebase) — its own routes deliberately span two path shapes that don't share one top-level
// segment: /stories/:storyId/graph/... (story-scoped list/create/migrate) and /graph/edges/:id
// (flat, id-addressed update/delete — edge id is a global UUID, no ambiguity requires storyId in
// the path, matching how chapters' own PUT/DELETE routes stay flat despite storyId being a
// required column). See server/index.ts's mount line.
const router = express.Router();

router.get("/stories/:storyId/graph", async (req, res) => {
    const [error, result] = await attemptPromise(() => getStoryGraph(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load graph", details: error.message });
        return;
    }
    res.json(result);
});

router.get("/stories/:storyId/graph/neighborhood/:entryId", async (req, res) => {
    const depth = req.query.depth === "2" ? 2 : 1;
    const [error, result] = await attemptPromise(() => getNeighborhood(req.params.storyId, req.params.entryId, depth));
    if (error) {
        res.status(500).json({ error: "Failed to load neighborhood", details: error.message });
        return;
    }
    res.json(result);
});

router.get("/stories/:storyId/graph/pending", async (req, res) => {
    const [error, result] = await attemptPromise(() => listPendingEdges(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load pending edges", details: error.message });
        return;
    }
    res.json({ pending: result });
});

router.post("/stories/:storyId/graph/edges", async (req, res) => {
    const { fromId, toId, edgeType, label, description, asPending } = req.body as {
        fromId?: unknown;
        toId?: unknown;
        edgeType?: unknown;
        label?: unknown;
        description?: unknown;
        asPending?: unknown;
    };

    if (typeof fromId !== "string" || !fromId.trim() || typeof toId !== "string" || !toId.trim()) {
        res.status(400).json({ error: "fromId and toId are required" });
        return;
    }
    if (typeof edgeType !== "string" || !STORY_GRAPH_EDGE_TYPES.includes(edgeType as (typeof STORY_GRAPH_EDGE_TYPES)[number])) {
        res.status(400).json({ error: `edgeType must be one of: ${STORY_GRAPH_EDGE_TYPES.join(", ")}` });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        createEdge({
            storyId: req.params.storyId,
            fromId,
            toId,
            edgeType,
            label: typeof label === "string" ? label : null,
            description: typeof description === "string" ? description : null,
            status: asPending === true ? "pending" : "active"
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to create edge", details: error.message });
        return;
    }
    res.status(201).json(result);
});

router.patch("/graph/edges/:id", async (req, res) => {
    const { edgeType, label, description } = req.body as { edgeType?: unknown; label?: unknown; description?: unknown };

    if (edgeType !== undefined && (typeof edgeType !== "string" || !STORY_GRAPH_EDGE_TYPES.includes(edgeType as (typeof STORY_GRAPH_EDGE_TYPES)[number]))) {
        res.status(400).json({ error: `edgeType must be one of: ${STORY_GRAPH_EDGE_TYPES.join(", ")}` });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        updateEdge(req.params.id, {
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

router.delete("/graph/edges/:id", async (req, res) => {
    const [error] = await attemptPromise(() => deleteEdge(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to delete edge", details: error.message });
        return;
    }
    res.json({ success: true });
});

router.post("/graph/edges/:id/approve", async (req, res) => {
    const [error, result] = await attemptPromise(() => approveEdge(req.params.id));
    if (error) {
        res.status(400).json({ error: "Failed to approve edge", details: error.message });
        return;
    }
    res.json(result);
});

router.post("/graph/edges/:id/reject", async (req, res) => {
    const [error, result] = await attemptPromise(() => rejectEdge(req.params.id));
    if (error) {
        res.status(400).json({ error: "Failed to reject edge", details: error.message });
        return;
    }
    res.json(result);
});

router.post("/stories/:storyId/graph/migrate-from-metadata", async (req, res) => {
    const [error, result] = await attemptPromise(() => migrateStoryRelationships(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Migration failed", details: error.message });
        return;
    }
    res.json(result);
});

export default router;
