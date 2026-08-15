import { and, eq, inArray, or } from "drizzle-orm";
import type OpenAI from "openai";
import type { AiReviewFinding, AiReviewOptions, AiReviewSeverity, AiReviewTag } from "../../src/types/aiReview.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { db, schema } from "../db/client.js";
import { chunkText } from "./embeddingService.js";
import { extractTextFromLexical } from "./entityDetector.js";
import { gatherMemoryContext, gatherTimelineContext } from "./ragScanner.js";
import { buildLorebookEntryText, search } from "./ragIndexService.js";
import type { SearchResult } from "./ragRepository.js";
import { createFindings, getFindingsForReview, updateReviewOptions } from "./aiReviewRepository.js";

// Quick mode is a single LLM pass over the whole selection (docs/AI_Review_Design.md — "Run
// modes: Quick"), unlike the Scanner's per-chapter loop — so all caps here bound one combined
// prompt rather than one chapter at a time.
const MAX_CHARS_PER_CHAPTER = 6000;
const MAX_CONTEXT_QUERIES = 6;
const MAX_CONTEXT_CHUNKS = 12;
const MAX_CONTEXT_CHARS = 8000;

// AR5 (Deep mode) caps.
const MAP_MAX_TOKENS = 300;
const CROSS_CHAPTER_MAX_TOKENS = 4096;
const VOICE_MAX_TOKENS = 4096;
const CAST_CAP = 8;
const CAST_CONTEXT_MAX_CHARS = 6000;
// Whole-book Deep runs still need one bounded prompt for the voice stage (the only stage reading
// raw prose) — this budget is split evenly across however many chapters are selected rather than
// a flat per-chapter cap, so a 40-chapter "whole book" run degrades gracefully instead of blowing
// the context window. Floor keeps any single chapter's excerpt meaningful even at high counts.
const VOICE_TOTAL_CHAR_BUDGET = 30000;
const VOICE_CHAPTER_CHAR_FLOOR = 1500;

// ── Context gathering (Quick mode's RAG hits) ──────────────────────────────────────

const sampleEvenly = <T>(arr: T[], n: number): T[] => {
    if (arr.length <= n) return arr;
    const step = arr.length / n;
    return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
};

type LabeledResult = SearchResult & { label: string };

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

// RAG hits for the whole selection at once — samples chunks from every selected chapter's text,
// excludes chunks belonging to the selection itself (design lock #4: RAG top hits for entities in
// selection, never a full-lorebook dump).
const gatherContext = async (
    storyId: string,
    selectedChapterIds: string[],
    combinedText: string
): Promise<LabeledResult[]> => {
    const chunks = chunkText(combinedText);
    if (chunks.length === 0) return [];

    const queryChunks = sampleEvenly(chunks, MAX_CONTEXT_QUERIES);
    const resultsByChunk = await Promise.all(queryChunks.map(q => search({ storyId, query: q, limit: 8 })));

    const selectedSet = new Set(selectedChapterIds);
    const merged = new Map<string, SearchResult>();
    for (const results of resultsByChunk) {
        for (const r of results) {
            if (r.entityType === "chapter" && selectedSet.has(r.entityId)) continue;
            const existing = merged.get(r.chunkId);
            if (!existing || r.score > existing.score) merged.set(r.chunkId, r);
        }
    }

    const ranked = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CONTEXT_CHUNKS);
    return resolveContextLabels(ranked);
};

// ── Cast context (AR5, Deep mode's "Include focused cast Codex" toggle) ──────────────

const countOccurrences = (haystack: string, needle: string): number => {
    if (!needle) return 0;
    let count = 0;
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
        count++;
        idx += needle.length;
    }
    return count;
};

