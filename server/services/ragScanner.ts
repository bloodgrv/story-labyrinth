import { and, eq, inArray, or } from "drizzle-orm";
import type OpenAI from "openai";
import type { RagScan, RagScanEvidence, RagScanIssue } from "../../src/types/ragScan.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { db, schema } from "../db/client.js";
import { chunkText } from "./embeddingService.js";
import { extractTextFromLexical } from "./entityDetector.js";
import { search } from "./ragIndexService.js";
import type { SearchResult } from "./ragRepository.js";
import {
    completeScan,
    createIssues,
    createScan,
    failScan,
    getIssuesForScan,
    getIssuesForStory,
    getScan,
    getScansForStory,
    updateIssueStatus,
    updateScanProgress
} from "./ragScanRepository.js";

const MAX_CONTEXT_QUERIES = 6;
const MAX_CONTEXT_CHUNKS = 15;
const MAX_CHAPTER_CHARS = 12000;
const MAX_CONTEXT_CHARS = 12000;

// ── Context gathering ────────────────────────────────────────────────────────────

type LabeledResult = SearchResult & { label: string };

// Evenly sample `n` items from `arr` (used to bound the number of retrieval queries for long chapters).
const sampleEvenly = <T>(arr: T[], n: number): T[] => {
    if (arr.length <= n) return arr;
    const step = arr.length / n;
    return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
};

// Resolve entityId -> a human-readable label (lorebook entry name, or chapter title) for prompt display.
const resolveContextLabels = async (results: SearchResult[]): Promise<LabeledResult[]> => {
    const lorebookIds = [...new Set(results.filter(r => r.entityType === "lorebook_entry").map(r => r.entityId))];
    const chapterIds = [...new Set(results.filter(r => r.entityType === "chapter").map(r => r.entityId))];

    const [lorebookRows, chapterRows] = await Promise.all([
        lorebookIds.length
            ? db
                  .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name })
                  .from(schema.lorebookEntries)
                  .where(inArray(schema.lorebookEntries.id, lorebookIds))
            : Promise.resolve([] as { id: string; name: string }[]),
        chapterIds.length
            ? db
                  .select({ id: schema.chapters.id, title: schema.chapters.title })
                  .from(schema.chapters)
                  .where(inArray(schema.chapters.id, chapterIds))
            : Promise.resolve([] as { id: string; title: string }[])
    ]);

    const labelMap = new Map<string, string>();
    lorebookRows.forEach(r => labelMap.set(r.id, r.name));
    chapterRows.forEach(r => labelMap.set(r.id, r.title));

    return results.map(r => ({ ...r, label: labelMap.get(r.entityId) ?? r.entityId }));
};

// Gather retrieval context for a chapter: query the hybrid index with samples of the
// chapter's own text, excluding the chapter's own chunks, and merge/dedupe by chunkId.
const gatherContext = async (storyId: string, chapterId: string, chapterChunks: string[]): Promise<LabeledResult[]> => {
    if (chapterChunks.length === 0) return [];

    const queryChunks = sampleEvenly(chapterChunks, MAX_CONTEXT_QUERIES);
    const resultsByChunk = await Promise.all(queryChunks.map(q => search({ storyId, query: q, limit: 8 })));

    const merged = new Map<string, SearchResult>();
    for (const results of resultsByChunk) {
        for (const r of results) {
            if (r.entityId === chapterId) continue; // exclude the chapter's own chunks
            const existing = merged.get(r.chunkId);
            if (!existing || r.score > existing.score) merged.set(r.chunkId, r);
        }
    }

    const ranked = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CONTEXT_CHUNKS);
    return resolveContextLabels(ranked);
};

// ── LLM prompt + response parsing ────────────────────────────────────────────────

const SCANNER_SYSTEM_PROMPT = `You are a fiction-continuity checker. You are given:
1. The text of a chapter from a story.
2. Reference context retrieved from the story's Codex (character/location/item state) and other chapters.

Compare the chapter text against the reference context and identify factual inconsistencies. Classify each as:
- "contradiction": the chapter states something that directly contradicts the reference context (e.g. eye color, name, a fact stated elsewhere)
- "state_mismatch": the chapter's description of a character/item/location's physical state doesn't match the Codex's currently tracked state (e.g. wardrobe, wounds, appearance)
- "timeline": the chapter implies a sequence or duration of events that conflicts with the reference context
- "other": any other consistency issue worth flagging that doesn't fit the above

Only flag genuine, clearly-supported inconsistencies. Do not invent facts, and do not flag stylistic issues or matters of taste.
If nothing is wrong, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "issueType": "contradiction" | "state_mismatch" | "timeline" | "other",
  "severity": "low" | "medium" | "high",
  "description": string,
  "evidence": [ { "source": "chapter" | "codex", "label": string, "excerpt": string } ],
  "suggestedFix": string | null,
  "relatedEntityName": string | null
}
"relatedEntityName" is the name of the specific character/location/item this issue concerns, exactly as it appears
in the reference context, or null if not applicable.`;

