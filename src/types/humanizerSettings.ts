// Humanizer: an on-demand rewrite pass for selected text in the Main Editor, aimed at reading
// less like AI-generated prose. Deliberately simple compared to TTS's multi-provider setup —
// one global on/off toggle plus an intensity level, no per-project override, no provider choice
// (it reuses the existing per-feature AI endpoint system — see FeatureKey "humanizer" in
// src/types/aiSettings.ts — so it can run on a different/cheaper model than your main writing
// model without any humanizer-specific endpoint plumbing).

export type HumanizerIntensity = "light" | "medium" | "strong";

export interface HumanizerSettings {
    id: string;
    enabled: boolean;
    intensity: HumanizerIntensity;
    createdAt: Date;
}

export interface HumanizerIntensityMeta {
    id: HumanizerIntensity;
    label: string;
    description: string;
}

export const HUMANIZER_INTENSITIES: HumanizerIntensityMeta[] = [
    {
        id: "light",
        label: "Light",
        description: "Small wording tweaks — smooths awkward phrasing, keeps structure and meaning intact."
    },
    {
        id: "medium",
        label: "Medium",
        description: "Noticeable rewrite — varies sentence rhythm and word choice while preserving meaning and voice."
    },
    {
        id: "strong",
        label: "Strong",
        description: "Aggressive rewrite — reworks sentence structure and phrasing to sound as natural and human as possible."
    }
];

export const HUMANIZER_INTENSITY_MAP: Record<HumanizerIntensity, HumanizerIntensityMeta> = Object.fromEntries(
    HUMANIZER_INTENSITIES.map(level => [level.id, level])
) as Record<HumanizerIntensity, HumanizerIntensityMeta>;

// POST /api/humanizer/rewrite always responds 200 with this shape — expected failure modes
// (disabled, no provider configured, model error) are all `{ success: false, message }`,
// matching the TTS test-connection/voices-refresh soft-fail convention, since the caller just
// needs to toast either way.
export interface HumanizeTextResult {
    success: boolean;
    text?: string;
    message?: string;
}
