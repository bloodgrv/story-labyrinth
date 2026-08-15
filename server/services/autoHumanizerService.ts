import { attemptPromise } from "@jfdi/attempt";
import { db, schema } from "../db/client.js";
import { buildClientForFeature, buildClientForFeatureOverrideOnly } from "./aiClientFactory.js";
import { detectAiText } from "./aiTextDetector.js";
import { buildAutoHumanizeSystemPrompt, INTENSITY_TEMPERATURE } from "./humanizePrompts.js";
import type { AutoHumanizeProcessResult, AutoHumanizerSettings, AutoHumanizerTone } from "../../src/types/autoHumanizerSettings.js";
import type { HumanizerIntensity } from "../../src/types/humanizerSettings.js";

// Single global row, get-or-seed — same convention as humanizerSettings (see routes/humanizer.ts).
// Exported so both the settings route and processAutoHumanize (which needs the gate config
// unconditionally, not just when the settings page is open) share one read path.
export async function getAutoHumanizerSettings(): Promise<AutoHumanizerSettings> {
    const [settings] = await db.select().from(schema.autoHumanizerSettings);
    if (settings) return settings as AutoHumanizerSettings;

    const initial: AutoHumanizerSettings = {
        id: crypto.randomUUID(),
        enabled: false,
        mode: "threshold",
        aiScoreThreshold: 60,
        intensity: "medium",
        tone: "casual",
        customToneDescription: "",
        minChars: 80,
        createdAt: new Date()
    };
    await db.insert(schema.autoHumanizerSettings).values(initial);
    return initial;
}

interface GenerateAutoHumanizedTextParams {
    text: string;
    intensity: HumanizerIntensity;
    tone: AutoHumanizerTone;
    customTone?: string;
    flaggedPhrases?: string[];
}

// Locked decision #16: auto_humanizer's own feature endpoint, falling back to the manual
// Humanizer's endpoint (if configured), falling back to the global default connection — a
// three-tier fallback chain that doesn't exist elsewhere in the codebase. Each tier uses
// buildClientForFeatureOverrideOnly (not the ordinary buildClientForFeature) for the first two
// checks specifically so an unconfigured auto_humanizer doesn't silently swallow the chain via
// its own built-in global fallback before humanizer's override ever gets a chance — see that
// function's own doc comment for the live-caught bug this fixes. Only the final tier uses the
// real global default. Returns null only when none of the three resolve to a usable connection,
// at which point the caller degrades to the original text.
async function resolveAutoHumanizerConnection() {
    return (
        (await buildClientForFeatureOverrideOnly("auto_humanizer")) ??
        (await buildClientForFeatureOverrideOnly("humanizer")) ??
        (await buildClientForFeature())
    );
}

async function generateAutoHumanizedText({
    text,
    intensity,
    tone,
    customTone,
    flaggedPhrases
}: GenerateAutoHumanizedTextParams): Promise<{ success: boolean; text?: string; message?: string }> {
    const connection = await resolveAutoHumanizerConnection();
    if (!connection) {
        return {
            success: false,
            message: "No AI provider configured for Auto Humanizer. Set up a model in AI Settings, or a dedicated endpoint in Settings → Feature Endpoints."
        };
    }

    const { client, model } = connection;
    const systemPrompt = buildAutoHumanizeSystemPrompt(intensity, tone, customTone, flaggedPhrases);

    const [error, completion] = await attemptPromise(() =>
        client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: INTENSITY_TEMPERATURE[intensity]
        })
    );

    if (error) return { success: false, message: error.message };

    const rewritten = completion.choices[0]?.message?.content?.trim();
    if (!rewritten) return { success: false, message: "The model returned an empty response" };

    return { success: true, text: rewritten };
}

// The gate + rewrite core — "process owns gate server-side" (design decision #17), so a caller
// can always just POST the raw text and trust the result, without duplicating threshold/minChars
// logic client-side. Always resolves (never throws) — degrade-open per decision #8: a failure
// returns the original text with success:false, never blocks the caller.
export async function processAutoHumanize(text: string): Promise<AutoHumanizeProcessResult> {
    const settings = await getAutoHumanizerSettings();

    if (!settings.enabled) return { success: true, skipped: true, text };
    if (text.trim().length < settings.minChars) return { success: true, skipped: true, text };

    let score: number | undefined;
    let flaggedPhrases: string[] | undefined;

    if (settings.mode === "threshold") {
        const detection = detectAiText(text);
        score = detection.score;
        flaggedPhrases = detection.matchedPhrases;
        if (detection.score < settings.aiScoreThreshold) return { success: true, skipped: true, text, score };
    }

    const result = await generateAutoHumanizedText({
        text,
        intensity: settings.intensity,
        tone: settings.tone,
        customTone: settings.customToneDescription,
        flaggedPhrases
    });

    if (!result.success || !result.text) {
        return { success: false, text, score, message: result.message ?? "Auto Humanizer failed" };
    }

    return { success: true, skipped: false, text: result.text, score };
}