// Auto-detects which character-category lorebook entries actually appear in the selected
// chapters' text (exact case-insensitive name match, same idea as the client-only
// LorebookTagPlugin/buildTagMap matching — no shared/exported version of that logic exists to
// reuse, and this needs to run server-side inside a job). Deliberately not RAG-ranked: presence
// should be literal, not similarity-scored, for a "who's actually in this scene" toggle.
const resolveCastForChapters = async (storyId: string, combinedText: string): Promise<{ id: string; name: string }[]> => {
    const [story] = await db.select({ seriesId: schema.stories.seriesId }).from(schema.stories).where(eq(schema.stories.id, storyId));

    const conditions = [
        and(eq(schema.lorebookEntries.category, "character"), eq(schema.lorebookEntries.level, "global")),
        and(eq(schema.lorebookEntries.category, "character"), eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story?.seriesId) {
        conditions.push(
            and(eq(schema.lorebookEntries.category, "character"), eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId))
        );
    }

    const rows = await db
        .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name })
        .from(schema.lorebookEntries)
        .where(or(...conditions));

    const lowerText = combinedText.toLowerCase();
    return rows
        .map(r => ({ ...r, count: countOccurrences(lowerText, r.name.toLowerCase().trim()) }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, CAST_CAP)
        .map(({ id, name }) => ({ id, name }));
};

// Formats each matched cast member's AI-facing text via buildLorebookEntryText (ragIndexService.ts)
// — the same secrets-safe serializer RAG indexing already trusts (filters unrevealed Codex
// secrets). Deliberately not a new formatter: writing a second codexState-to-text function here
// would be a real risk of independently forgetting the secrets filter.
const gatherCastContext = async (castEntries: { id: string; name: string }[]): Promise<string> => {
    if (castEntries.length === 0) return "";

    const rows = await db
        .select()
        .from(schema.lorebookEntries)
        .where(
            inArray(
                schema.lorebookEntries.id,
                castEntries.map(c => c.id)
            )
        );

    const texts = await Promise.all(rows.map(row => buildLorebookEntryText(row)));
    return texts.join("\n\n---\n\n").slice(0, CAST_CONTEXT_MAX_CHARS);
};

// ── Shared LLM findings parsing (Quick + Deep's cross-chapter/voice stages) ───────────

type ParsedFinding = {
    tag: AiReviewTag;
    severity: AiReviewSeverity;
    title: string;
    description: string;
    chapterTitle: string | null;
    excerpt: string | null;
    direction: string | null;
};

const TAGS = new Set(["dev", "continuity", "voice", "line"]);
const SEVERITIES = new Set(["low", "medium", "high"]);

const parseFindings = (raw: string): ParsedFinding[] => {
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
                typeof e.title === "string" &&
                e.title.trim().length > 0 &&
                TAGS.has(e.tag as string)
        )
        .map(e => ({
            tag: e.tag as ParsedFinding["tag"],
            severity: SEVERITIES.has(e.severity as string) ? (e.severity as ParsedFinding["severity"]) : "medium",
            title: (e.title as string).trim(),
            description: (e.description as string).trim(),
            chapterTitle: typeof e.chapterTitle === "string" && e.chapterTitle.trim() ? e.chapterTitle.trim() : null,
            excerpt: typeof e.excerpt === "string" && e.excerpt.trim() ? e.excerpt.trim() : null,
            direction: typeof e.direction === "string" && e.direction.trim() ? e.direction.trim() : null
        }));
};

// One LLM call → parsed findings. Shared by Quick and Deep's cross-chapter/voice stages so the
// completion call + JSON parsing/validation only lives in one place.
const callFindingsLlm = async (
    client: OpenAI,
    model: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    maxTokens: number
): Promise<ParsedFinding[]> => {
    const completion = await client.chat.completions.create({ model, messages, temperature: 0.3, max_tokens: maxTokens });
    const raw = completion.choices[0]?.message?.content ?? "[]";
    return parseFindings(raw);
};

// Maps parsed findings + a chapterTitle->id lookup into repository insert params. Findings the
// model couldn't tie to a given chapter title still get persisted (chapterId: null) rather than
// dropped — best-effort locus per the design doc's own schema note.
const toFindingParams = (reviewId: string, storyId: string, findings: ParsedFinding[], titleToId: Map<string, string>) =>
    findings.map(f => ({
        reviewId,
        storyId,
        chapterId: f.chapterTitle ? (titleToId.get(f.chapterTitle) ?? null) : null,
        tag: f.tag,
        severity: f.severity,
        title: f.title,
        description: f.description,
        excerpt: f.excerpt,
        excerptStart: null,
        excerptEnd: null,
        direction: f.direction
    }));

