import { and, eq, inArray, or } from "drizzle-orm";
import type OpenAI from "openai";
import type { RagScan, RagScanEvidence, RagScanIssue } from "../../src/types/ragScan.js";
import { chunk, DEFAULT_AI_CONCURRENCY } from "../lib/concurrency.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { db, schema } from "../db/client.js";
import { chunkText } from "./embeddingService.js";
import { extractTextFromLexical } from "./entityDetector.js";
import { listMemories } from "./agentMemoriesService.js";
import { search } from "./ragIndexService.js";
import type { SearchResult } from "./ragRepository.js";
import { getSpineChronologyExcerpt } from "./storyTimelineService.js";
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

// Base prompt (no Project Memory). Kept as a separate constant from
// SCANNER_SYSTEM_PROMPT_WITH_MEMORY below rather than always interpolating an empty section, so
// a scan that didn't opt into memory reads exactly as it always has (no behavior change for the
// default path) — see C3, docs/CURRENT_BACKLOG.md P0.3.
const SCANNER_SYSTEM_PROMPT = `You are a fiction-continuity checker. You are given:
1. The text of a chapter from a story.
2. Reference context retrieved from the story's Codex (character/location/item state) and other chapters.

Compare the chapter text against the reference context and identify factual inconsistencies. Classify each as:
- "contradiction": the chapter states something that directly contradicts the reference context (e.g. eye color, name, a fact stated elsewhere)
- "state_mismatch": the chapter's description of a character/item/location's physical state doesn't match the Codex's currently tracked state (e.g. wardrobe, wounds, appearance)
- "timeline": the chapter implies a sequence or duration of events that conflicts with the reference context
- "other": any other consistency issue worth flagging that doesn't fit the above

If a STORY TIMELINE reference block is provided, treat its pins as the story's established chronology (ordered
oldest to newest) when classifying "timeline" issues — flag a chapter that implies an event happened before/after
another in a way that contradicts that order.

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

// C3 (docs/CURRENT_BACKLOG.md P0.3) — opt-in variant that also includes the story's active
// Project Memory (agentMemories, Phase B) as reference context, for catching contradictions
// against approved project facts the Codex doesn't (yet) encode. Only used when the caller
// passes includeMemory: true (per-scan opt-in, default OFF — see runChapterScan below).
const SCANNER_SYSTEM_PROMPT_WITH_MEMORY = `You are a fiction-continuity checker. You are given:
1. The text of a chapter from a story.
2. Reference context retrieved from the story's Codex (character/location/item state), other chapters, and approved Project Memory (established facts/events/rules the user has already approved).

Compare the chapter text against the reference context and identify factual inconsistencies. Classify each as:
- "contradiction": the chapter states something that directly contradicts the reference context (e.g. eye color, name, a fact stated elsewhere, or an approved Project Memory fact)
- "state_mismatch": the chapter's description of a character/item/location's physical state doesn't match the Codex's currently tracked state (e.g. wardrobe, wounds, appearance)
- "timeline": the chapter implies a sequence or duration of events that conflicts with the reference context
- "other": any other consistency issue worth flagging that doesn't fit the above

Project Memory is approved but secondary to the Codex — if Project Memory and the Codex ever disagree with each other, do not flag it as a chapter issue (that's a project-memory/Codex sync problem, out of scope here).

If a STORY TIMELINE reference block is provided, treat its pins as the story's established chronology (ordered
oldest to newest) when classifying "timeline" issues — flag a chapter that implies an event happened before/after
another in a way that contradicts that order.

