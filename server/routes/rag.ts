import { attemptPromise } from "@jfdi/attempt";
import { and, eq } from "drizzle-orm";
import express from "express";
import type { RagIssueStatus } from "../../src/types/ragScan.js";
import { db, schema } from "../db/client.js";
import { indexChapter, indexLorebookEntry, removeEntityFromIndex, search } from "../services/ragIndexService.js";
import type { RagEntityType } from "../services/ragRepository.js";
import { getScanWithIssues, listIssuesForStory, listScansForStory, scanChapter, setIssueStatus } from "../services/ragScanner.js";

const router = express.Router();

const VALID_ENTITY_TYPES: RagEntityType[] = ["lorebook_entry", "chapter", "agent_memory", "note", "outline_item"];

// POST /api/rag/search — hybrid keyword + vector search scoped to a story.
// Body: { storyId: string, query: string, limit?: number, entityTypes?: RagEntityType[] }
// entityTypes is the one place a caller can explicitly opt in to "agent_memory" — omitting it
// (or passing an invalid value) falls through to search()'s/hybridSearch's own safe default,
// never "all types" (design doc §4.5).
router.post("/search", async (req, res) => {
    const { storyId, query, limit, entityTypes } = req.body as {
        storyId?: unknown;
        query?: unknown;
        limit?: unknown;
        entityTypes?: unknown;
    };

    if (typeof storyId !== "string" || !storyId.trim()) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }
    if (typeof query !== "string" || !query.trim()) {
        res.status(400).json({ error: "query is required" });
        return;
    }

    const parsedEntityTypes =
        Array.isArray(entityTypes) && entityTypes.every(t => VALID_ENTITY_TYPES.includes(t as RagEntityType))
            ? (entityTypes as RagEntityType[])
            : undefined;

    const [error, results] = await attemptPromise(() =>
        search({
            storyId,
            query,
            limit: typeof limit === "number" ? limit : undefined,
            entityTypes: parsedEntityTypes
        })
    );

    if (error) {
        res.status(500).json({ error: "Search failed", details: error.message });
        return;
    }
    res.json({ results });
});

// POST /api/rag/index/lorebook/:entryId — (re)index a single lorebook entry
router.post("/index/lorebook/:entryId", async (req, res) => {
    const [error, result] = await attemptPromise(() => indexLorebookEntry(req.params.entryId));
    if (error) {
        res.status(500).json({ error: "Indexing failed", details: error.message });
        return;
    }
    res.json(result);
});

// DELETE /api/rag/index/lorebook/:entryId — remove a lorebook entry's chunks from the index
router.delete("/index/lorebook/:entryId", async (req, res) => {
    const [error] = await attemptPromise(async () => removeEntityFromIndex("lorebook_entry", req.params.entryId));
    if (error) {
        res.status(500).json({ error: "Failed to remove from index", details: error.message });
        return;
    }
    res.json({ success: true });
});

// POST /api/rag/index/chapter/:chapterId — (re)index a single chapter
router.post("/index/chapter/:chapterId", async (req, res) => {
    const [error, result] = await attemptPromise(() => indexChapter(req.params.chapterId));
    if (error) {
        res.status(500).json({ error: "Indexing failed", details: error.message });
        return;
    }
    res.json(result);
});

// DELETE /api/rag/index/chapter/:chapterId — remove a chapter's chunks from the index
router.delete("/index/chapter/:chapterId", async (req, res) => {
    const [error] = await attemptPromise(async () => removeEntityFromIndex("chapter", req.params.chapterId));
    if (error) {
        res.status(500).json({ error: "Failed to remove from index", details: error.message });
        return;
    }
    res.json({ success: true });
});

// POST /api/rag/reindex/story/:storyId — bulk (re)index every story-level lorebook entry
// and chapter for a story. Useful for backfilling the index after enabling embeddings.
router.post("/reindex/story/:storyId", async (req, res) => {
    const { storyId } = req.params;

    const [error, summary] = await attemptPromise(async () => {
        const entries = await db
            .select({ id: schema.lorebookEntries.id })
            .from(schema.lorebookEntries)
            .where(and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId)));

        const chapters = await db
            .select({ id: schema.chapters.id })
            .from(schema.chapters)
            .where(eq(schema.chapters.storyId, storyId));

        let lorebookIndexed = 0;
        let chapterIndexed = 0;

        for (const entry of entries) {
            const result = await indexLorebookEntry(entry.id);
            if (result.indexed) lorebookIndexed++;
        }
        for (const chapter of chapters) {
            const result = await indexChapter(chapter.id);
            if (result.indexed) chapterIndexed++;
        }

        return {
            lorebookEntries: { total: entries.length, indexed: lorebookIndexed },
            chapters: { total: chapters.length, indexed: chapterIndexed }
        };
    });

    if (error) {
        res.status(500).json({ error: "Reindex failed", details: error.message });
        return;
    }
    res.json(summary);
});

