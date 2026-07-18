import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { extractTextFromLexical } from "./entityDetector.js";

const SYSTEM_PROMPT = `You are a fiction co-writer generating an alternate draft of a chapter. Rewrite the chapter text into a fresh version — you may vary prose style, pacing, scene structure, and specific word choices, but preserve the core plot events, characters, and setting unless the user's instruction says otherwise. Return only the rewritten chapter text as plain prose paragraphs (blank line between paragraphs), with no preamble, explanation, headings, or quotation marks.`;

export type GenerateChapterVersionResult = { success: true; text: string } | { success: false; message: string };

// Non-streaming, mirrors humanizerService.ts's generateHumanizedText — a whole-chapter rewrite
// arrives as one response rather than progressively, matching this feature's other AI-rewrite
// precedent rather than the separate streaming path "Generate with prompt" uses.
export const generateChapterVersionText = async (
    chapterId: string,
    instruction?: string
): Promise<GenerateChapterVersionResult> => {
    const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!chapter) return { success: false, message: `Chapter not found: ${chapterId}` };

    const connection = await buildClientForFeature("chapter_version");
    if (!connection)
        return {
            success: false,
            message:
                "No AI provider configured. Set up a model in AI Settings, or a dedicated endpoint for Chapter Versions in Settings → Feature Endpoints."
        };

    const { client, model } = connection;
    const chapterText = extractTextFromLexical(chapter.content);
    const trimmedInstruction = instruction?.trim();
    const userContent = trimmedInstruction ? `Instruction: ${trimmedInstruction}\n\n---\n\n${chapterText}` : chapterText;

    const [error, completion] = await attemptPromise(() =>
        client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userContent }
            ],
            temperature: 0.9
        })
    );
    if (error) return { success: false, message: error.message };

    const rewritten = completion.choices[0]?.message?.content?.trim();
    if (!rewritten) return { success: false, message: "The model returned an empty response" };

    return { success: true, text: rewritten };
};

// Reverse of entityDetector.ts's extractTextFromLexical, just enough to turn an AI response
// back into a valid, editable Lexical document — not a full markdown parser. Splits on blank
// lines into paragraphs (matching how this app's own chapter content is structured; confirmed
// against real demo-story content), each paragraph a single text node. Good enough for a first
// AI draft; the user's own editor (bold/italic/etc.) takes over from there once they start
// revising the version.
export const textToLexicalContent = (text: string): string => {
    const paragraphs = text
        .split(/\n{2,}/)
        .map(p => p.replace(/\n/g, " ").trim())
        .filter(p => p.length > 0);

    const children = paragraphs.map(paragraph => ({
        children: [{ detail: 0, format: 0, mode: "normal", style: "", text: paragraph, type: "text", version: 1 }],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1
    }));

    return JSON.stringify({
        root: {
            children: children.length > 0 ? children : [{ children: [], direction: "ltr", format: "", indent: 0, type: "paragraph", version: 1 }],
            direction: "ltr",
            format: "",
            indent: 0,
            type: "root",
            version: 1
        }
    });
};