// ── Quick mode ─────────────────────────────────────────────────────────────────────

const AI_REVIEW_SYSTEM_PROMPT = `You are a human manuscript editor reviewing a novelist's draft. You are given the text of one
or more chapters, the story's synopsis, and optional reference context from other chapters/Codex entries.

Give the author things to be aware of — the kind of notes a skilled human editor writes in the margin. Classify each
note with one tag:
- "dev": story/character development concerns — pacing, motivation, unearned turns, dropped threads, plot logic.
- "continuity": SOFT continuity concerns — things that read as possibly inconsistent but aren't a hard, provable
  Codex contradiction (a dedicated fact-checker already covers hard contradictions; do not duplicate that here —
  only flag continuity concerns that are more about a "does this still track" editorial read).
- "voice": voice drift — a character speaking/thinking out of their established voice, or the narrative voice
  shifting inconsistently within or across the selection.
- "line": line-level prose craft (wordiness, repetition, awkward phrasing). Only flag genuinely notable line issues,
  not routine style preference.

Only flag things a thoughtful editor would actually raise. Do not invent problems, do not nitpick for the sake of
volume, and do not flag matters of pure taste. If nothing is wrong, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "tag": "dev" | "continuity" | "voice" | "line",
  "severity": "low" | "medium" | "high",
  "title": string,
  "description": string,
  "chapterTitle": string,
  "excerpt": string | null,
  "direction": string | null
}
"title" is a short (few words) label for the finding. "description" explains the issue and why it matters.
"chapterTitle" MUST exactly match one of the chapter titles given in the "=== CHAPTERS ===" section — this is how
the finding gets attached to the right chapter. "excerpt" is a short verbatim quote from that chapter illustrating
the issue, or null if not applicable. "direction" is an optional brief editorial suggestion (not a rewrite), or null.`;

