import { attemptPromise } from "@jfdi/attempt";
import { buildClientForFeature } from "./aiClientFactory.js";

export interface ImproveSheetResult {
    success: boolean;
    sheetBody?: string;
    message?: string;
}

// Optional "Improve sheet with AI" pass (T5 FS2, docs/Lore_Sheet_And_Sync_Design.md §9b) — a
// one-shot tidy-up over a Lore Sheet's existing markdown, not a chat/propose-approve flow. The
// Lore Sheet is already a freely user-editable field (unlike Codex/description, which the Sync
// loop's propose→Accept gate will govern once FS3 exists), so this mirrors humanizerService.ts's
// one-shot rewrite pattern: stateless, client applies the result to the (unsaved) form field, the
// user still has to hit Update to persist anything. Deliberately does NOT invent new facts or
// sections — instruction is explicit about preserving `##` heading structure and existing content,
// since downstream heading-based tooling (the outline, and FS3's own deterministic `##` split)
// depends on that structure staying intact.
export const improveSheetWithAI = async (sheetBody: string, category: string, entryName: string): Promise<ImproveSheetResult> => {
    const connection = await buildClientForFeature("sheet_migrate");
    if (!connection)
        return {
            success: false,
            message: "No AI provider configured. Set up a model in AI Settings, or a dedicated endpoint for Lore Sheet improvement in Settings → Feature Endpoints."
        };

    const { client, model } = connection;

    const systemPrompt =
        `You are a story bible editor. The user will give you a "Lore Sheet" — a markdown document for a ${category} ` +
        `lorebook entry named "${entryName}", organized under "## Section" headings. Tidy the prose within each section: ` +
        "improve clarity and flow, fix awkward phrasing, and keep bullet lists as bullet lists. " +
        "Do NOT invent new facts, characters, places, or events not already present. Do NOT add, remove, rename, or " +
        "reorder any '##' section headings — preserve the exact heading structure verbatim, only rewrite the content " +
        "underneath each one. If a section is empty, leave it empty. Return only the improved markdown, with no preamble, " +
        "explanation, or code fences.";

    const [error, completion] = await attemptPromise(() =>
        client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: sheetBody }
            ],
            temperature: 0.6
        })
    );

    if (error) return { success: false, message: error.message };

    const improved = completion.choices[0]?.message?.content?.trim();
    if (!improved) return { success: false, message: "The model returned an empty response" };

    return { success: true, sheetBody: improved };
};
