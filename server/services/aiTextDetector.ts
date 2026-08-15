// Local, heuristic AI-text detector — port of the altra/humanize plugin's five-signal family
// (docs/Auto_Humanizer_Design.md's "Detection" section). Pure function, no ML classifier, no
// external API. Explicitly probabilistic — literary/formal prose can false-positive; the
// threshold slider (autoHumanizerSettings.aiScoreThreshold) is the user's control for that, not
// this module trying to be more "accurate."
import type { AiDetectResult, AiDetectSignals, AiDetectVerdict } from "../../src/types/aiTextDetector.js";

const FLAGGED_PHRASES = [
    "delve into",
    "delve",
    "it's worth noting",
    "it is worth noting",
    "in conclusion",
    "moreover",
    "furthermore",
    "boasts",
    "tapestry",
    "testament to",
    "stands as a testament",
    "in today's world",
    "navigate the complexities",
    "unlock the potential",
    "in the realm of",
    "plays a crucial role",
    "it is important to note",
    "let's dive in",
    "in summary",
    "additionally",
    "consequently",
    "notably",
    "seamless",
    "robust",
    "leverage",
    "utilize",
    "showcase",
    "underscore",
    "myriad",
    "plethora",
    "intricate",
    "elevate",
    "unparalleled",
    "game-changer",
    "cutting-edge",
    "when it comes to",
    "at the end of the day"
];

const TRANSITION_WORDS = [
    "moreover",
    "furthermore",
    "additionally",
    "consequently",
    "however",
    "therefore",
    "thus",
    "hence",
    "nonetheless",
    "nevertheless",
    "meanwhile",
    "subsequently",
    "in addition",
    "as a result",
    "on the other hand",
    "in contrast"
];

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitSentences(text: string): string[] {
    return text
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
        .map(s => s.trim())
        .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean);
}

function wordCount(text: string): number {
    const words = text.trim().match(/\S+/g);
    return words ? words.length : 0;
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = mean(values);
    const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

export function detectAiText(text: string): AiDetectResult {
    const totalWords = wordCount(text);
    const sentences = splitSentences(text);
    const paragraphs = splitParagraphs(text);
    const lowerText = text.toLowerCase();

    // Signal 1 (30%): flagged phrase density — count occurrences of common AI tics.
    const matchedPhrases: string[] = [];
    let phraseMatchCount = 0;
    for (const phrase of FLAGGED_PHRASES) {
        const matches = lowerText.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"));
        if (matches) {
            phraseMatchCount += matches.length;
            matchedPhrases.push(phrase);
        }
    }
    const flaggedPhraseDensity = totalWords > 0 ? Math.min(100, (phraseMatchCount / totalWords) * 2000) : 0;

    // Signal 2 (25%): sentence burstiness — human prose varies sentence length a lot (high
    // coefficient of variation); AI prose tends toward uniform length (low CoV).
    const sentenceLengths = sentences.map(wordCount).filter(n => n > 0);
    let sentenceBurstiness = 0;
    if (sentenceLengths.length >= 2) {
        const avgLen = mean(sentenceLengths);
        const cov = avgLen > 0 ? stddev(sentenceLengths) / avgLen : 0;
        sentenceBurstiness = Math.max(0, Math.min(100, (0.6 - cov) * 200));
    }

    // Signal 3 (20%): transition-word density.
    let transitionCount = 0;
    for (const word of TRANSITION_WORDS) {
        const matches = lowerText.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi"));
        if (matches) transitionCount += matches.length;
    }
    const transitionWordDensity = totalWords > 0 ? Math.min(100, (transitionCount / totalWords) * 2500) : 0;

    // Signal 4 (15%): paragraph symmetry — same low-variance-is-suspicious logic as burstiness,
    // applied to paragraph length instead of sentence length.
    const paragraphLengths = paragraphs.map(wordCount).filter(n => n > 0);
    let paragraphSymmetry = 0;
    if (paragraphLengths.length >= 2) {
        const avgLen = mean(paragraphLengths);
        const cov = avgLen > 0 ? stddev(paragraphLengths) / avgLen : 0;
        paragraphSymmetry = Math.max(0, Math.min(100, (0.5 - cov) * 200));
    }

    // Signal 5 (10%): average sentence length, peak AI band ~18-25 words (center 21.5, half-width 8).
    const avgSentenceLen = mean(sentenceLengths);
    let averageSentenceLength = 0;
    if (avgSentenceLen > 0) {
        const distance = Math.abs(avgSentenceLen - 21.5);
        averageSentenceLength = Math.max(0, 100 - (distance / 8) * 100);
    }

    const signals: AiDetectSignals = {
        flaggedPhraseDensity,
        sentenceBurstiness,
        transitionWordDensity,
        paragraphSymmetry,
        averageSentenceLength
    };

    const rawScore =
        signals.flaggedPhraseDensity * 0.3 +
        signals.sentenceBurstiness * 0.25 +
        signals.transitionWordDensity * 0.2 +
        signals.paragraphSymmetry * 0.15 +
        signals.averageSentenceLength * 0.1;
    const score = Math.round(Math.max(0, Math.min(100, rawScore)));

    const verdict: AiDetectVerdict = score <= 30 ? "human" : score <= 60 ? "mixed" : score <= 80 ? "likely_ai" : "almost_certainly_ai";

    return { score, verdict, signals, matchedPhrases };
}