Only flag genuine, clearly-supported inconsistencies. Do not invent facts, and do not flag stylistic issues or matters of taste.
If nothing is wrong, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "issueType": "contradiction" | "state_mismatch" | "timeline" | "other",
  "severity": "low" | "medium" | "high",
  "description": string,
  "evidence": [ { "source": "chapter" | "codex" | "memory", "label": string, "excerpt": string } ],
  "suggestedFix": string | null,
  "relatedEntityName": string | null
}
"relatedEntityName" is the name of the specific character/location/item this issue concerns, exactly as it appears
in the reference context, or null if not applicable.`;

// Active Project Memory for a story, formatted for direct inclusion in the scanner prompt —
// mirrors chatContextService.ts's resolveMemories framing (approved facts, no per-item gate
// beyond status: "active"), but reads every active memory rather than top-K RAG search since a
// scan already processes the whole chapter, not a single conversational turn.
// Exported for services/aiReviewService.ts (AR5, Deep mode's includeMemory toggle) — same
// formatting, no reason to duplicate it a second time.
export const gatherMemoryContext = async (storyId: string): Promise<string> => {
    const memories = await listMemories({ storyId, status: "active" });
    if (memories.length === 0) return "";
    return memories.map(m => `[Project Memory: ${m.title} (${m.category})]\n${m.body}`).join("\n\n---\n\n");
};

// TL11A, docs/Story_Timeline_Design.md — opt-in per-scan (mirrors gatherMemoryContext's own
// shape/gating exactly). Formats the Spine chronology as ordered "when: title — blurb" lines so
// the scanner has real reference data for "timeline"-type issues instead of only inferring order
// from prior-chapter text.
// Exported for services/aiReviewService.ts (AR5, Deep mode's includeTimeline toggle) — same
// reasoning as gatherMemoryContext above.
export const gatherTimelineContext = async (storyId: string): Promise<string> => {
    const pins = await getSpineChronologyExcerpt(storyId);
    if (pins.length === 0) return "";
    return pins.map(p => `${p.when}: ${p.title}${p.blurb ? ` — ${p.blurb}` : ""}`).join("\n");
};

const buildPromptMessages = (
    chapterText: string,
    context: LabeledResult[],
    memoryContext: string,
    timelineContext: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
    const contextBlock = context.length
        ? context
              .map(c => `[${c.entityType === "lorebook_entry" ? "Codex" : "Chapter"}: ${c.label}]\n${c.content}`)
              .join("\n\n---\n\n")
        : "(no related Codex entries or prior chapters found)";

    const sections = [
        `=== REFERENCE CONTEXT (Codex + prior chapters) ===\n${contextBlock.slice(0, MAX_CONTEXT_CHARS)}`,
        memoryContext && `=== PROJECT MEMORY (approved facts) ===\n${memoryContext.slice(0, MAX_CONTEXT_CHARS)}`,
        timelineContext && `=== STORY TIMELINE (established chronology) ===\n${timelineContext.slice(0, MAX_CONTEXT_CHARS)}`
    ].filter(Boolean);

    return [
        { role: "system", content: memoryContext ? SCANNER_SYSTEM_PROMPT_WITH_MEMORY : SCANNER_SYSTEM_PROMPT },
        {
            role: "user",
            content: `=== CHAPTER TEXT ===\n${chapterText.slice(0, MAX_CHAPTER_CHARS)}\n\n${sections.join("\n\n")}`
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
            source:
                e.source === "codex" ? ("codex" as const) : e.source === "memory" ? ("memory" as const) : ("chapter" as const),
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
    // C3 — opt-in per-scan flag; default false keeps the prompt/context identical to before.
    includeMemory?: boolean;
    // TL11A — opt-in per-scan flag, same shape as includeMemory; default false.
    includeTimeline?: boolean;
}): Promise<RagScanIssue[]> => {
    const { scanId, storyId, chapterId, client, model, includeMemory = false, includeTimeline = false } = params;

    const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const chapterText = extractTextFromLexical(chapter.content);
    if (!chapterText.trim()) return [];

    const chapterChunks = chunkText(chapterText);
    const [context, memoryContext, timelineContext] = await Promise.all([
        gatherContext(storyId, chapterId, chapterChunks),
        includeMemory ? gatherMemoryContext(storyId) : Promise.resolve(""),
        includeTimeline ? gatherTimelineContext(storyId) : Promise.resolve("")
    ]);

    const completion = await client.chat.completions.create({
        model,
        messages: buildPromptMessages(chapterText, context, memoryContext, timelineContext),
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
export const scanChapter = async (
    chapterId: string,
    includeMemory = false,
    includeTimeline = false
): Promise<{ scan: RagScan; issues: RagScanIssue[] }> => {
    const [chapter] = await db
        .select({ id: schema.chapters.id, storyId: schema.chapters.storyId })
        .from(schema.chapters)
        .where(eq(schema.chapters.id, chapterId));
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const { client, model } = await requireScannerConnection();

    const scan = await createScan({ storyId: chapter.storyId, scope: "chapter", chapterId, totalChapters: 1 });
    try {
        const issues = await runChapterScan({ scanId: scan.id, storyId: chapter.storyId, chapterId, client, model, includeMemory, includeTimeline });
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

// Kick off a whole-story scan: chapters are scanned DEFAULT_AI_CONCURRENCY at a time (batched,
// not one at a time — see concurrency.ts's own comment for why batches rather than a rolling
// pool) in the background so the caller gets an immediate response and polls
// `getScanWithIssues(scan.id)` for progress. Throws immediately (before creating the scan row) if
// no scanner endpoint is configured.
export const scanStory = async (storyId: string, includeMemory = false, includeTimeline = false): Promise<RagScan> => {
    const { client, model } = await requireScannerConnection();

    const chapterIds = await listOrderedChapterIds(storyId);

    const scan = await createScan({ storyId, scope: "story", chapterId: null, totalChapters: chapterIds.length });

    void (async () => {
        try {
            let processed = 0;
            for (const batch of chunk(chapterIds, DEFAULT_AI_CONCURRENCY)) {
                await Promise.all(
                    batch.map(async chapterId => {
                        try {
                            await runChapterScan({ scanId: scan.id, storyId, chapterId, client, model, includeMemory, includeTimeline });
                        } catch (error) {
                            console.error(`RAG scan: chapter ${chapterId} failed:`, (error as Error).message);
                        }
                    })
                );
                processed += batch.length;
                await updateScanProgress(scan.id, processed);
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
