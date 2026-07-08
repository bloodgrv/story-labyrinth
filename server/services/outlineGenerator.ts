import { and, asc, desc, eq, or } from "drizzle-orm";
import type { OutlineGenerationResult, OutlineItem } from "../../src/types/outline.js";
import { db, schema } from "../db/client.js";
import { buildClientForFeature } from "./aiClientFactory.js";

// Deliberately open-ended (unlike beatDetector's fixed taxonomy) — an outline chapter/scene is
// free-form prose planning, not a constrained tag, so there's no "valid ids" allowlist to
// enforce here the way there is for concrete beats.
const OUTLINE_GENERATION_SYSTEM_PROMPT = `You are a fiction outlining assistant. Given a story's synopsis, its main characters, and any chapters that already exist, propose the NEXT chapters that should come after them (or, if none exist yet, propose an opening structure for the whole story).

Return ONLY a valid JSON array, no other text. Each element is a chapter:
  {
    "title": string,
    "summary": string,
    "wordCountTarget": number | null,
    "scenes": [
      { "title": string, "summary": string, "wordCountTarget": number | null }
    ]
  }

Rules:
- Propose between 1 and 5 chapters.
- Each chapter should have between 1 and 6 scenes.
- "summary" should be 1-3 sentences describing what concretely happens — no vague thematic language.
- "wordCountTarget" is a rough target word count for that chapter/scene, or null if you have no reasonable estimate.
- Do not repeat or restate existing chapters — only propose new ones that continue the story.`;

interface RawSceneSuggestion {
    title: string;
    summary?: string | null;
    wordCountTarget?: number | null;
}

interface RawChapterSuggestion extends RawSceneSuggestion {
    scenes?: unknown;
}

const isRawScene = (value: unknown): value is RawSceneSuggestion => {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    return typeof item.title === "string" && item.title.trim().length > 0;
};

const isRawChapter = (value: unknown): value is RawChapterSuggestion => {
    if (!isRawScene(value)) return false;
    const scenes = (value as { scenes?: unknown }).scenes;
    return scenes === undefined || Array.isArray(scenes);
};

// Gathers just enough context to ground the suggestions in this specific story: synopsis, main
// characters (global + series + story scoped, same rule as beatDetector's character lookup),
// and both already-written chapters and already-planned-but-unwritten outline chapters — so the
// model doesn't propose something that duplicates either.
const buildStoryContext = async (storyId: string): Promise<string> => {
    const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
    if (!story) throw new Error(`Story not found: ${storyId}`);

    const conditions = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story.seriesId)
        conditions.push(
            and(eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId))
        );

    const characters = await db
        .select({ name: schema.lorebookEntries.name, description: schema.lorebookEntries.description })
        .from(schema.lorebookEntries)
        .where(and(eq(schema.lorebookEntries.category, "character"), or(...conditions)));

    const existingChapters = await db
        .select({ title: schema.chapters.title, summary: schema.chapters.summary, order: schema.chapters.order })
        .from(schema.chapters)
        .where(eq(schema.chapters.storyId, storyId))
        .orderBy(asc(schema.chapters.order));

    const existingOutlineChapters = await db
        .select({
            title: schema.outlineItems.title,
            summary: schema.outlineItems.summary,
            order: schema.outlineItems.order
        })
        .from(schema.outlineItems)
        .where(and(eq(schema.outlineItems.storyId, storyId), eq(schema.outlineItems.type, "chapter")))
        .orderBy(asc(schema.outlineItems.order));

    const lines = [
        `Title: ${story.title}`,
        story.synopsis ? `Synopsis: ${story.synopsis}` : null,
        characters.length > 0
            ? `Main characters:\n${characters.map(c => `- ${c.name}: ${c.description.slice(0, 200)}`).join("\n")}`
            : null,
        existingChapters.length > 0
            ? `Existing chapters (already written):\n${existingChapters.map(c => `${c.order}. ${c.title}${c.summary ? ` — ${c.summary}` : ""}`).join("\n")}`
            : null,
        existingOutlineChapters.length > 0
            ? `Existing outline chapters (planned, not yet written):\n${existingOutlineChapters.map(c => `${c.order}. ${c.title}${c.summary ? ` — ${c.summary}` : ""}`).join("\n")}`
            : null
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n\n").slice(0, 12000);
};

const requestOutlineSuggestions = async (storyContext: string): Promise<RawChapterSuggestion[]> => {
    const connection = await buildClientForFeature("outline_generation");
    if (!connection)
        throw new Error(
            "No AI provider configured. Set up a model in AI Settings, or a dedicated endpoint for Outline Generation in Settings → Feature Endpoints."
        );

    const { client, model } = connection;
    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: OUTLINE_GENERATION_SYSTEM_PROMPT },
            { role: "user", content: storyContext }
        ],
        temperature: 0.7,
        max_tokens: 3072
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
        const parsed = JSON.parse(match[0]) as unknown[];
        return parsed.filter(isRawChapter);
    } catch {
        return [];
    }
};

// Generates suggested chapters (each with nested scenes) continuing on from whatever already
// exists, and persists them immediately as pending suggestions (source: "ai_suggested", status:
// "pending") — same immediate-persistence rationale as detectConcreteBeatsForChapter: this can
// be a slow background action, and suggestions need to survive a reload/navigation while
// awaiting review, not just live in the response of the triggering request.
export const generateOutlineSuggestions = async (storyId: string): Promise<OutlineGenerationResult> => {
    const storyContext = await buildStoryContext(storyId);
    const rawChapters = await requestOutlineSuggestions(storyContext);
    if (rawChapters.length === 0) return { success: true, suggestions: [] };

    const [existingMax] = await db
        .select({ order: schema.outlineItems.order })
        .from(schema.outlineItems)
        .where(and(eq(schema.outlineItems.storyId, storyId), eq(schema.outlineItems.type, "chapter")))
        .orderBy(desc(schema.outlineItems.order))
        .limit(1);

    let nextChapterOrder = (existingMax?.order ?? 0) + 1;
    const now = new Date();
    const created: OutlineItem[] = [];

    for (const rawChapter of rawChapters) {
        const chapterRow = {
            id: crypto.randomUUID(),
            storyId,
            parentId: null,
            type: "chapter" as const,
            title: rawChapter.title,
            summary: rawChapter.summary ?? null,
            wordCountTarget: rawChapter.wordCountTarget ?? null,
            order: nextChapterOrder++,
            source: "ai_suggested" as const,
            status: "pending" as const,
            chapterId: null,
            createdAt: now,
            updatedAt: now
        };
        await db.insert(schema.outlineItems).values(chapterRow);
        created.push(chapterRow);

        const rawScenes = Array.isArray(rawChapter.scenes) ? rawChapter.scenes : [];
        let sceneOrder = 1;
        for (const rawScene of rawScenes) {
            if (!isRawScene(rawScene)) continue;
            const sceneRow = {
                id: crypto.randomUUID(),
                storyId,
                parentId: chapterRow.id,
                type: "scene" as const,
                title: rawScene.title,
                summary: rawScene.summary ?? null,
                wordCountTarget: rawScene.wordCountTarget ?? null,
                order: sceneOrder++,
                source: "ai_suggested" as const,
                status: "pending" as const,
                chapterId: null,
                createdAt: now,
                updatedAt: now
            };
            await db.insert(schema.outlineItems).values(sceneRow);
            created.push(sceneRow);
        }
    }

    return { success: true, suggestions: created };
};