const buildPromptMessages = (
    chapterText: string,
    context: LabeledResult[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
    const contextBlock = context.length
        ? context
              .map(c => `[${c.entityType === "lorebook_entry" ? "Codex" : "Chapter"}: ${c.label}]\n${c.content}`)
              .join("\n\n---\n\n")
        : "(no related Codex entries or prior chapters found)";

    return [
        { role: "system", content: SCANNER_SYSTEM_PROMPT },
        {
            role: "user",
            content:
                `=== CHAPTER TEXT ===\n${chapterText.slice(0, MAX_CHAPTER_CHARS)}\n\n` +
                `=== REFERENCE CONTEXT (Codex + prior chapters) ===\n${contextBlock.slice(0, MAX_CONTEXT_CHARS)}`
        }
    ];
};

type ParsedIssue = {
    issueType: RagScanIssue["issueType"];
    severity: RagScanIssue["severity"];
    description: string;
    evidence: RagScanEvidence[];
    suggestedFix: string | null;
    relatedEntityName: string | null;
};

const ISSUE_TYPES = new Set(["contradiction", "state_mismatch", "timeline", "other"]);
const SEVERITIES = new Set(["low", "medium", "high"]);

const parseEvidence = (raw: unknown): RagScanEvidence[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map(e => ({
            source: e.source === "codex" ? ("codex" as const) : ("chapter" as const),
            label: typeof e.label === "string" ? e.label : "",
            excerpt: typeof e.excerpt === "string" ? e.excerpt : ""
        }))
        .filter(e => e.excerpt.length > 0);
};

const parseIssues = (raw: string): ParsedIssue[] => {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    let parsed: unknown[];
    try {
        parsed = JSON.parse(match[0]) as unknown[];
    } catch {
        return [];
    }

    return parsed
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .filter(
            e =>
                typeof e.description === "string" &&
                e.description.trim().length > 0 &&
                ISSUE_TYPES.has(e.issueType as string)
        )
        .map(e => ({
            issueType: e.issueType as ParsedIssue["issueType"],
            severity: SEVERITIES.has(e.severity as string) ? (e.severity as ParsedIssue["severity"]) : "medium",
            description: (e.description as string).trim(),
            evidence: parseEvidence(e.evidence),
            suggestedFix: typeof e.suggestedFix === "string" && e.suggestedFix.trim() ? e.suggestedFix.trim() : null,
            relatedEntityName:
                typeof e.relatedEntityName === "string" && e.relatedEntityName.trim()
                    ? e.relatedEntityName.trim()
                    : null
        }));
};

// Map lorebook entry names (lowercased) to ids, scoped to a story's visible entries
// (global + this story + this story's series), for resolving the LLM's "relatedEntityName".
const resolveEntityIdsByName = async (storyId: string): Promise<Map<string, string>> => {
    const [story] = await db.select({ seriesId: schema.stories.seriesId }).from(schema.stories).where(eq(schema.stories.id, storyId));

    const conditions = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story?.seriesId) {
        conditions.push(and(eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId)));
    }

    const rows = await db
        .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name })
        .from(schema.lorebookEntries)
        .where(or(...conditions));

    const map = new Map<string, string>();
    rows.forEach(r => map.set(r.name.toLowerCase().trim(), r.id));
    return map;
};

// ── Scanner connection ────────────────────────────────────────────────────────────

// Exported for services/jobs/ragScanJobs.ts (Phase A's job-runner-driven caller — see
// docs/Agent_Framework_And_Project_Memory_Design.md §3), avoiding a duplicate error message.
export const requireScannerConnection = async (): Promise<{ client: OpenAI; model: string }> => {
    const connection = await buildClientForFeature("rag_scanner");
    if (!connection) {
        throw new Error(
            "No AI provider configured for the RAG Scanner. Set a global default or a 'RAG Scanner' feature endpoint in AI Settings."
        );
    }
    return connection;
};

