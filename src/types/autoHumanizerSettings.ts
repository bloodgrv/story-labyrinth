// Auto Humanizer: an optional commit-time filter, separate from the manual Humanizer
// (humanizerSettings). When enabled, AI prose accepted into a chapter is run through a local
// AI-detection gate (aiTextDetector.ts) and, when warranted, rewritten before it ever reaches
// the chapter — the manuscript only ever sees the final text. See docs/Auto_Humanizer_Design.md.

import type { HumanizerIntensity } from "./humanizerSettings.js";

export type AutoHumanizerMode = "threshold" | "always";
export type AutoHumanizerTone = "casual" | "professional" | "academic" | "custom";

export interface AutoHumanizerSettings {
    id: string;
    enabled: boolean;
    mode: AutoHumanizerMode;
    aiScoreThreshold: number; // 0-100, step 5
    intensity: HumanizerIntensity;
    tone: AutoHumanizerTone;
    customToneDescription: string;
    minChars: number;
    createdAt: Date;
}

// POST /api/auto-humanizer/process always responds 200 with this shape — `text` is always
// present so the caller can unconditionally use it; `success: false` only controls whether to
// surface a toast (degrade-open: original text is returned either way, never blocked).
export interface AutoHumanizeProcessResult {
    success: boolean;
    text?: string;
    skipped?: boolean;
    score?: number;
    message?: string;
}

export interface AutoHumanizerToneMeta {
    id: AutoHumanizerTone;
    label: string;
}

export const AUTO_HUMANIZER_TONES: AutoHumanizerToneMeta[] = [
    { id: "casual", label: "Casual" },
    { id: "professional", label: "Professional" },
    { id: "academic", label: "Academic" },
    { id: "custom", label: "Custom" }
];

export const AUTO_HUMANIZER_MODES: { id: AutoHumanizerMode; label: string; description: string }[] = [
    { id: "threshold", label: "Detect above threshold", description: "Only rewrite text that scores as AI-like." },
    { id: "always", label: "Always rewrite", description: "Rewrite every accepted AI prose insert, regardless of score." }
];
