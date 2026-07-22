import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import { logTransfer, listTransfers } from "../services/deskTransfersService.js";

// Transfer Log (docs/Transfer_Log_And_Settings_IA_Design.md) — every writer lives in a client
// event handler (a tray's "Open" button, a fence-parse callback, a "Send to Notes chat" click),
// so unlike most server-authored logs in this codebase, rows are created via a client POST rather
// than an internal-only service call. The POST is fire-and-forget from every call site — a
// transfer-log write failing must never block the real seed dispatch it's describing.
const router = express.Router();

const EVENTS = ["proposed", "opened"] as const;
const KINDS = ["shuttle", "shuttle_return", "handoff", "overview_proposal", "lore_suggestion", "highlight_to_notes"] as const;

// GET /api/stories/:storyId/transfers?all=true — defaults to the 30-day UI window; `all=true`
// shows everything not yet hard-deleted (90d, pruneHistoryJob.ts).
router.get("/stories/:storyId/transfers", async (req, res) => {
    const { all } = req.query as { all?: string };

    const [error, transfers] = await attemptPromise(() => listTransfers({ storyId: req.params.storyId, all: all === "true" }));
    if (error) {
        res.status(500).json({ error: "Failed to load transfers", details: error.message });
        return;
    }
    res.json({ transfers });
});

// POST /api/stories/:storyId/transfers — body: { event, kind, fromDesk, fromChatId?,
// fromChatTitleSnapshot?, toDesk, toChatId?, toChatTitleSnapshot?, subject, crumb?,
// sourceChecklistItemId? }. No destination-answer-body field exists on this row shape by design.
router.post("/stories/:storyId/transfers", async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const { event, kind, fromDesk, toDesk, subject } = body;

    if (!EVENTS.includes(event as (typeof EVENTS)[number])) {
        res.status(400).json({ error: `event must be one of: ${EVENTS.join(", ")}` });
        return;
    }
    if (!KINDS.includes(kind as (typeof KINDS)[number])) {
        res.status(400).json({ error: `kind must be one of: ${KINDS.join(", ")}` });
        return;
    }
    if (typeof fromDesk !== "string" || !fromDesk.trim() || typeof toDesk !== "string" || !toDesk.trim()) {
        res.status(400).json({ error: "fromDesk and toDesk are required" });
        return;
    }
    if (typeof subject !== "string" || !subject.trim()) {
        res.status(400).json({ error: "subject is required" });
        return;
    }

    const optionalString = (key: string): string | null => (typeof body[key] === "string" ? (body[key] as string) : null);

    const [error, transfer] = await attemptPromise(() =>
        logTransfer({
            storyId: req.params.storyId,
            event: event as "proposed" | "opened",
            kind: kind as (typeof KINDS)[number],
            fromDesk,
            fromChatId: optionalString("fromChatId"),
            fromChatTitleSnapshot: optionalString("fromChatTitleSnapshot"),
            toDesk,
            toChatId: optionalString("toChatId"),
            toChatTitleSnapshot: optionalString("toChatTitleSnapshot"),
            subject,
            crumb: optionalString("crumb"),
            sourceChecklistItemId: optionalString("sourceChecklistItemId")
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to log transfer", details: error.message });
        return;
    }
    res.status(201).json(transfer);
});

export default router;
