// Types for the local, heuristic AI-text detector (server/services/aiTextDetector.ts). Pure
// scoring output — no ML/external API, see docs/Auto_Humanizer_Design.md's "Detection" section.

export type AiDetectVerdict = "human" | "mixed" | "likely_ai" | "almost_certainly_ai";

export interface AiDetectSignals {
    flaggedPhraseDensity: number;
    sentenceBurstiness: number;
    transitionWordDensity: number;
    paragraphSymmetry: number;
    averageSentenceLength: number;
}

export interface AiDetectResult {
    score: number; // 0-100, higher = more AI-like
    verdict: AiDetectVerdict;
    signals: AiDetectSignals;
    matchedPhrases: string[];
}