// ── Scanner routes ─────────────────────────────────────────────────────────────
// Factual consistency scanning: compares chapter text against Codex + prior chapter
// context (via the hybrid search above) and flags contradictions, state mismatches,
// and timeline issues. Uses the 'rag_scanner' feature endpoint, so it can run on a
// different model/machine than the main writing model.

// POST /api/rag/scan/chapter/:chapterId — scan a single chapter synchronously.
// Returns the completed scan and its issues directly.
router.post("/scan/chapter/:chapterId", async (req, res) => {
    const [error, result] = await attemptPromise(() => scanChapter(req.params.chapterId));
    if (error) {
        res.status(500).json({ error: "Scan failed", details: error.message });
        return;
    }
    res.json(result);
});

// B29 (docs/CODE_REVIEW_2026-08-17.md) — POST /api/rag/scan/story/:storyId (whole-story scan)
// retired 2026-08-18. It fired a bare `void (async () => {...})()` IIFE with no `agentJobs` row
// behind it — no crash recovery (a process restart mid-scan just silently abandoned it, unlike
// the job-runner path's `recoverCrashedJobs`), and nothing stopped it from running concurrently
// with a job-queued `rag_scan_story` scan of the same story. Confirmed dead client-side first —
// `ragClient.ts`'s own comment already says triggering a scan goes through
// `agentJobsApi.enqueue(rag_scan_story)`, not this route — so retiring outright (not
// "redirect to enqueue a job", which would just be unreachable dead code with different plumbing)
// removes the race by removing the second writer entirely. `scanStory` itself (ragScanner.ts) is
// removed too — `runChapterScan`/`listOrderedChapterIds`, the pieces it shared with the real
// job-runner implementation (`services/jobs/ragScanJobs.ts`'s `runRagScanStoryJob`), stay exported
// and untouched. The single-chapter scan route below is a different, synchronous (no IIFE) shape
// and isn't part of this finding.

// GET /api/rag/scan/:scanId — poll a scan's status/progress and the issues found so far.
router.get("/scan/:scanId", async (req, res) => {
    const [error, result] = await attemptPromise(() => getScanWithIssues(req.params.scanId));
    if (error) {
        res.status(500).json({ error: "Failed to load scan", details: error.message });
        return;
    }
    if (!result) {
        res.status(404).json({ error: "Scan not found" });
        return;
    }
    res.json(result);
});

// GET /api/rag/scans/story/:storyId — list all scans (history) for a story, most recent first.
router.get("/scans/story/:storyId", async (req, res) => {
    const [error, scans] = await attemptPromise(() => listScansForStory(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load scans", details: error.message });
        return;
    }
    res.json({ scans });
});

// GET /api/rag/issues/story/:storyId?status=open — list issues across all scans for a story.
router.get("/issues/story/:storyId", async (req, res) => {
    const status = req.query.status as RagIssueStatus | undefined;
    if (status && !["open", "dismissed", "resolved"].includes(status)) {
        res.status(400).json({ error: "status must be 'open', 'dismissed', or 'resolved'" });
        return;
    }

    const [error, issues] = await attemptPromise(() => listIssuesForStory(req.params.storyId, status));
    if (error) {
        res.status(500).json({ error: "Failed to load issues", details: error.message });
        return;
    }
    res.json({ issues });
});

// PATCH /api/rag/issues/:issueId — triage an issue (mark dismissed/resolved). Non-destructive —
// issues are never deleted, only their status changes.
router.patch("/issues/:issueId", async (req, res) => {
    const { status } = req.body as { status?: unknown };
    if (status !== "open" && status !== "dismissed" && status !== "resolved") {
        res.status(400).json({ error: "status must be 'open', 'dismissed', or 'resolved'" });
        return;
    }

    const [error, issue] = await attemptPromise(() => setIssueStatus(req.params.issueId, status));
    if (error) {
        res.status(500).json({ error: "Failed to update issue", details: error.message });
        return;
    }
    if (!issue) {
        res.status(404).json({ error: "Issue not found" });
        return;
    }
    res.json(issue);
});

export default router;