// ── Core per-chapter scan ────────────────────────────────────────────────────────

// Exported for services/jobs/ragScanJobs.ts's runRagScanStoryJob, which reimplements this
// function's own loop (below, in scanStory) without the fire-and-forget IIFE so the job runner
// itself can await it. Per-chapter errors here are still swallowed by the caller's own
// try/catch, not this function — see both call sites.
export const runChapterScan = async (params: {
    scanId: string;
    storyId: string;
    chapterId: string;
    client: OpenAI;
    model: string;
}): Promise<RagScanIssue[]> => {
    const { scanId, storyId, chapterId, client, model } = params;

    const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const chapterText = extractTextFromLexical(chapter.content);
    if (!chapterText.trim()) return [];

    const chapterChunks = chunkText(chapterText);
    const context = await gatherContext(storyId, chapterId, chapterChunks);

    const completion = await client.chat.completions.create({
        model,
        messages: buildPromptMessages(chapterText, context),
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const parsedIssues = parseIssues(raw);
    if (parsedIssues.length === 0) return [];

    const nameToId = await resolveEntityIdsByName(storyId);

    return createIssues(
        parsedIssues.map(p => ({
            scanId,
            storyId,
            chapterId,
            issueType: p.issueType,
            severity: p.severity,
            description: p.description,
            evidence: p.evidence,
            suggestedFix: p.suggestedFix,
            relatedEntityId: p.relatedEntityName ? (nameToId.get(p.relatedEntityName.toLowerCase().trim()) ?? null) : null
        }))
    );
};

// ── Public API ─────────────────────────────────────────────────────────────────

// Scan a single chapter synchronously. Throws if no 'rag_scanner' or global AI endpoint is configured.
export const scanChapter = async (chapterId: string): Promise<{ scan: RagScan; issues: RagScanIssue[] }> => {
    const [chapter] = await db
        .select({ id: schema.chapters.id, storyId: schema.chapters.storyId })
        .from(schema.chapters)
        .where(eq(schema.chapters.id, chapterId));
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const { client, model } = await requireScannerConnection();

    const scan = await createScan({ storyId: chapter.storyId, scope: "chapter", chapterId, totalChapters: 1 });
    try {
        const issues = await runChapterScan({ scanId: scan.id, storyId: chapter.storyId, chapterId, client, model });
        const completed = await completeScan(scan.id, { model, processedChapters: 1 });
        return { scan: completed, issues };
    } catch (error) {
        await failScan(scan.id, (error as Error).message);
        throw error;
    }
};

// Exported for services/jobs/ragScanJobs.ts's runRagScanStoryJob, which needs the same ordered
// chapter-id list without duplicating this query.
export const listOrderedChapterIds = async (storyId: string): Promise<string[]> => {
    const chapterRows = await db
        .select({ id: schema.chapters.id })
        .from(schema.chapters)
        .where(eq(schema.chapters.storyId, storyId))
        .orderBy(schema.chapters.order);
    return chapterRows.map(row => row.id);
};

// Kick off a whole-story scan: chapters are scanned one at a time in the background so the
// caller gets an immediate response and polls `getScanWithIssues(scan.id)` for progress.
// Throws immediately (before creating the scan row) if no scanner endpoint is configured.
export const scanStory = async (storyId: string): Promise<RagScan> => {
    const { client, model } = await requireScannerConnection();

    const chapterIds = await listOrderedChapterIds(storyId);

    const scan = await createScan({ storyId, scope: "story", chapterId: null, totalChapters: chapterIds.length });

    void (async () => {
        try {
            for (const [index, chapterId] of chapterIds.entries()) {
                try {
                    await runChapterScan({ scanId: scan.id, storyId, chapterId, client, model });
                } catch (error) {
                    console.error(`RAG scan: chapter ${chapterId} failed:`, (error as Error).message);
                }
                await updateScanProgress(scan.id, index + 1);
            }
            await completeScan(scan.id, { model, processedChapters: chapterIds.length });
        } catch (error) {
            await failScan(scan.id, (error as Error).message);
        }
    })();

    return scan;
};

export const getScanWithIssues = async (scanId: string): Promise<{ scan: RagScan; issues: RagScanIssue[] } | null> => {
    const scan = await getScan(scanId);
    if (!scan) return null;
    const issues = await getIssuesForScan(scanId);
    return { scan, issues };
};

export const listScansForStory = getScansForStory;
export const listIssuesForStory = getIssuesForStory;
export const setIssueStatus = updateIssueStatus;
