import { attemptPromise } from "@jfdi/attempt";
import type { GrammarCheckResult, GrammarDialect, GrammarIssueCategory, GrammarMatch } from "../../src/types/grammarSettings.js";

// In-process grammar/spelling checker for the Grammar Checker feature, replacing the old
// LanguageTool-server-backed grammarService.ts. Runs harper.js (Rust/WASM, Apache-2.0,
// Automattic) directly in the Node process — no server, Docker container, or network reachable
// at all. Its WASM binary ships inside the npm package itself, so unlike Local Embeddings there's
// no prefetch/build step either.
//
// NOTE: node_modules/harper.js has a genuine Windows bug in its bundled WASM loader
// (`fs.readFile(new URL(binary).pathname, ...)` mangles Windows drive-letter paths into
// `E:\E:\...` and throws ENOENT). Patched via patch-package — see patches/harper.js+2.7.0.patch
// (fix: pass the URL object itself to fs.readFile instead of its .pathname string).

type HarperModule = typeof import("harper.js");
type Linter = InstanceType<HarperModule["LocalLinter"]>;

interface HarperContext {
    harper: HarperModule;
    linter: Linter;
}

let contextPromise: Promise<HarperContext> | null = null;
let currentDialect: GrammarDialect | null = null;

// Lazily loads the WASM linter once and reuses it — construction is the expensive part
// (compiling the WASM module + building the curated dictionary), so every call after the first
// just awaits the same cached promise, mirroring localEmbeddingService.ts's getExtractor().
const getContext = async (): Promise<HarperContext> => {
    if (!contextPromise) {
        contextPromise = (async () => {
            const harper = await import("harper.js");
            const { binary } = await import("harper.js/binary");
            const linter = new harper.LocalLinter({ binary, dialect: harper.Dialect.American });
            return { harper, linter };
        })();
    }
    return contextPromise;
};

const toHarperDialect = (harper: HarperModule, dialect: GrammarDialect) => {
    const key = (dialect.charAt(0).toUpperCase() + dialect.slice(1)) as keyof HarperModule["Dialect"];
    return harper.Dialect[key];
};

// Harper's LintKind taxonomy (harper.js v2.7.0: Agreement/BoundaryError/Capitalization/Eggcorn/
// Enhancement/Formatting/Grammar/Malapropism/Miscellaneous/Nonstandard/Punctuation/Readability/
// Redundancy/Regionalism/Repetition/Spelling/Style/Typo/Usage/WordChoice/WordOrder) collapsed
// into the editor's existing three display buckets, so GrammarMarkNode/the underline-colour UI
// needed zero changes. Unlike LanguageTool's category.id (which defaulted unrecognized values to
// "style" as the least-alarming bucket), unmapped Harper kinds default to "grammar" here — Harper
// is a grammar/spelling-first linter by design philosophy (it deliberately avoids style/voice
// judgment calls, see github.com/Automattic/harper/discussions/1465), so "grammar" is the more
// honest fallback for whatever it flags.
const CATEGORY_MAP: Partial<Record<string, GrammarIssueCategory>> = {
    Spelling: "spelling",
    Typo: "spelling",
    Capitalization: "spelling",
    Agreement: "grammar",
    Grammar: "grammar",
    Nonstandard: "grammar",
    Usage: "grammar",
    WordOrder: "grammar",
    Punctuation: "grammar",
    Enhancement: "style",
    Formatting: "style",
    Readability: "style",
    Redundancy: "style",
    Regionalism: "style",
    Repetition: "style",
    Style: "style",
    WordChoice: "style"
};

const categorize = (lintKind: string): GrammarIssueCategory => CATEGORY_MAP[lintKind] ?? "grammar";

export const checkGrammarLocally = async (text: string, dialect: GrammarDialect): Promise<GrammarCheckResult> => {
    const [error, matches] = await attemptPromise(async () => {
        const { harper, linter } = await getContext();
        if (currentDialect !== dialect) {
            await linter.setDialect(toHarperDialect(harper, dialect));
            currentDialect = dialect;
        }

        const lints = await linter.lint(text);
        return lints.map((lint, index): GrammarMatch => {
            const span = lint.span();
            const lintKind = lint.lint_kind();
            // Suggestion.get_replacement_text() returns "" for Remove-kind suggestions — those
            // aren't meaningful replacement buttons (GrammarIssuePopover.tsx uses the replacement
            // string itself as a React key), so drop them rather than showing a blank button.
            const replacements = lint
                .suggestions()
                .map(suggestion => suggestion.get_replacement_text())
                .filter(replacement => replacement.length > 0)
                .slice(0, 5);

            return {
                // Harper's public Lint API has no fine-grained per-rule id like LanguageTool's
                // rule.id — lint_kind() (the category) is the closest stable identifier, and it's
                // only ever combined with the matched text downstream (session-only ignore
                // tracking in useGrammarChecker.ts), so category-level granularity is sufficient.
                id: `${lintKind}-${span.start}-${index}`,
                message: lint.message(),
                offset: span.start,
                length: span.end - span.start,
                replacements,
                category: categorize(lintKind),
                ruleId: lintKind
            };
        });
    });

    if (error) return { success: false, message: `Grammar check failed: ${error.message}` };
    return { success: true, matches };
};
