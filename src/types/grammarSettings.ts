// Grammar Checker: live inline spelling/grammar/style underlines in the Main Editor, powered by
// a self-hosted (or externally pointed) LanguageTool server. Unlike the AI features, this isn't
// an OpenAI-compatible endpoint — LanguageTool has its own REST API (POST /v2/check), so it gets
// its own settings row (server URL + language) instead of going through aiClientFactory's
// featureEndpoints system, the same way TTS's provider config is separate from AI settings.

export interface GrammarSettings {
    id: string;
    enabled: boolean;
    serverUrl: string;
    language: string; // LanguageTool language code (e.g. "en-US"), or "auto" to auto-detect
    createdAt: Date;
}

// LanguageTool's own taxonomy (rule.issueType / category.id) has dozens of values — collapsed
// down to three buckets for the editor's underline color and the settings/UI vocabulary. See
// server/services/grammarService.ts for the mapping.
export type GrammarIssueCategory = "spelling" | "grammar" | "style";

export interface GrammarMatch {
    id: string;
    message: string;
    shortMessage?: string;
    // Character offset/length into the *plain text* of the chapter (Lexical's
    // $getRoot().getTextContent()), not the serialized document — see grammarOffsetMapping.ts
    // for how this gets turned into a Lexical node range.
    offset: number;
    length: number;
    replacements: string[];
    category: GrammarIssueCategory;
    ruleId: string;
}

// POST /api/grammar/check always responds 200 with this shape — expected failure modes
// (disabled, server unreachable, bad response) are `{ success: false, message }`, matching the
// TTS/Humanizer soft-fail convention.
export interface GrammarCheckResult {
    success: boolean;
    matches?: GrammarMatch[];
    message?: string;
}

export interface GrammarConnectionTestResult {
    success: boolean;
    message: string;
}
