import { attemptPromise } from "@jfdi/attempt";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { parseJson } from "../lib/json.js";
import {
    getCodexEntry,
    getPendingChangesForEntry,
    getSnapshotsForEntry,
    setSnapshotLabel
} from "../services/codexRepository.js";
import {
    approvePendingChange,
    type ChangeProposal,
    createCodexEntry,
    enableCodexForEntry,
    proposeChange,
    recordStateChange,
    rejectPendingChange,
    restoreSnapshot
} from "../services/codexService.js";
import { detectNewEntitiesForChapter } from "../services/entityDetector.js";

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
        const [error] = await attemptPromise(() => fn(req, res));
        if (error) {
            console.error("Codex error:", error);
            res.status(500).json({ error: error.message || "Server error" });
        }
    };

// Normalise a raw lorebookEntries row for the wire — parse JSON columns.
const transformEntry = (row: Awaited<ReturnType<typeof getCodexEntry>>) => {
    if (!row) return null;
    return {
        ...row,
        tags: parseJson(row.tags),
        codexState: parseJson(row.codexState)
    };
};

// ── POST /api/codex/detect ────────────────────────────────────────────────────
// Scan a chapter for named entities not yet in the lorebook and return suggestions.
// Body: { chapterId: string, storyId: string }
// Response: { suggestions: EntitySuggestion[], chapterId, storyId }
// The caller shows suggestions to the user; approved ones are created via POST /api/codex.
router.post(
    "/detect",
    asyncHandler(async (req, res) => {
        const { chapterId, storyId } = req.body as { chapterId?: string; storyId?: string };
        if (!chapterId || !storyId) {
            res.status(400).json({ error: "chapterId and storyId are required" });
            return;
        }

        const result = await detectNewEntitiesForChapter(chapterId, storyId);
        res.json({ ...result, chapterId, storyId });
    })
);

// ── POST /api/codex/pending/:id/approve ──────────────────────────────────────
// Approve a pending change: applies proposed fields to the live entry and snapshots.
router.post(
    "/pending/:id/approve",
    asyncHandler(async (req, res) => {
        const result = await approvePendingChange(req.params.id);
        res.json({
            entry: transformEntry(result.entry),
            snapshot: result.snapshot,
            pendingChange: result.pendingChange
        });
    })
);

// ── POST /api/codex/pending/:id/reject ────────────────────────────────────────
// Reject a pending change without modifying the live entry.
router.post(
    "/pending/:id/reject",
    asyncHandler(async (req, res) => {
        const pendingChange = await rejectPendingChange(req.params.id);
        res.json({ pendingChange });
    })
);

// ── GET /api/codex/:entryId ────────────────────────────────────────────────────
// Full detail view: entry state + snapshot history + pending proposals.
router.get(
    "/:entryId",
    asyncHandler(async (req, res) => {
        const entry = await getCodexEntry(req.params.entryId);
        if (!entry) {
            res.status(404).json({ error: "Codex entry not found" });
            return;
        }

        const [snapshots, pendingChanges] = await Promise.all([
            getSnapshotsForEntry(entry.id),
            getPendingChangesForEntry(entry.id, "pending")
        ]);

        res.json({ entry: transformEntry(entry), snapshots, pendingChanges });
    })
);

// ── POST /api/codex ────────────────────────────────────────────────────────────
// Create a new lorebook entry that is Codex-enabled from birth.
// Body: { level, scopeId?, name, description, category, tags?, needsFleshingOut?, sourceType?, sourceRef? }
router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { level, scopeId, name, description, category, tags, needsFleshingOut, sourceType, sourceRef } =
            req.body;

        const result = await createCodexEntry({
            level,
            scopeId: scopeId ?? null,
            name,
            description,
            category,
            tags,
            needsFleshingOut,
            sourceType: sourceType ?? "user",
            sourceRef: sourceRef ?? null
        });

        res.status(201).json({ entry: transformEntry(result.entry), snapshot: result.snapshot });
    })
);

// ── POST /api/codex/:entryId/enable ───────────────────────────────────────────
// Flip codexEnabled = true on an existing lorebook entry.
// Body: { sourceType?, sourceRef? }
router.post(
    "/:entryId/enable",
    asyncHandler(async (req, res) => {
        const entry = await getCodexEntry(req.params.entryId);
        if (!entry) {
            res.status(404).json({ error: "Entry not found" });
            return;
        }

        const { sourceType, sourceRef } = req.body;
        const result = await enableCodexForEntry(
            req.params.entryId,
            sourceType ?? "user",
            sourceRef ?? null
        );

        res.json({ entry: transformEntry(result.entry), snapshot: result.snapshot });
    })
);

// ── POST /api/codex/:entryId/state ────────────────────────────────────────────
// Apply a state change to a Codex-enabled entry. Auto-creates a snapshot.
// Body: { changes: { description?, codexState?, tags?, needsFleshingOut? }, sourceType?, sourceRef? }
router.post(
    "/:entryId/state",
    asyncHandler(async (req, res) => {
        const entry = await getCodexEntry(req.params.entryId);
        if (!entry) {
            res.status(404).json({ error: "Entry not found" });
            return;
        }

        const { changes, sourceType, sourceRef } = req.body;
        const result = await recordStateChange(
            req.params.entryId,
            changes ?? {},
            sourceType ?? "user",
            sourceRef ?? null
        );

        res.json({ entry: transformEntry(result.entry), snapshot: result.snapshot });
    })
);

