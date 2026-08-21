import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import { z } from "zod";
import {
    createChecklistItem,
    listChecklistItems,
    updateChecklistStatus
} from "../services/brainstormChecklistService.js";
import { getSlots, setSlotStatus } from "../services/brainstormSlotsService.js";
import { extractBrainstormProposals } from "../services/brainstormExtractService.js";
import { BRAINSTORM_SLOTS } from "../../src/types/brainstorm.js";

// P0.4 B0-B4 — Brainstorm Hub. Previously this router was a bare createCrudRouter over aiChats;
// Brainstorm chats now ride /api/chats like every other chatType (chats.ts needed zero changes
// for this, same as Outline's R5/R7 migration), so this router is repurposed entirely for the
// two genuinely new resources: the durable checklist tray (B4) and the setup-slot checklist
// (B2). Mount point (/api/brainstorm, server/index.ts) is unchanged.
const router = express.Router();

const CHECKLIST_STATUSES = ["pending", "opened", "done", "dismissed"] as const;

// B39 extension (docs/CURRENT_BACKLOG.md P2 residual) — this route is the durable-persist step
// for every AI-fence-parsed proposal this app has that isn't Codex-shaped: overview-proposal,
// handoff-packet, note-split-proposal, and shuttle-proposal/shuttle-return all land here as soon
// as the client parses the fence, with `payload` previously typed as a bare `object` and passed
// straight to `createChecklistItem` as `never` — no shape check at all. Schema mirrors the
// discriminated payload types in src/types/brainstorm.ts. `character_batch` isn't an AI-fence
// payload (it's assembled client-side from documentImportService.ts drafts already returned by
// an earlier, separately-validated server call), so its `drafts` array stays loosely typed here
// — validating DocumentImportDraft's full shape a second time isn't proportionate to this pass.
const lorebookCategorySchema = z.enum(["character", "location", "item", "event", "note", "synopsis", "starting scenario", "timeline"]);
const noteTypeSchema = z.enum(["idea", "research", "todo", "other"]);
const overviewProposalPayloadSchema = z.discriminatedUnion("proposalType", [
    z.object({ proposalType: z.literal("synopsis"), content: z.string(), slotKey: z.string().optional() }).strict(),
    z.object({
        proposalType: z.literal("note"),
        title: z.string(),
        content: z.string(),
        noteType: noteTypeSchema,
        slotKey: z.string().optional()
    }).strict(),
    z.object({
        proposalType: z.literal("memory"),
        title: z.string(),
        body: z.string(),
        category: z.string(),
        slotKey: z.string().optional()
    }).strict()
]);
const handoffPacketPayloadSchema = z
    .object({
        destination: z.enum(["outline", "worldbuilding", "notes", "research"]),
        summary: z.string(),
        detail: z.string(),
        seedName: z.string().optional(),
        seedCategory: lorebookCategorySchema.optional()
    })
    .strict();
const noteSplitProposalPayloadSchema = z
    .object({
        notes: z.array(z.object({ title: z.string(), content: z.string(), type: noteTypeSchema }).strict())
    })
    .strict();
const shuttlePayloadSchema = z
    .object({ destination: z.literal("research"), question: z.string(), crumb: z.string().optional() })
    .strict();
const shuttleReturnPayloadSchema = z
    .object({
        summary: z.string(),
        links: z.array(z.object({ title: z.string(), url: z.string() }).strict())
    })
    .strict();
const characterBatchPayloadSchema = z
    .object({ filename: z.string(), drafts: z.array(z.record(z.string(), z.unknown())) })
    .strict();
const CHECKLIST_PAYLOAD_SCHEMAS = {
    overview_proposal: overviewProposalPayloadSchema,
    handoff: handoffPacketPayloadSchema,
    note_split: noteSplitProposalPayloadSchema,
    shuttle: shuttlePayloadSchema,
    shuttle_return: shuttleReturnPayloadSchema,
    character_batch: characterBatchPayloadSchema
} as const;

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
    // "note_split" (P0.4 K2/K3), "shuttle"/"shuttle_return" (Chat Shuttle H0), and
    // "character_batch" (2026-08-14, MultiEntryImportDialog.tsx's Brainstorm entry point) all
    // reuse this same generic table/route — see NotesChecklistTray.tsx / ShuttleTray.tsx /
    // BrainstormChecklistTray.tsx.
    if (typeof kind !== "string" || !(kind in CHECKLIST_PAYLOAD_SCHEMAS)) {
        res.status(400).json({
            error: `kind must be one of: ${Object.keys(CHECKLIST_PAYLOAD_SCHEMAS).join(", ")}`
        });
        return;
    }

    const payloadSchema = CHECKLIST_PAYLOAD_SCHEMAS[kind as keyof typeof CHECKLIST_PAYLOAD_SCHEMAS];
    const parsedPayload = payloadSchema.safeParse(payload);
    if (!parsedPayload.success) {
        res.status(400).json({ error: "Invalid checklist payload", details: parsedPayload.error.issues });
        return;
    }

    const [error, item] = await attemptPromise(() =>
        createChecklistItem({
            chatId,
            storyId,
            kind: kind as keyof typeof CHECKLIST_PAYLOAD_SCHEMAS,
            payload: parsedPayload.data as never,
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

// POST /api/brainstorm/extract-proposals — body: { replyText, userMessageText? }
// Automatic reliability fix (2026-08-17, see brainstormExtractService.ts's own comment): a
// narrow, isolated, non-streaming follow-up extraction pass over an already-generated Brainstorm
// reply, since the reply's own fence-emission during normal conversational generation is
// unreliable. Fired automatically by the client after every Brainstorm reply, and manually via
// a per-message "Propose from this reply" retry action — same endpoint either way. Always
// resolves (never 500s on "no provider"/model failure — extractBrainstormProposals degrades to
// an empty result), since this must never disrupt a chat turn that already succeeded.
router.post("/extract-proposals", async (req, res) => {
    const { replyText, userMessageText } = req.body as { replyText?: unknown; userMessageText?: unknown };
    if (typeof replyText !== "string" || !replyText.trim()) {
        res.status(400).json({ error: "replyText is required" });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        extractBrainstormProposals(replyText, typeof userMessageText === "string" ? userMessageText : undefined)
    );
    if (error) {
        res.status(500).json({ error: "Failed to extract proposals", details: error.message });
        return;
    }
    res.json(result);
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
