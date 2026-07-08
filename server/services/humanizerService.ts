import { attemptPromise } from "@jfdi/attempt";
import { buildClientForFeature } from "./aiClientFactory.js";
import type { HumanizeTextResult, HumanizerIntensity } from "../../src/types/humanizerSettings.js";

// Each intensity level is a fixed system prompt + temperature — not a user-editable Prompt
// (unlike the Prompts feature), since the whole point of "own settings for how much it should
// do" is a small, fixed dial rather than a full prompt editor.
const INTENSITY_SYSTEM_PROMPTS: Record<HumanizerIntensity, string> = {
    light: `You are a prose editor. Rewrite the user's text to sound more natural and less like AI-generated writing, making only light, targeted adjustments: vary repetitive sentence openings, replace stock AI phrasing (e.g. "Furthermore", "It's worth noting", "In conclusion") with more natural alternatives, and smooth over anything mechanically balanced or overly formal. Preserve the original meaning, structure, tense, and point of view almost exactly — this is a polish pass, not a rewrite. Return only the rewritten text, with no preamble, explanation, or quotation marks.`,
    medium: `You are a prose editor rewriting text to sound genuinely human-written rather than AI-generated. Vary sentence length and rhythm noticeably, cut generic or overly balanced phrasing, remove AI tics (repetitive transitions, hedging qualifiers, excessive positivity, listy summarizing), and let word choice feel specific and lived-in rather than generic. You may restructure sentences and reorder clauses, but preserve the original meaning, key details, tense, and point of view. Return only the rewritten text, with no preamble, explanation, or quotation marks.`,
    strong: `You are a prose editor doing an aggressive rewrite to eliminate any trace of AI-generated writing. Substantially rework sentence structure, rhythm, and phrasing — break up mechanically even sentences, cut redundant or filler content, replace generic descriptions with sharper, more specific ones, and write the way a skilled human author would actually write this. Preserve the original meaning, key details, tense, and point of view, but do not preserve the original sentence-by-sentence structure. Return only the rewritten text, with no preamble, explanation, or quotation marks.`
};

const INTENSITY_TEMPERATURE: Record<HumanizerIntensity, number> = {
    light: 0.5,
    medium: 0.8,
    strong: 1.0
};

export const generateHumanizedText = async (
    text: string,
    intensity: HumanizerIntensity
): Promise<HumanizeTextResult> => {
    const connection = await buildClientForFeature("humanizer");
    if (!connection)
        return {
            success: false,
            message: "No AI provider configured. Set up a model in AI Settings, or a dedicated endpoint for the Humanizer in Settings → Feature Endpoints."
        };

    const { client, model } = connection;

    const [error, completion] = await attemptPromise(() =>
        client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: INTENSITY_SYSTEM_PROMPTS[intensity] },
                { role: "user", content: text }
            ],
            temperature: INTENSITY_TEMPERATURE[intensity]
        })
    );

    if (error) return { success: false, message: error.message };

    const rewritten = completion.choices[0]?.message?.content?.trim();
    if (!rewritten) return { success: false, message: "The model returned an empty response" };

    return { success: true, text: rewritten };
};
