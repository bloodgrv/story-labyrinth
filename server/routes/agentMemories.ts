import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import { AGENT_MEMORY_CATEGORIES } from "../../src/types/agentMemory.js";
import type { AgentMemoryCategory, AgentMemoryStatus } from "../../src/types/agentMemory.js";
import {
    approveMemory,
    createUserNote,
    deleteMemoryAndUnindex,
    getMemory,
    listMemories,
    patchMemory,
    rejectMemoryChange
} from "../services/agentMemoriesService.js";

const router = express.Router();

const STATUSES: AgentMemoryStatus[] = ["pending", "active", "rejected", "superseded"];

// GET /api/agent/memories?storyId=&status=&global= — list, most recent first.
// global=true lists only cross-project (storyId IS NULL) rows — the writer_pref browser (P1.1).
router.get("/", async (req, res) => {
    const { storyId, status, global } = req.query as { storyId?: string; status?: string; global?: string };
    if (status && !STATUSES.includes(status as AgentMemoryStatus)) {
        res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
        return;
    }

    const [error, memories] = await attemptPromise(() =>
        listMemories({ storyId, status: status as AgentMemoryStatus | undefined, global: global === "true" })
    );
    if (error) {
        res.status(500).json({ error: "Failed to load memories", details: error.message });
        return;
    }
    res.json({ memories });
});

// GET /api/agent/memories/:id
router.get("/:id", async (req, res) => {
    const [error, memory] = await attemptPromise(() => getMemory(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to load memory", details: error.message });
        return;
    }
    if (!memory) {
        res.status(404).json({ error: "Memory not found" });
        return;
    }
    res.json(memory);
});

// POST /api/agent/memories — user-authored note, goes active immediately.
// Body: { storyId: string|null, memoryKey?: string, category, title, body, pinned? }
router.post("/", async (req, res) => {
    const { storyId, memoryKey, category, title, body, pinned } = req.body as {
        storyId?: unknown;
        memoryKey?: unknown;
        category?: unknown;
        title?: unknown;
        body?: unknown;
        pinned?: unknown;
    };

    if (typeof category !== "string" || !AGENT_MEMORY_CATEGORIES.includes(category as AgentMemoryCategory)) {
        res.status(400).json({ error: `category must be one of: ${AGENT_MEMORY_CATEGORIES.join(", ")}` });
        return;
    }
    if (typeof title !== "string" || !title.trim() || typeof body !== "string" || !body.trim()) {
        res.status(400).json({ error: "title and body are required" });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        createUserNote({
            storyId: typeof storyId === "string" ? storyId : null,
            memoryKey: typeof memoryKey === "string" ? memoryKey : undefined,
            category,
            title,
            body,
            pinned: typeof pinned === "boolean" ? pinned : undefined
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to create memory", details: error.message });
        return;
    }
    res.status(201).json(result.memory);
});

// POST /api/agent/memories/:id/approve — pending -> active (+ supersede any prior active row
// sharing memoryKey).
router.post("/:id/approve", async (req, res) => {
    const [findError, existing] = await attemptPromise(() => getMemory(req.params.id));
    if (findError) {
        res.status(500).json({ error: "Failed to load memory", details: findError.message });
        return;
    }
    if (!existing) {
        res.status(404).json({ error: "Memory not found" });
        return;
    }
    if (existing.status !== "pending") {
        res.status(400).json({ error: `Memory is already '${existing.status}'` });
        return;
    }

    const [error, result] = await attemptPromise(() => approveMemory(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to approve memory", details: error.message });
        return;
    }
    res.json(result);
});

// POST /api/agent/memories/:id/reject — pending -> rejected.
router.post("/:id/reject", async (req, res) => {
    const [findError, existing] = await attemptPromise(() => getMemory(req.params.id));
    if (findError) {
        res.status(500).json({ error: "Failed to load memory", details: findError.message });
        return;
    }
    if (!existing) {
        res.status(404).json({ error: "Memory not found" });
        return;
    }
    if (existing.status !== "pending") {
        res.status(400).json({ error: `Memory is already '${existing.status}'` });
        return;
    }

    const [error, memory] = await attemptPromise(() => rejectMemoryChange(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to reject memory", details: error.message });
        return;
    }
    res.json(memory);
});

// PATCH /api/agent/memories/:id — content edit (pending draft or active in-place) and/or pin
// toggle. Body: { title?, body?, category?, pinned? }
router.patch("/:id", async (req, res) => {
    const [findError, existing] = await attemptPromise(() => getMemory(req.params.id));
    if (findError) {
        res.status(500).json({ error: "Failed to load memory", details: findError.message });
        return;
    }
    if (!existing) {
        res.status(404).json({ error: "Memory not found" });
        return;
    }

    const { title, body, category, pinned } = req.body as {
        title?: unknown;
        body?: unknown;
        category?: unknown;
        pinned?: unknown;
    };
    if (category !== undefined && (typeof category !== "string" || !AGENT_MEMORY_CATEGORIES.includes(category as AgentMemoryCategory))) {
        res.status(400).json({ error: `category must be one of: ${AGENT_MEMORY_CATEGORIES.join(", ")}` });
        return;
    }

    const [error, memory] = await attemptPromise(() =>
        patchMemory(req.params.id, {
            title: typeof title === "string" ? title : undefined,
            body: typeof body === "string" ? body : undefined,
            category: category as AgentMemoryCategory | undefined,
            pinned: typeof pinned === "boolean" ? pinned : undefined
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to update memory", details: error.message });
        return;
    }
    res.json(memory);
});

// DELETE /api/agent/memories/:id — any status, removes the index entry if it was active.
router.delete("/:id", async (req, res) => {
    const [findError, existing] = await attemptPromise(() => getMemory(req.params.id));
    if (findError) {
        res.status(500).json({ error: "Failed to load memory", details: findError.message });
        return;
    }
    if (!existing) {
        res.status(404).json({ error: "Memory not found" });
        return;
    }

    const [error] = await attemptPromise(() => deleteMemoryAndUnindex(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to delete memory", details: error.message });
        return;
    }
    res.json({ success: true });
});

export default router;
