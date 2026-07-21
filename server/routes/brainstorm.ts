import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import {
    createChecklistItem,
    listChecklistItems,
    updateChecklistStatus
} from "../services/brainstormChecklistService.js";
import { getSlots, setSlotStatus } from "../services/brainstormSlotsService.js";
import { BRAINSTORM_SLOTS } from "../../src/types/brainstorm.js";

// P0.4 B0-B4 — Brainstorm Hub. Previously this router was a bare createCrudRouter over aiChats;
// Brainstorm chats now ride /api/chats like every other chatType (chats.ts needed zero changes
// for this, same as Outline's R5/R7 migration), so this router is repurposed entirely for the
// two genuinely new resources: the durable checklist tray (B4) and the setup-slot checklist
// (B2). Mount point (/api/brainstorm, server/index.ts) is unchanged.
const router = express.Router();

const CHECKLIST_STATUSES = ["pending", "opened", "done", "dismissed"] as const;

// GET /api/brainstorm/checklist?chatId=&status=active|done
router.get("/checklist", async (req, res) => {
    const { chatId, status } = req.query as { chatId?: string; status?: string };
    if (!chatId) {
        res.status(400).json({ error: "chatId is required" });
        return;
    }
    const filter = status === "done" ? "done" : "active";

    const [error, items] = await attemptPromise(() => listChecklistItems(chatId, filter));
    if (error) {
        res.status(500).json({ error: "Failed to load checklist", details: error.message });
        return;
    }
    res.json({ items });
});

// POST /api/brainstorm/checklist — body: { chatId, storyId, kind, payload, sourceMessageId? }
// Called immediately when a ```overview-proposal / ```handoff-packet fence is parsed client-side
// (parseOverviewProposals.ts / parseHandoffPackets.ts) — the fence itself becomes the durable
// checklist row; there is no separate "accept to persist" step (see BrainstormChecklistTray.tsx).
router.post("/checklist", async (req, res) => {
    const { chatId, storyId, kind, payload, sourceMessageId } = req.body as {
        chatId?: unknown;
        storyId?: unknown;
        kind?: unknown;
        payload?: unknown;
        sourceMessageId?: unknown;
    };
    if (typeof chatId !== "string" || typeof storyId !== "string" || typeof payload !== "object" || payload === null) {
        res.status(400).json({ error: "chatId, storyId, and payload are required" });
        return;
    }
    // "note_split" (P0.4 K2/K3) and "shuttle"/"shuttle_return" (Chat Shuttle H0) reuse this same
    // generic table/route — see NotesChecklistTray.tsx / ShuttleTray.tsx.
    if (
        kind !== "overview_proposal" &&
        kind !== "handoff" &&
        kind !== "note_split" &&
        kind !== "shuttle" &&
        kind !== "shuttle_return"
    ) {
        res.status(400).json({
            error: "kind must be one of: overview_proposal, handoff, note_split, shuttle, shuttle_return"
        });
        return;
    }

    const [error, item] = await attemptPromise(() =>
        createChecklistItem({
            chatId,
            storyId,
            kind,
            payload: payload as never,
            sourceMessageId: typeof sourceMessageId === "string" ? sourceMessageId : null
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to create checklist item", details: error.message });
        return;
    }
    res.status(201).json(item);
});

// PATCH /api/brainstorm/checklist/:id — body: { status }
router.patch("/checklist/:id", async (req, res) => {
    const { status } = req.body as { status?: string };
    if (!status || !CHECKLIST_STATUSES.includes(status as (typeof CHECKLIST_STATUSES)[number])) {
        res.status(400).json({ error: `status must be one of: ${CHECKLIST_STATUSES.join(", ")}` });
        return;
    }

    const [error, item] = await attemptPromise(() => updateChecklistStatus(req.params.id, status as never));
    if (error) {
        res.status(500).json({ error: "Failed to update checklist item", details: error.message });
        return;
    }
    if (!item) {
        res.status(404).json({ error: "Checklist item not found" });
        return;
    }
    res.json(item);
});

// GET /api/brainstorm/slots?storyId= — always returns all of BRAINSTORM_SLOTS, defaulting any
// slot with no row yet to "unknown" (see brainstormSlotsService.ts's getSlots).
router.get("/slots", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };
    if (!storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }

    const [error, slots] = await attemptPromise(() => getSlots(storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load slots", details: error.message });
        return;
    }
    res.json({ slots });
});

// PATCH /api/brainstorm/slots/:slotKey — body: { storyId, status }
router.patch("/slots/:slotKey", async (req, res) => {
    const { storyId, status } = req.body as { storyId?: string; status?: string };
    if (!storyId || (status !== "known" && status !== "unknown")) {
        res.status(400).json({ error: "storyId and status ('known'|'unknown') are required" });
        return;
    }
    if (!BRAINSTORM_SLOTS.some(s => s.key === req.params.slotKey)) {
        res.status(400).json({ error: `Unknown slot key: ${req.params.slotKey}` });
        return;
    }

    const [error, slot] = await attemptPromise(() => setSlotStatus(storyId, req.params.slotKey, status));
    if (error) {
        res.status(500).json({ error: "Failed to update slot", details: error.message });
        return;
    }
    res.json(slot);
});

export default router;
