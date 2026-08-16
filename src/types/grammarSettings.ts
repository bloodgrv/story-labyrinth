// Grammar Checker: live inline spelling/grammar/style underlines in the Main Editor, powered by
// harper.js — a Rust/WASM grammar+spelling linter that runs entirely in-process (see
// server/services/harperGrammarService.ts). No server, endpoint, or network reachability is
// involved at all, so unlike the AI features this doesn't go through aiClientFactory's
// featureEndpoints system — it just needs a dialect. (Previously backed by a self-hosted
// LanguageTool server; replaced once AI Review's `line` mode made LanguageTool's style-rule depth
// redundant — see DECISIONS.md.)

// Harper's supported English dialects (harper.js's `Dialect` enum, lowercased for the API/DB).
export type GrammarDialect = "american" | "british" | "canadian" | "australian" | "indian";

export interface GrammarSettings {
    id: string;
    enabled: boolean;
    dialect: GrammarDialect;
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