const buildQuickPromptMessages = (
    chapters: { title: string; text: string }[],
    synopsis: string | null,
    context: LabeledResult[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
    const chaptersBlock = chapters
        .map(c => `[Chapter: ${c.title}]\n${c.text.slice(0, MAX_CHARS_PER_CHAPTER)}`)
        .join("\n\n---\n\n");

    const contextBlock = context.length
        ? context
              .map(c => `[${c.entityType === "lorebook_entry" ? "Codex" : "Chapter"}: ${c.label}]\n${c.content}`)
              .join("\n\n---\n\n")
        : "";

    const sections = [
        synopsis && `=== SYNOPSIS ===\n${synopsis}`,
        `=== CHAPTERS ===\n${chaptersBlock}`,
        contextBlock && `=== REFERENCE CONTEXT (other chapters + Codex) ===\n${contextBlock.slice(0, MAX_CONTEXT_CHARS)}`
    ].filter(Boolean);

    return [
        { role: "system", content: AI_REVIEW_SYSTEM_PROMPT },
        { role: "user", content: sections.join("\n\n") }
    ];
};

// Fetches the selected chapters (preserving caller order) + synopsis. Shared by Quick and Deep,
// which both need the same ordered chapter rows.
const loadOrderedChapters = async (storyId: string, chapterIds: string[]) => {
    const [chapterRows, [story]] = await Promise.all([
        db
            .select({ id: schema.chapters.id, title: schema.chapters.title, content: schema.chapters.content })
            .from(schema.chapters)
            .where(inArray(schema.chapters.id, chapterIds)),
        db.select({ synopsis: schema.stories.synopsis }).from(schema.stories).where(eq(schema.stories.id, storyId))
    ]);

    const rowsById = new Map(chapterRows.map(r => [r.id, r]));
    const orderedChapters = chapterIds.map(id => rowsById.get(id)).filter((r): r is (typeof chapterRows)[number] => !!r);
    return { orderedChapters, synopsis: story?.synopsis ?? null };
};

// Exported for services/jobs/aiReviewJobs.ts, which creates the aiReviews row itself before
// calling this (so the job can record job.progress.reviewId before the LLM call, for
// crash-resume, mirroring ragScanJobs.ts's scanId precedent).
export const runQuickReview = async (params: {
    reviewId: string;
    storyId: string;
    chapterIds: string[];
    client: OpenAI;
    model: string;
}): Promise<AiReviewFinding[]> => {
    const { reviewId, storyId, chapterIds, client, model } = params;

    const { orderedChapters, synopsis } = await loadOrderedChapters(storyId, chapterIds);
    if (orderedChapters.length === 0) return [];

    const chaptersForPrompt = orderedChapters.map(c => ({ title: c.title, text: extractTextFromLexical(c.content) }));
    const titleToId = new Map(orderedChapters.map(c => [c.title, c.id]));

    const combinedText = chaptersForPrompt.map(c => c.text).join("\n\n");
    const context = await gatherContext(storyId, chapterIds, combinedText);

    const parsedFindings = await callFindingsLlm(client, model, buildQuickPromptMessages(chaptersForPrompt, synopsis, context), 4096);
    if (parsedFindings.length === 0) return [];

    return createFindings(toFindingParams(reviewId, storyId, parsedFindings, titleToId));
};

// ── Deep mode (AR5) — staged: map -> cross-chapter -> voice -> merge/dedupe ──────────

const MAP_SYSTEM_PROMPT = `You are helping a manuscript editor build a compact map of a novel before a deeper editorial pass.
Given one chapter's text, write a short plain-prose summary (3-6 sentences) covering: the key beats (what happens),
the chapter's narrative function (setup, escalation, reveal, reversal, etc.), and which named characters are
meaningfully present. Do not evaluate quality or flag issues — this is a neutral summary only, used as compact
context for a later pass. Return ONLY the summary text — no JSON, no headers, no bullet points.`;

const runMapStage = async (
    chapter: { id: string; title: string; text: string },
    client: OpenAI,
    model: string
): Promise<{ chapterId: string; title: string; summary: string }> => {
    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: MAP_SYSTEM_PROMPT },
            { role: "user", content: `[Chapter: ${chapter.title}]\n${chapter.text.slice(0, MAX_CHARS_PER_CHAPTER)}` }
        ],
        temperature: 0.3,
        max_tokens: MAP_MAX_TOKENS
    });
    const summary = (completion.choices[0]?.message?.content ?? "").trim();
    return { chapterId: chapter.id, title: chapter.title, summary };
};

const CROSS_CHAPTER_SYSTEM_PROMPT = `You are a human manuscript editor doing a cross-chapter pass over a novelist's draft. You are
given per-chapter summaries (in reading order), the story's synopsis, and optional reference context (approved
Project Memory facts, the story's established timeline).

Compare the chapters against each other and flag things worth the author's attention, using only these two tags:
- "dev": story/character development concerns spanning multiple chapters — pacing, motivation, unearned turns,
  dropped threads, plot logic that doesn't track across the selection.
- "continuity": SOFT continuity concerns across chapters — things that read as possibly inconsistent but aren't a
  hard, provable Codex contradiction (a dedicated fact-checker already covers hard contradictions; do not duplicate
  that here).

Only flag things a thoughtful editor would actually raise. Do not invent problems, and do not flag matters of pure
taste. If nothing is wrong, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "tag": "dev" | "continuity",
  "severity": "low" | "medium" | "high",
  "title": string,
  "description": string,
  "chapterTitle": string,
  "excerpt": null,
  "direction": string | null
}
"chapterTitle" MUST exactly match one of the chapter titles given in the summaries — the chapter where this issue is
most evident or should be addressed. "excerpt" is always null here (you only have summaries, not verbatim text).
"direction" is an optional brief editorial suggestion (not a rewrite), or null.`;

