import { and, eq, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { extractTextFromLexical } from "./entityDetector.js";
import { CONCRETE_BEAT_TYPES } from "../../src/types/beats.js";
import type { BeatDetectionResult, ConcreteBeat, ConcreteBeatType } from "../../src/types/beats.js";

const BEAT_TYPE_IDS = new Set<string>(CONCRETE_BEAT_TYPES.map(type => type.id));

// Deliberately strict and repetitive about "concrete only" — this is the one guardrail keeping
// the whole feature (per CLAUDE.md) from drifting into psychological/thematic territory once
// suggestions are AI-generated instead of user-typed.
const BEAT_DETECTION_SYSTEM_PROMPT = `You are analyzing a passage of prose fiction to find CONCRETE, OBSERVABLE narrative beats — small, physical units of action or change that a reader could actually see or hear happening.

Valid beat types (use exactly these ids, nothing else):
- physical_action: a concrete physical act (a punch thrown, a door opened, a hand reaching out)
- dialogue_tag: a line of spoken dialogue or its attribution
- environmental_detail: a concrete detail about the physical setting (weather, lighting, objects in the room)
- wardrobe_item_change: a character puts on, removes, or acquires clothing or an item
- time_setting_shift: a jump in time or a change of location
- sensory_detail: a concrete sensory observation (a sound, smell, taste, texture)
- character_movement: a character moves from one place to another

Do NOT include anything psychological, thematic, emotional, or about internal thoughts, feelings, motivations, or subtext. Only tag what is physically observable.

For each beat found, return an object with exactly:
  { "text": string, "beatType": string, "characterName": string | null }
- "text" MUST be an exact, verbatim substring of the passage — do not paraphrase, summarize, or alter wording in any way.
- "beatType" must be one of the ids listed above.
- "characterName" is the name of the character this beat involves, only if a specific named character is clearly identifiable; otherwise null.

Return ONLY a valid JSON array of these objects. If no clear concrete beats are found, return [].`;

interface RawBeatSuggestion {
    text: string;
    beatType: string;
    characterName?: string | null;
}

const isRawBeatSuggestion = (value: unknown): value is RawBeatSuggestion => {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
        typeof item.text === "string" &&
        item.text.trim().length > 0 &&
        typeof item.beatType === "string" &&
        (item.characterName === undefined || item.characterName === null || typeof item.characterName === "string")
    );
};

const requestBeatSuggestions = async (text: string): Promise<RawBeatSuggestion[]> => {
    const connection = await buildClientForFeature("beat_detection");
    if (!connection)
        throw new Error(
            "No AI provider configured. Set up a model in AI Settings, or a dedicated endpoint for Beat Detection in Settings → Feature Endpoints."
        );

    const { client, model } = connection;

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: BEAT_DETECTION_SYSTEM_PROMPT },
            { role: "user", content: text.slice(0, 12000) }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
        const parsed = JSON.parse(match[0]) as unknown[];
        return parsed.filter(isRawBeatSuggestion);
    } catch {
        return [];
    }
};

// Map of lowercased character name -> lorebookEntries.id, scoped to characters visible to the
// story (global + this story + this story's series) — same scoping rule entityDetector.ts uses
// for its existing-name lookup, narrowed to category: "character" since a beat's character
// reference should never resolve to a location or item entry.
const buildCharacterNameMap = async (storyId: string): Promise<Map<string, string>> => {
    const [story] = await db
        .select({ seriesId: schema.stories.seriesId })
        .from(schema.stories)
        .where(eq(schema.stories.id, storyId));

    const conditions = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story?.seriesId)
        conditions.push(and(eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId)));

    const entries = await db
        .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name })
        .from(schema.lorebookEntries)
        .where(and(eq(schema.lorebookEntries.category, "character"), or(...conditions)));

    return new Map(entries.map(entry => [entry.name.toLowerCase().trim(), entry.id]));
};

// Detect concrete beats in a chapter's prose and persist them as pending suggestions (source:
// "ai_suggested", status: "pending"). Unlike entityDetector's ephemeral /detect (which returns
// candidates for the caller to hold until an explicit create call), suggestions are persisted
// immediately here — background auto-tagging needs them to survive across sessions/reloads,
// not just the request that triggered detection. See DECISIONS.md for the full rationale.
export const detectConcreteBeatsForChapter = async (chapterId: string, storyId: string): Promise<BeatDetectionResult> => {
    const [chapter] = await db
        .select({ content: schema.chapters.content, storyId: schema.chapters.storyId })
        .from(schema.chapters)
        .where(eq(schema.chapters.id, chapterId));

    if (!chapter) return { success: false, message: `Chapter not found: ${chapterId}` };
    if (chapter.storyId !== storyId) return { success: false, message: "Chapter does not belong to the specified story" };

    const text = extractTextFromLexical(chapter.content);
    if (!text.trim()) return { success: true, suggestions: [] };

    const [rawSuggestions, characterNameMap] = await Promise.all([
        requestBeatSuggestions(text),
        buildCharacterNameMap(storyId)
    ]);

    const validSuggestions = rawSuggestions.filter(
        item => BEAT_TYPE_IDS.has(item.beatType) && text.includes(item.text)
    );

    const created: ConcreteBeat[] = [];
    for (const item of validSuggestions) {
        const characterId = item.characterName ? (characterNameMap.get(item.characterName.toLowerCase().trim()) ?? null) : null;
        const row = {
            id: crypto.randomUUID(),
            storyId,
            chapterId,
            beatType: item.beatType as ConcreteBeatType,
            text: item.text,
            characterId,
            source: "ai_suggested" as const,
            status: "pending" as const,
            createdAt: new Date()
        };
        await db.insert(schema.concreteBeats).values(row);
        created.push(row);
    }

    return { success: true, suggestions: created };
};
