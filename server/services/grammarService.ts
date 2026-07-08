import { attemptPromise } from "@jfdi/attempt";
import type {
    GrammarCheckResult,
    GrammarConnectionTestResult,
    GrammarIssueCategory,
    GrammarMatch
} from "../../src/types/grammarSettings.js";

interface LanguageToolMatch {
    message: string;
    shortMessage?: string;
    offset: number;
    length: number;
    replacements: { value: string }[];
    rule: { id: string; category?: { id?: string } };
}

interface LanguageToolResponse {
    matches: LanguageToolMatch[];
}

// LanguageTool's own category.id taxonomy has dozens of values across its language packs —
// collapsed down to the three buckets the editor actually renders differently. Unrecognized
// categories default to "style" (the least alarming bucket) rather than "grammar"/"spelling",
// since a miscategorized *hard* error would look more authoritative than intended.
const CATEGORY_MAP: Record<string, GrammarIssueCategory> = {
    TYPOS: "spelling",
    CASING: "spelling",
    GRAMMAR: "grammar",
    PUNCTUATION: "grammar",
    CONFUSED_WORDS: "grammar",
    COMPOUNDING: "grammar",
    STYLE: "style",
    REDUNDANCY: "style",
    COLLOCATIONS: "style",
    TYPOGRAPHY: "style"
};

const categorizeMatch = (match: LanguageToolMatch): GrammarIssueCategory =>
    CATEGORY_MAP[match.rule.category?.id ?? ""] ?? "style";

const normalizeServerUrl = (serverUrl: string): string => serverUrl.replace(/\/+$/, "");

export const checkGrammar = async (
    text: string,
    serverUrl: string,
    language: string
): Promise<GrammarCheckResult> => {
    const [error, response] = await attemptPromise(async () => {
        const res = await fetch(`${normalizeServerUrl(serverUrl)}/v2/check`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ text, language: language || "auto" })
        });
        if (!res.ok) throw new Error(`LanguageTool server responded with ${res.status}`);
        return (await res.json()) as LanguageToolResponse;
    });

    if (error) return { success: false, message: `Could not reach LanguageTool: ${error.message}` };

    const matches: GrammarMatch[] = response.matches.map((match, index) => ({
        id: `${match.rule.id}-${match.offset}-${index}`,
        message: match.message,
        shortMessage: match.shortMessage || undefined,
        offset: match.offset,
        length: match.length,
        // LanguageTool sometimes offers a long tail of low-quality alternatives — 5 is plenty
        // for a popover.
        replacements: match.replacements.slice(0, 5).map(replacement => replacement.value),
        category: categorizeMatch(match),
        ruleId: match.rule.id
    }));

    return { success: true, matches };
};

// A lightweight GET (LanguageTool's supported-languages list) rather than a real /v2/check call
// — a connection test should be cheap and not depend on having any text to check.
export const testGrammarConnection = async (serverUrl: string): Promise<GrammarConnectionTestResult> => {
    const [error] = await attemptPromise(async () => {
        const res = await fetch(`${normalizeServerUrl(serverUrl)}/v2/languages`);
        if (!res.ok) throw new Error(`server responded with ${res.status}`);
    });

    if (error) return { success: false, message: `Could not connect to LanguageTool: ${error.message}` };
    return { success: true, message: "Connected to LanguageTool successfully." };
};
