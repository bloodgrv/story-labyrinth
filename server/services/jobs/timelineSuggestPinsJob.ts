import type { AgentJob } from "../../../src/types/agentJob.js";
import type { PinWhenKind } from "../../../src/types/storyTimeline.js";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { buildClientForFeature } from "../aiClientFactory.js";
import { extractTextFromLexical } from "../entityDetector.js";
import { getSpineChronologyExcerpt, getTimelineSuggestSettings, listPendingPinsForStory, proposeAiSuggestedPin } from "../storyTimelineService.js";
import { listVisibleEntriesForStory } from "../storyGraphRepository.js";

// timeline_suggest_pins (TL11B, docs/Story_Timeline_Design.md) — reads a story's visible lorebook
// entries and notes, proposes new storyTimelinePins for chronology beats the text implies but
// nothing has recorded yet. Follows the exact "manual trigger only, pending-row output only"
// precedent as graph_suggest_edges (server/services/jobs/graphSuggestEdgesJob.ts): never
// auto-enqueued, and every candidate lands as status: "pending", source: "ai_suggested" —
// reviewed through the Pending tab's Approve/Reject, never applied directly. Proposed pins are
// native only (no linkType/linkId — same scope cut TL7's chat fence made: the job has no reliable
// way to resolve which specific chapter/note/entry a beat "is", only that the text implies one).

const MAX_ENTRIES = 40;
const MAX_NOTES = 20;
const MAX_TEXT_CHARS = 240;
// Chapter text/summaries are manually picked (not swept), so they get a much larger allowance
// than the generic 240-char cap other sources share — a chronology beat is often buried well
// past the first couple sentences of a chapter.
const MAX_CHAPTER_TEXT_CHARS = 4000;

type CandidateSource = { label: string; text: string };

const WHEN_KINDS: PinWhenKind[] = ["relative", "fuzzy", "civil"];

const SYSTEM_PROMPT = `You suggest chronology beats (timeline pins) for a fiction story, from its lorebook entries, notes, and chapters.
You are given a numbered list of sources (character/location/faction/item descriptions, writer's notes, and chapter
summaries/text) and a list of chronology beats already recorded so you don't repeat them.

For each beat you can support directly from the text (not invented, not inferred from genre convention), propose one
pin. Prefer specificity: use "civil" only for a real calendar date/year stated in the text, "relative" for a beat
explicitly tied to story-start (e.g. "six years before the story begins"), and "fuzzy" for anything else with only a
vague time reference (e.g. "during her childhood"). If nothing is clearly supported, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "sourceIndex": number,
  "title": string,
  "blurb": string | null,
  "whenKind": "civil" | "relative" | "fuzzy",
  "relativeOffsetYears": number | null,
  "fuzzyPhrase": string | null,
  "civilDate": string | null
}
Only the field(s) matching whenKind need be non-null. "title" should briefly name the beat (not restate the source label).`;

type ParsedCandidate = {
    sourceIndex: number;
    title: string;
    blurb: string | null;
    whenKind: string;
    relativeOffsetYears: number | null;
    fuzzyPhrase: string | null;
    civilDate: string | null;
};

const parseCandidates = (raw: string): ParsedCandidate[] => {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    let parsed: unknown[];
    try {
        parsed = JSON.parse(match[0]) as unknown[];
    } catch {
        return [];
    }

    return parsed
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .filter(c => typeof c.sourceIndex === "number" && typeof c.title === "string" && c.title.trim() && typeof c.whenKind === "string")
        .map(c => ({
            sourceIndex: c.sourceIndex as number,
            title: (c.title as string).trim(),
            blurb: typeof c.blurb === "string" && c.blurb.trim() ? c.blurb.trim() : null,
            whenKind: (c.whenKind as string).trim(),
            relativeOffsetYears: typeof c.relativeOffsetYears === "number" ? c.relativeOffsetYears : null,
            fuzzyPhrase: typeof c.fuzzyPhrase === "string" && c.fuzzyPhrase.trim() ? c.fuzzyPhrase.trim() : null,
            civilDate: typeof c.civilDate === "string" && c.civilDate.trim() ? c.civilDate.trim() : null
        }));
};

const isValidWhenKind = (value: string): value is PinWhenKind => WHEN_KINDS.includes(value as PinWhenKind);

