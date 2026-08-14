import { eq } from "drizzle-orm";
import type { PinWhenKind } from "../../src/types/storyTimeline.js";
import { db, schema } from "../db/client.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { getSpineChronologyExcerpt, listPendingPinsForStory, proposeAiSuggestedPin } from "./storyTimelineService.js";

// "Extract pins" — dedicated action on a single timeline/event Lorebook entry (2026-08-14 follow-up
// to T6/T5). Closes a real gap: T5 FS5's sheet-sync cross-desk timeline lane (sheetSyncService.ts)
// creates at most ONE pending pin per entry, permanently deduped via findPinsByLink, so a dense
// multi-beat Summary section (e.g. "Day 1: ... Day 2: ... Day 8: ...") never becomes more than one
// truncated pin. This is TL11B's multi-beat extraction doctrine (timelineSuggestPinsJob.ts) applied
// to ONE entry's full sheetBody instead of a whole-story sweep of truncated descriptions —
// deliberately not a fix to that job (its whole-story scope makes per-source depth a real,
// already-made cost tradeoff) and deliberately not a change to Sync's existing one-pin lane (still
// useful as a "quick single pin" default). See DECISIONS.md.
//
// Proposed pins are NATIVE (no linkType/linkId) — same call TL7's chat fence and the bulk job both
// make: several distinct beats extracted from one document don't share a single sensible 1:1 link
// back to that document (and would otherwise trip up getPinForLink's implicit "one pin per source"
// assumption that PlaceOnTimelineButton relies on). Every proposed pin defaults to
// manuscriptStatus: "planned" — the model has no reliable way to tell from prose alone whether a
// beat has actually been drafted into the manuscript yet, only what the source text describes; the
// writer corrects individual pins after review.

const MAX_BODY_CHARS = 8000;
const WHEN_KINDS: PinWhenKind[] = ["relative", "fuzzy", "civil"];
const isValidWhenKind = (value: string): value is PinWhenKind => WHEN_KINDS.includes(value as PinWhenKind);

const SYSTEM_PROMPT = `You extract chronology beats (timeline pins) from a single, possibly dense, Lore Sheet document for a fiction story.
Read the whole document and identify every distinct beat/event it describes — do not summarize it as one beat if it
actually describes several. A "Day 1: ... Day 2: ..." or similarly sequenced structure should become one pin per
day/beat, not one pin for the whole thing.

For each beat, propose one pin with a short specific title (not a restatement of the document's own title) and a
one-to-two-sentence blurb. Use "civil" only for a real calendar date/year stated in the text, "relative" for a beat
explicitly tied to story-start (e.g. "six years before the story begins"), and "fuzzy" for anything else with only a
vague time reference, INCLUDING a plain sequence like "Day 1"/"Day 2" (fuzzyPhrase: "Day 1", etc. — order matters
more than a real date here). Do not invent beats the text doesn't support. If nothing is clearly supported, return [].

You cannot tell from the text alone whether a beat has already been written into the manuscript or is still
planned — do not guess at it or mention it in the blurb. The writer will mark that after review.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "title": string,
  "blurb": string | null,
  "whenKind": "civil" | "relative" | "fuzzy",
  "relativeOffsetYears": number | null,
  "fuzzyPhrase": string | null,
  "civilDate": string | null
}`;

type ParsedCandidate = {
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
        .filter(c => typeof c.title === "string" && c.title.trim() && typeof c.whenKind === "string")
        .map(c => ({
            title: (c.title as string).trim(),
            blurb: typeof c.blurb === "string" && c.blurb.trim() ? c.blurb.trim() : null,
            whenKind: (c.whenKind as string).trim(),
            relativeOffsetYears: typeof c.relativeOffsetYears === "number" ? c.relativeOffsetYears : null,
            fuzzyPhrase: typeof c.fuzzyPhrase === "string" && c.fuzzyPhrase.trim() ? c.fuzzyPhrase.trim() : null,
            civilDate: typeof c.civilDate === "string" && c.civilDate.trim() ? c.civilDate.trim() : null
        }));
};

export interface ExtractPinsResult {
    success: boolean;
    message?: string;
    proposedCount?: number;
}

export const extractPinsFromEntry = async (entryId: string, sheetBody: string, category: string): Promise<ExtractPinsResult> => {
    if (category !== "timeline" && category !== "event") {
        return { success: false, message: "Extracting pins is only available for Timeline and Event entries" };
    }
    if (!sheetBody.trim()) return { success: false, message: "The Lore Sheet is empty — write something first" };

    const [entry] = await db.select().from(schema.lorebookEntries).where(eq(schema.lorebookEntries.id, entryId));
    if (!entry) return { success: false, message: "Entry not found" };

    const storyId = entry.level === "story" ? entry.scopeId : null;
    if (!storyId) return { success: false, message: `This is a ${entry.level}-level entry — pins only attach to a single story.` };

    const connection = await buildClientForFeature("timeline_extract_pins");
    if (!connection) {
        return {
            success: false,
            message:
                "No AI provider configured for pin extraction. Set a global default or a 'Story Timeline (Extract Pins from Entry)' feature endpoint in AI Settings."
        };
    }
    const { client, model } = connection;

    const [existingPins, pendingPins] = await Promise.all([getSpineChronologyExcerpt(storyId), listPendingPinsForStory(storyId)]);
    const existingSummaryLines = [
        ...existingPins.map(p => `${p.when}: ${p.title}`),
        ...pendingPins.map(p => `(pending) ${p.title}`)
    ].slice(0, 200);
    const existingBlock = existingSummaryLines.length > 0 ? existingSummaryLines.join("\n") : "(none yet)";

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `=== DOCUMENT: ${entry.name} ===\n${sheetBody.slice(0, MAX_BODY_CHARS)}\n\n=== ALREADY RECORDED (do not repeat) ===\n${existingBlock}`
            }
        ],
        temperature: 0,
        max_tokens: 3072
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const candidates = parseCandidates(raw);

    let proposedCount = 0;
    for (const candidate of candidates) {
        if (!isValidWhenKind(candidate.whenKind)) continue;
        await proposeAiSuggestedPin({
            storyId,
            title: candidate.title,
            blurb: candidate.blurb,
            whenKind: candidate.whenKind,
            relativeOffsetYears: candidate.relativeOffsetYears,
            fuzzyPhrase: candidate.fuzzyPhrase,
            civilDate: candidate.civilDate,
            manuscriptStatus: "planned"
        });
        proposedCount++;
    }

    if (proposedCount === 0) return { success: true, proposedCount: 0, message: "No new beats found to propose." };
    return { success: true, proposedCount };
};