const buildCrossChapterPromptMessages = (
    chapterSummaries: { title: string; summary: string }[],
    synopsis: string | null,
    memoryContext: string,
    timelineContext: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
    const summariesBlock = chapterSummaries.map(c => `[Chapter: ${c.title}]\n${c.summary || "(no summary available)"}`).join("\n\n---\n\n");

    const sections = [
        synopsis && `=== SYNOPSIS ===\n${synopsis}`,
        `=== CHAPTER SUMMARIES (reading order) ===\n${summariesBlock}`,
        memoryContext && `=== PROJECT MEMORY (approved facts) ===\n${memoryContext.slice(0, MAX_CONTEXT_CHARS)}`,
        timelineContext && `=== STORY TIMELINE (established chronology) ===\n${timelineContext.slice(0, MAX_CONTEXT_CHARS)}`
    ].filter(Boolean);

    return [
        { role: "system", content: CROSS_CHAPTER_SYSTEM_PROMPT },
        { role: "user", content: sections.join("\n\n") }
    ];
};

const buildVoiceSystemPrompt = (includeLine: boolean): string => `You are a human manuscript editor doing a dedicated voice pass over a novelist's draft. You are given the full
text of the selected chapters, in reading order, plus optional reference context on established characters (their
Codex/sheet — voice, personality, background).

Flag voice drift: a character speaking or thinking in a way that doesn't match their established voice, or the
narrative voice shifting inconsistently within or across the chapters. Use the tag "voice" for these.${
    includeLine
        ? `\n\nAlso flag genuinely notable line-level prose craft issues (wordiness, repetition, awkward phrasing) — use the
tag "line" for these. Do not nitpick for the sake of volume; only flag issues a thoughtful editor would actually
raise.`
        : ""
}

Only flag things a thoughtful editor would actually raise. Do not invent problems, and do not flag matters of pure
taste. If nothing is wrong, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "tag": "voice"${includeLine ? ' | "line"' : ""},
  "severity": "low" | "medium" | "high",
  "title": string,
  "description": string,
  "chapterTitle": string,
  "excerpt": string | null,
  "direction": string | null
}
"chapterTitle" MUST exactly match one of the chapter titles given in the "=== CHAPTERS ===" section. "excerpt" is a
short verbatim quote illustrating the issue, or null. "direction" is an optional brief editorial suggestion (not a
rewrite), or null.`;

const buildVoicePromptMessages = (
    chapters: { title: string; text: string }[],
    castContext: string,
    includeLine: boolean
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
    // Splits a fixed total character budget evenly across the selection so a large "whole book"
    // run degrades gracefully instead of blowing the context window (design doc: "Whole book: may
    // chunk for context limits; still one merged list per run").
    const perChapterCap = Math.max(VOICE_CHAPTER_CHAR_FLOOR, Math.floor(VOICE_TOTAL_CHAR_BUDGET / Math.max(1, chapters.length)));
    const chaptersBlock = chapters.map(c => `[Chapter: ${c.title}]\n${c.text.slice(0, perChapterCap)}`).join("\n\n---\n\n");

    const sections = [
        `=== CHAPTERS ===\n${chaptersBlock}`,
        castContext && `=== CAST REFERENCE (established Codex/Sheet) ===\n${castContext}`
    ].filter(Boolean);

    return [
        { role: "system", content: buildVoiceSystemPrompt(includeLine) },
        { role: "user", content: sections.join("\n\n") }
    ];
};