export const runTimelineSuggestPinsJob = async (job: AgentJob): Promise<{ storyId: string; proposedCount: number }> => {
    if (!job.storyId) throw new Error("timeline_suggest_pins job requires storyId");
    const storyId = job.storyId;

    const settings = await getTimelineSuggestSettings(storyId);
    const pickedChapterIds = new Set([...settings.includeChapterSummaryIds, ...settings.includeChapterContentIds]);

    const [visibleEntries, noteRows, storyRow, chapterRows] = await Promise.all([
        listVisibleEntriesForStory(storyId),
        settings.includeNotes
            ? db.select().from(schema.notes).where(eq(schema.notes.storyId, storyId)).orderBy(desc(schema.notes.updatedAt)).limit(MAX_NOTES)
            : Promise.resolve([]),
        settings.includeSynopsis
            ? db.select({ title: schema.stories.title, synopsis: schema.stories.synopsis }).from(schema.stories).where(eq(schema.stories.id, storyId))
            : Promise.resolve([]),
        pickedChapterIds.size > 0 ? db.select().from(schema.chapters).where(eq(schema.chapters.storyId, storyId)) : Promise.resolve([])
    ]);

    // null = unrestricted (every category); [] is a distinct, meaningful "none selected" — not
    // the same as null, so a writer can deliberately turn off Lorebook entirely without it
    // silently falling back to "everything."
    const categoryFilter = settings.includeCategories === null ? null : new Set(settings.includeCategories);
    const enabledEntries = visibleEntries.filter(e => !e.isDisabled && (!categoryFilter || categoryFilter.has(e.category)));

    const chaptersById = new Map(chapterRows.map(c => [c.id, c]));
    const pickedChaptersInOrder = (ids: string[]) =>
        ids
            .map(id => chaptersById.get(id))
            .filter((c): c is (typeof chapterRows)[number] => !!c)
            .sort((a, b) => a.order - b.order);

    const sources: CandidateSource[] = [
        ...[...enabledEntries]
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, MAX_ENTRIES)
            .map(e => ({ label: `${e.name} (${e.category})`, text: (e.description ?? "").slice(0, MAX_TEXT_CHARS) })),
        ...noteRows.map(n => ({ label: `Note: ${n.title}`, text: extractTextFromLexical(n.content).slice(0, MAX_TEXT_CHARS) })),
        // "Story Context" (ContextSelector.tsx's chat-side naming) — chapters manually picked in
        // the Suggest Pins Context panel, not swept like everything else above.
        ...pickedChaptersInOrder(settings.includeChapterSummaryIds)
            .filter(c => c.summary)
            .map(c => ({ label: `Chapter ${c.order}: ${c.title} (summary)`, text: (c.summary as string).slice(0, MAX_TEXT_CHARS) })),
        ...pickedChaptersInOrder(settings.includeChapterContentIds).map(c => ({
            label: `Chapter ${c.order}: ${c.title} (full text)`,
            text: extractTextFromLexical(c.content).slice(0, MAX_CHAPTER_TEXT_CHARS)
        }))
    ].filter(s => s.text.trim().length > 0);

    if (sources.length === 0) return { storyId, proposedCount: 0 };

    // Background only, never a candidate source of its own — the synopsis helps the model read
    // ambiguous beats correctly (tone, setting, who's who) without being something it proposes
    // pins FROM directly (it has no [index], so it can never be hallucinated as a sourceIndex).
    const storyContextBlock = storyRow[0]?.synopsis ? `${storyRow[0].title}: ${storyRow[0].synopsis}` : null;

    const [existingPins, pendingPins] = await Promise.all([getSpineChronologyExcerpt(storyId), listPendingPinsForStory(storyId)]);
    const existingSummaryLines = [
        ...existingPins.map(p => `${p.when}: ${p.title}`),
        ...pendingPins.map(p => `(pending) ${p.title}`)
    ].slice(0, 200);

    const connection = await buildClientForFeature("timeline_suggest_pins");
    if (!connection)
        throw new Error(
            "No AI provider configured for Story Timeline pin suggestions. Set a global default or a 'Story Timeline (Suggest Pins)' feature endpoint in AI Settings."
        );
    const { client, model } = connection;

    const sourcesBlock = sources.map((s, i) => `[${i}] ${s.label}: ${s.text}`).join("\n");
    const existingBlock = existingSummaryLines.length > 0 ? existingSummaryLines.join("\n") : "(none yet)";
    const contextSection = storyContextBlock ? `=== STORY CONTEXT (background only, not a source to propose from) ===\n${storyContextBlock}\n\n` : "";

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `${contextSection}=== SOURCES ===\n${sourcesBlock}\n\n=== ALREADY RECORDED (do not repeat) ===\n${existingBlock}`
            }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const parsedCandidates = parseCandidates(raw);

    let proposedCount = 0;
    for (const candidate of parsedCandidates) {
        if (!sources[candidate.sourceIndex]) continue; // hallucinated index — skip, don't throw
        if (!isValidWhenKind(candidate.whenKind)) continue;

        await proposeAiSuggestedPin({
            storyId,
            title: candidate.title,
            blurb: candidate.blurb,
            whenKind: candidate.whenKind,
            relativeOffsetYears: candidate.relativeOffsetYears,
            fuzzyPhrase: candidate.fuzzyPhrase,
            civilDate: candidate.civilDate
        });
        proposedCount++;
    }

    return { storyId, proposedCount };
};
