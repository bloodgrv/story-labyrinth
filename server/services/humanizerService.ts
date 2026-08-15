import { attemptPromise } from "@jfdi/attempt";
import { buildClientForFeature } from "./aiClientFactory.js";
import { INTENSITY_SYSTEM_PROMPTS, INTENSITY_TEMPERATURE } from "./humanizePrompts.js";
import type { HumanizeTextResult, HumanizerIntensity } from "../../src/types/humanizerSettings.js";

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