// Programmatic merge, not a fifth LLM call — the two stages write disjoint tags in practice
// (dev/continuity vs voice/line), so "dedupe" here just guards against an accidental duplicate
// rather than needing model judgment (design doc: "not open agent swarm").
const mergeAndDedupeFindings = (crossChapter: ParsedFinding[], voice: ParsedFinding[]): ParsedFinding[] => {
    const seen = new Set<string>();
    const merged: ParsedFinding[] = [];
    for (const finding of [...crossChapter, ...voice]) {
        const key = `${finding.chapterTitle ?? ""}::${finding.title.trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(finding);
    }
    return merged;
};

// Exported for services/jobs/aiReviewJobs.ts. Orchestrates all four Deep stages; `onProgress` is
// an injected callback so this function stays the single place the pipeline itself is defined
// while the job handler owns the actual agentJobs progress row writes (same separation runQuick/
// runAiReviewQuickJob already has, just with more checkpoints).
export const runDeepReview = async (params: {
    reviewId: string;
    storyId: string;
    chapterIds: string[];
    client: OpenAI;
    model: string;
    options: AiReviewOptions;
    onProgress?: (processed: number, total: number, message: string) => Promise<void>;
}): Promise<AiReviewFinding[]> => {
    const { reviewId, storyId, chapterIds, client, model, options, onProgress } = params;
    const total = chapterIds.length + 3; // map (per chapter) + cross-chapter + voice + merge
    let processed = 0;
    const report = async (message: string) => {
        if (onProgress) await onProgress(processed, total, message);
    };

    const { orderedChapters, synopsis } = await loadOrderedChapters(storyId, chapterIds);
    if (orderedChapters.length === 0) return [];

    const chaptersForPrompt = orderedChapters.map(c => ({ id: c.id, title: c.title, text: extractTextFromLexical(c.content) }));
    const titleToId = new Map(orderedChapters.map(c => [c.title, c.id]));

    // 1. Map
    const summaries: { title: string; summary: string }[] = [];
    for (const chapter of chaptersForPrompt) {
        const { title, summary } = await runMapStage(chapter, client, model);
        summaries.push({ title, summary });
        processed++;
        await report(`Mapping chapters (${processed}/${chapterIds.length})…`);
    }

    // Optional context, gathered once and reused by whichever stages want it.
    const [memoryContext, timelineContext] = await Promise.all([
        options.includeMemory ? gatherMemoryContext(storyId) : Promise.resolve(""),
        options.includeTimeline ? gatherTimelineContext(storyId) : Promise.resolve("")
    ]);

    let resolvedCast: { id: string; name: string }[] = [];
    let castContext = "";
    if (options.includeCast) {
        const combinedText = chaptersForPrompt.map(c => c.text).join("\n\n");
        resolvedCast = await resolveCastForChapters(storyId, combinedText);
        castContext = await gatherCastContext(resolvedCast);
        // Best-effort audit write — resolution only happens now, mid-run, so the review row
        // created before this point couldn't have known these ids yet.
        await updateReviewOptions(reviewId, { ...options, castEntryIds: resolvedCast.map(c => c.id) });
    }

    // 2. Cross-chapter
    await report("Cross-chapter pass…");
    const crossChapterFindings = await callFindingsLlm(
        client,
        model,
        buildCrossChapterPromptMessages(summaries, synopsis, memoryContext, timelineContext),
        CROSS_CHAPTER_MAX_TOKENS
    );
    processed++;
    await report("Voice pass…");

    // 3. Voice
    const voiceFindings = await callFindingsLlm(
        client,
        model,
        buildVoicePromptMessages(
            chaptersForPrompt.map(c => ({ title: c.title, text: c.text })),
            castContext,
            !!options.includeLine
        ),
        VOICE_MAX_TOKENS
    );
    processed++;
    await report("Merging findings…");

    // 4. Merge/dedupe + persist
    const merged = mergeAndDedupeFindings(crossChapterFindings, voiceFindings);
    processed++;
    await report("Review complete.");

    if (merged.length === 0) return [];
    return createFindings(toFindingParams(reviewId, storyId, merged, titleToId));
};

// ── AI Review connection ─────────────────────────────────────────────────────────

export const requireAiReviewConnection = async (): Promise<{ client: OpenAI; model: string }> => {
    const connection = await buildClientForFeature("ai_review");
    if (!connection) {
        throw new Error(
            "No AI provider configured for AI Review. Set a global default or an 'AI Review' feature endpoint in AI Settings."
        );
    }
    return connection;
};

export { getFindingsForReview };
