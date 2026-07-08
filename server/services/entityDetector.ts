import { and, eq, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { buildClientForFeature } from "./aiClientFactory.js";

type LexicalNode = {
    type?: string;
    text?: string;
    children?: LexicalNode[];
};

export type DetectedEntity = {
    name: string;
    category: "character" | "location" | "item";
    context: string;
};

export type EntitySuggestion = DetectedEntity & {
    suggestedDescription: string;
};

// Convert a Lexical editor JSON string to plain text.
export const extractTextFromLexical = (content: string): string => {
    try {
        const state = JSON.parse(content) as { root?: { children?: LexicalNode[] } };
        if (!state.root?.children) return content;

        const walk = (node: LexicalNode): string => {
            if (node.type === "text") return node.text ?? "";
            if (node.type === "linebreak") return "\n";
            const childText = node.children ? node.children.map(walk).join("") : "";
            return node.type === "paragraph" ? childText + "\n" : childText;
        };

        return state.root.children.map(walk).join("").trim();
    } catch {
        return content;
    }
};

const ENTITY_SYSTEM_PROMPT = `You are a named-entity extractor for fiction writing.
Given a passage of text, identify all clearly-named characters, locations, and items.
Only include proper names — exclude generic references ("the man", "a sword", "someone").
Return ONLY a valid JSON array. Each element must have exactly:
  { "name": string, "category": "character"|"location"|"item", "context": string }
where "context" is the sentence or phrase where the entity first appears.
If no named entities are found, return an empty array: []`;

// Call the LLM to extract named entities from chapter text.
const extractEntitiesFromText = async (text: string): Promise<DetectedEntity[]> => {
    const connection = await buildClientForFeature("entity_detection");
    if (!connection) {
        throw new Error(
            "No AI provider configured. Set up a model in AI Settings before using Quick-Add detection."
        );
    }
    const { client, model } = connection;

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: ENTITY_SYSTEM_PROMPT },
            { role: "user", content: text.slice(0, 8000) }
        ],
        temperature: 0,
        max_tokens: 1024
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
        const parsed = JSON.parse(match[0]) as unknown[];
        return parsed
            .filter((e): e is DetectedEntity => {
                if (typeof e !== "object" || e === null) return false;
                const entity = e as Record<string, unknown>;
                return (
                    typeof entity.name === "string" &&
                    entity.name.trim().length > 0 &&
                    (entity.category === "character" ||
                        entity.category === "location" ||
                        entity.category === "item") &&
                    typeof entity.context === "string"
                );
            })
            .map(e => ({
                name: e.name.trim(),
                category: e.category,
                context: e.context.trim()
            }));
    } catch {
        return [];
    }
};

// Get the lowercased names of all existing lorebook entries in scope for a story.
const getExistingNames = async (storyId: string): Promise<Set<string>> => {
    const storyResult = await db
        .select({ seriesId: schema.stories.seriesId })
        .from(schema.stories)
        .where(eq(schema.stories.id, storyId));

    const story = storyResult[0];

    const conditions = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];

    if (story?.seriesId) {
        conditions.push(
            and(
                eq(schema.lorebookEntries.level, "series"),
                eq(schema.lorebookEntries.scopeId, story.seriesId)
            )
        );
    }

    const entries = await db
        .select({ name: schema.lorebookEntries.name })
        .from(schema.lorebookEntries)
        .where(or(...conditions));

    return new Set(entries.map(e => e.name.toLowerCase().trim()));
};

const CATEGORY_LABELS: Record<DetectedEntity["category"], string> = {
    character: "Character",
    location: "Location",
    item: "Item"
};

// Extract entities from plain chapter content and filter against existing lorebook entries.
export const detectNewEntities = async (
    chapterContent: string,
    storyId: string
): Promise<EntitySuggestion[]> => {
    const text = extractTextFromLexical(chapterContent);
    if (!text.trim()) return [];

    const [detected, existingNames] = await Promise.all([
        extractEntitiesFromText(text),
        getExistingNames(storyId)
    ]);

    return detected
        .filter(entity => !existingNames.has(entity.name.toLowerCase().trim()))
        .map(entity => ({
            ...entity,
            suggestedDescription: `${CATEGORY_LABELS[entity.category]} mentioned in chapter content. Needs fleshing out.`
        }));
};

// Fetch chapter content by ID and detect new entities against the story's lorebook scope.
// This is the main entry point called by the API route.
export const detectNewEntitiesForChapter = async (
    chapterId: string,
    storyId: string
): Promise<{ suggestions: EntitySuggestion[] }> => {
    const chapterResult = await db
        .select({ content: schema.chapters.content, storyId: schema.chapters.storyId })
        .from(schema.chapters)
        .where(eq(schema.chapters.id, chapterId));

    const chapter = chapterResult[0];
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);
    if (chapter.storyId !== storyId) throw new Error("Chapter does not belong to the specified story");

    const suggestions = await detectNewEntities(chapter.content, storyId);
    return { suggestions };
};
