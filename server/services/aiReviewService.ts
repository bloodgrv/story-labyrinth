import { eq, inArray } from "drizzle-orm";
import type OpenAI from "openai";
import type { AiReviewFinding, AiReviewSeverity, AiReviewTag } from "../../src/types/aiReview.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { db, schema } from "../db/client.js";
import { chunkText } from "./embeddingService.js";
import { extractTextFromLexical } from "./entityDetector.js";
import { search } from "./ragIndexService.js";
import type { SearchResult } from "./ragRepository.js";
import { createFindings, getFindingsForReview } from "./aiReviewRepository.js";

// Quick mode is a single LLM pass over the whole selection (docs/AI_Review_Design.md — "Run
// modes: Quick"), unlike the Scanner's per-chapter loop — so all caps here bound one combined
// prompt rather than one chapter at a time.
const MAX_CHARS_PER_CHAPTER = 6000;
const MAX_CONTEXT_QUERIES = 6;
const MAX_CONTEXT_CHUNKS = 12;
const MAX_CONTEXT_CHARS = 8000;

// ── Context gathering ────────────────────────────────────────────────────────────

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

// ── LLM prompt + response parsing ────────────────────────────────────────────────

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

const buildPromptMessages = (
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

// ── Public API ─────────────────────────────────────────────────────────────────

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

    const [chapterRows, [story]] = await Promise.all([
        db
            .select({ id: schema.chapters.id, title: schema.chapters.title, content: schema.chapters.content })
            .from(schema.chapters)
            .where(inArray(schema.chapters.id, chapterIds)),
        db.select({ synopsis: schema.stories.synopsis }).from(schema.stories).where(eq(schema.stories.id, storyId))
    ]);

    // Preserve the caller's selection order rather than the DB's natural row order.
    const rowsById = new Map(chapterRows.map(r => [r.id, r]));
    const orderedChapters = chapterIds.map(id => rowsById.get(id)).filter((r): r is (typeof chapterRows)[number] => !!r);
    if (orderedChapters.length === 0) return [];

    const chaptersForPrompt = orderedChapters.map(c => ({
        title: c.title,
        text: extractTextFromLexical(c.content)
    }));
    const titleToId = new Map(orderedChapters.map(c => [c.title, c.id]));

    const combinedText = chaptersForPrompt.map(c => c.text).join("\n\n");
    const context = await gatherContext(storyId, chapterIds, combinedText);

    const completion = await client.chat.completions.create({
        model,
        messages: buildPromptMessages(chaptersForPrompt, story?.synopsis ?? null, context),
        temperature: 0.3,
        max_tokens: 4096
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const parsedFindings = parseFindings(raw);
    if (parsedFindings.length === 0) return [];

    // Findings the model couldn't tie to a given chapter title still get persisted
    // (chapterId: null) rather than dropped — best-effort locus per design doc's schema note.
    return createFindings(
        parsedFindings.map(f => ({
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
        }))
    );
};

export { getFindingsForReview };