// B39 (docs/CODE_REVIEW_2026-08-17.md) — this route is the one place a client-parsed AI fence
// (chatContextService.ts's CODEX_PROPOSAL_INSTRUCTIONS) turns into a real pending-change row, so
// it's the highest-value place to stop trusting the client's payload shape wholesale. Scoped to
// this one route rather than every proposal type in the app (there are roughly a dozen — sheet,
// place-sheet, psych, timeline-pin, note, etc.) per explicit user decision — already mitigated
// elsewhere by the Approve UX (a human reviews before anything applies) and by
// codexService.ts's approvePendingChange, which strips `secrets` from any proposal regardless of
// what's in it; this schema rejects a `secrets` key outright instead, closing the same gap one
// step earlier. `.strict()` on every object level so an unexpected extra field is a clean 400,
// not silently ignored or silently stored.
const codexStateItemSchema = z.object({ id: z.string(), value: z.string() }).strict();
const codexCustomFieldSchema = z.object({ key: z.string(), label: z.string(), value: z.string() }).strict();
// Partial by design (not every section) — proposedState.appearance is a labeled-field bucket,
// wardrobe/wounds/items are flat lists — mirrors codexService.ts's own approvePendingChange
// comment on why this is a shallow per-section merge, not a wholesale replace.
const proposedCodexStateSchema = z
    .object({
        wardrobe: z.array(codexStateItemSchema).optional(),
        appearance: z.array(codexCustomFieldSchema).optional(),
        wounds: z.array(codexStateItemSchema).optional(),
        items: z.array(codexStateItemSchema).optional(),
        customFields: z.array(codexCustomFieldSchema).optional()
    })
    .strict();
const proposeChangeBodySchema = z
    .object({
        proposal: z
            .object({
                proposedDescription: z.string().optional(),
                proposedState: proposedCodexStateSchema.optional(),
                proposedTags: z.array(z.string()).optional(),
                proposedNeedsFleshingOut: z.boolean().optional()
            })
            .strict()
            .optional(),
        sourceType: z.enum(["chat", "ai"]).optional(),
        sourceRef: z.string().nullable().optional()
    })
    .strict();

// ── POST /api/codex/:entryId/propose ──────────────────────────────────────────
// Submit an AI-proposed change for user review. Does not touch the live entry.
// Body: { proposal: { proposedDescription?, proposedState?, proposedTags?, proposedNeedsFleshingOut? }, sourceType?, sourceRef? }
router.post(
    "/:entryId/propose",
    asyncHandler(async (req, res) => {
        const entry = await getCodexEntry(req.params.entryId);
        if (!entry) {
            res.status(404).json({ error: "Entry not found" });
            return;
        }

        const parsed = proposeChangeBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Invalid proposal payload", details: parsed.error.issues });
            return;
        }

        const { proposal, sourceType, sourceRef } = parsed.data;
        // proposedState is legitimately partial at runtime (a shallow per-section merge, see
        // codexService.ts's own approvePendingChange comment) even though ChangeProposal's
        // declared CodexState type has every array as required — the Zod schema above is the
        // real validation boundary, this cast just reconciles that pre-existing shape mismatch.
        const result = await proposeChange(
            req.params.entryId,
            (proposal ?? {}) as ChangeProposal,
            sourceType ?? "chat",
            sourceRef ?? null
        );

        res.status(201).json(result);
    })
);

// ── GET /api/codex/:entryId/snapshots ─────────────────────────────────────────
// Full snapshot history for an entry, newest first.
router.get(
    "/:entryId/snapshots",
    asyncHandler(async (req, res) => {
        const entry = await getCodexEntry(req.params.entryId);
        if (!entry) {
            res.status(404).json({ error: "Entry not found" });
            return;
        }

        const snapshots = await getSnapshotsForEntry(entry.id);
        res.json(snapshots);
    })
);

// ── POST /api/codex/:entryId/snapshots/:snapshotId/restore ───────────────────
// Restore the entry's description/codexState to an earlier snapshot's values. Non-destructive
// — creates a new snapshot (sourceType: "restore") recording the restore itself.
router.post(
    "/:entryId/snapshots/:snapshotId/restore",
    asyncHandler(async (req, res) => {
        const result = await restoreSnapshot(req.params.entryId, req.params.snapshotId);
        res.json({ entry: transformEntry(result.entry), snapshot: result.snapshot });
    })
);

// ── PATCH /api/codex/:entryId/snapshots/:snapshotId ───────────────────────────
// Set or clear a snapshot's user-given name. Body: { label: string | null }
router.patch(
    "/:entryId/snapshots/:snapshotId",
    asyncHandler(async (req, res) => {
        const { label } = req.body as { label?: string | null };
        const snapshot = await setSnapshotLabel(req.params.snapshotId, label ?? null);
        if (!snapshot) {
            res.status(404).json({ error: "Snapshot not found" });
            return;
        }
        res.json(snapshot);
    })
);

// ── GET /api/codex/:entryId/pending ───────────────────────────────────────────
// Pending (unresolved) change proposals for an entry.
router.get(
    "/:entryId/pending",
    asyncHandler(async (req, res) => {
        const entry = await getCodexEntry(req.params.entryId);
        if (!entry) {
            res.status(404).json({ error: "Entry not found" });
            return;
        }

        const pending = await getPendingChangesForEntry(entry.id, "pending");
        res.json(pending);
    })
);

export default router;
