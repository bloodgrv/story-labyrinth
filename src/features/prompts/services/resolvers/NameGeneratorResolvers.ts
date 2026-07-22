import { attemptPromise } from "@jfdi/attempt";
import { nameGeneratorApi } from "@/services/api/client";
import type { PromptContext } from "@/types/story";
import { NAME_POOL_GENDERS, NAME_POOL_KINDS, type NamePoolGender, type NamePoolKind } from "@/types/nameGenerator";
import { logger } from "@/utils/logger";
import type { IVariableResolver } from "./types";

// NG3 (docs/Name_Generator_Design.md v0.4) — `{{name kind=first_name gender=female region=US
// era=1980-1999 count=3}}` syntax. Space-delimited key=value params, matching this parser's
// existing grammar (PromptParser.parseRegularVariables splits on spaces, no colons/commas) —
// v0.3's original `{{name: pool-id, …}}` spec didn't fit that grammar (see v0.4 correction #2).
// All params optional; `kind` defaults to "first_name" since a bare `{{name}}` inline in prose is
// the most common case. Registered in VariableResolverRegistry like `character`/`all_characters`,
// not the separate hardcoded parenthesis-call path that only handles two functions today.
//
// Read-only, same as the panel's generate action (NG1/NG2) — never writes to the used-names
// ledger. A model completion that actually uses a generated name still goes through the normal
// Codex proposal/approval path if it becomes a character; this resolver only ever substitutes text.

const parseNameParams = (params: string[]): Record<string, string> => {
    const parsed: Record<string, string> = {};
    for (const token of params) {
        const eqIndex = token.indexOf("=");
        if (eqIndex === -1) continue;
        const key = token.slice(0, eqIndex).trim();
        const value = token.slice(eqIndex + 1).trim();
        if (key && value) parsed[key] = value;
    }
    return parsed;
};

const isKind = (value: string): value is NamePoolKind => NAME_POOL_KINDS.includes(value as NamePoolKind);
const isGender = (value: string): value is NamePoolGender => NAME_POOL_GENDERS.includes(value as NamePoolGender);

export class NameResolver implements IVariableResolver {
    async resolve(context: PromptContext, ...params: string[]): Promise<string> {
        const parsed = parseNameParams(params);

        const kind = parsed.kind && isKind(parsed.kind) ? parsed.kind : "first_name";
        const gender = parsed.gender && isGender(parsed.gender) ? parsed.gender : undefined;
        const count = parsed.count ? Math.min(20, Math.max(1, Number(parsed.count) || 1)) : 1;
        const maxLength = parsed.maxLength ? Number(parsed.maxLength) : undefined;

        const [error, result] = await attemptPromise(() =>
            nameGeneratorApi.generate({
                storyId: context.storyId,
                kind,
                gender,
                region: parsed.region,
                era: parsed.era,
                poolId: parsed.pool,
                count,
                maxLength,
                startsWith: parsed.startsWith
            })
        );

        if (error) {
            logger.error("NameResolver: failed to generate names", error);
            return "[Name Generator error]";
        }
        if (result.names.length === 0) return "[No matching names — try broadening the pool filters]";

        return result.names.map(n => n.name).join(", ");
    }
}
