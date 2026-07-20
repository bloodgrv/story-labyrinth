import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import type { AgentJob } from "../../../src/types/agentJob.js";
import type { CodexCustomField, CodexState, CodexStateItem } from "../../../src/types/codex.js";
import { buildClientForFeature } from "../aiClientFactory.js";
import { db, schema } from "../../db/client.js";
import { extractTextFromLexical } from "../entityDetector.js";
import { proposeChange } from "../codexService.js";

// suggest_codex_updates (C5, docs/CURRENT_BACKLOG.md P0.3) — "the agent should be compiling
// [Codex state] as we go along, not the user." Scoped deliberately narrow per the backlog's own
// recommendation: manual-trigger only (never auto-chained — see AgentJobType's own comment),
// proposes updates to EXISTING Codex-enabled entries only (no new-entry creation — that's a
// bigger, riskier step than "keep this character's wardrobe/wounds current"), and only touches
// the four concrete-state arrays (wardrobe/appearance/wounds/items) — never customFields (a
// user-defined extension point, not something manuscript text should silently reshape) and never
// description/tags. Every proposal goes through the exact same codexPendingChanges
// approve/reject/edit-first pipeline chat proposals already use, just with sourceType: "ai"
// instead of "chat" (CodexPendingSourceType already had this second value; nothing used it until
// now — see codexRepository.ts/chatCodexService.ts precedent).

const MAX_CHAPTER_CHARS = 12000;
const MAX_CANDIDATES = 8;

type CandidateEntry = {
    id: string;
    name: string;
    category: string;
    codexState: CodexState | null;
};

// Visible Codex-enabled entries for a story (global + this story + this story's series) — same
// level/scopeId scoping precedent as ragScanner.ts's resolveEntityIdsByName.
const listCandidateEntries = async (storyId: string): Promise<CandidateEntry[]> => {
    const [story] = await db.select({ seriesId: schema.stories.seriesId }).from(schema.stories).where(eq(schema.stories.id, storyId));

    const conditions = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story?.seriesId) conditions.push(and(eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId)));

    const rows = await db
        .select({
            id: schema.lorebookEntries.id,
            name: schema.lorebookEntries.name,
            category: schema.lorebookEntries.category,
            codexState: schema.lorebookEntries.codexState,
            codexEnabled: schema.lorebookEntries.codexEnabled
        })
        .from(schema.lorebookEntries)
        .where(or(...conditions));

    return rows
        .filter(r => r.codexEnabled)
        .map(r => ({ id: r.id, name: r.name, category: r.category, codexState: r.codexState as CodexState | null }));
};

// Only entries actually named in the chapter text are worth asking the model about — cheap
// name-substring match, avoiding a full RAG/embedding pass for a job this narrow in scope.
const filterMentioned = (entries: CandidateEntry[], chapterText: string): CandidateEntry[] => {
    const lower = chapterText.toLowerCase();
    return entries.filter(e => e.name.trim() && lower.includes(e.name.toLowerCase())).slice(0, MAX_CANDIDATES);
};

const stateSummary = (state: CodexState | null): Record<string, unknown> => ({
    wardrobe: (state?.wardrobe ?? []).map(i => i.value),
    appearance: (state?.appearance ?? []).map(f => ({ label: f.label, value: f.value })),
    wounds: (state?.wounds ?? []).map(i => i.value),
    items: (state?.items ?? []).map(i => i.value)
});

const SYSTEM_PROMPT = `You are compiling concrete physical/state facts from a fiction chapter into a Codex.
You are given the chapter's text and a numbered list of candidate characters/locations/items, each with
their CURRENT tracked state (wardrobe, physical appearance, wounds/injuries, items carried/held).

For each candidate where the chapter text clearly and concretely changes one or more of these four
categories (e.g. a wardrobe change, a new wound, an item picked up or lost, a described physical change),
propose the FULL UPDATED list for each category that changed — reusing/keeping items that are still true,
adding new ones, removing ones no longer true. Do NOT invent facts not supported by the text. Do NOT
propose a change to a category with no clear textual support — omit that category (leave it out of your
response entirely for that entry) rather than guessing.

If an entry has no genuine concrete state change this chapter, omit it entirely from your response.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "index": number,
  "wardrobe": string[] | null,
  "appearance": [{ "label": string, "value": string }] | null,
  "wounds": string[] | null,
  "items": string[] | null,
  "note": string
}
Use null (not an empty array) for any category that did not change for that entry.`;

type ParsedUpdate = {
    index: number;
    wardrobe: string[] | null;
    appearance: { label: string; value: string }[] | null;
    wounds: string[] | null;
    items: string[] | null;
    note: string;
};

const asStringArray = (raw: unknown): string[] | null => {
    if (!Array.isArray(raw)) return null;
    const values = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return values.length > 0 ? values : null;
};

const asAppearanceArray = (raw: unknown): { label: string; value: string }[] | null => {
    if (!Array.isArray(raw)) return null;
    const values = raw
        .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
        .filter(v => typeof v.value === "string" && (v.value as string).trim().length > 0)
        .map(v => ({ label: typeof v.label === "string" ? v.label : "", value: v.value as string }));
    return values.length > 0 ? values : null;
};

const parseUpdates = (raw: string): ParsedUpdate[] => {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    let parsed: unknown[];
    try {
        parsed = JSON.parse(match[0]) as unknown[];
    } catch {
        return [];
    }

    return parsed
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .filter(e => typeof e.index === "number")
        .map(e => ({
            index: e.index as number,
            wardrobe: asStringArray(e.wardrobe),
            appearance: asAppearanceArray(e.appearance),
            wounds: asStringArray(e.wounds),
            items: asStringArray(e.items),
            note: typeof e.note === "string" ? e.note : ""
        }))
        .filter(u => u.wardrobe || u.appearance || u.wounds || u.items);
};

const toStateItems = (values: string[]): CodexStateItem[] => values.map(value => ({ id: randomUUID(), value }));
const toCustomFields = (values: { label: string; value: string }[]): CodexCustomField[] =>
    values.map(v => ({ key: randomUUID(), label: v.label, value: v.value }));

// Merges a parsed update into the entry's current state — categories the model left null keep
// their current values untouched; customFields is never touched by this job (see file header).
const mergeState = (current: CodexState | null, update: ParsedUpdate): CodexState => ({
    wardrobe: update.wardrobe ? toStateItems(update.wardrobe) : (current?.wardrobe ?? []),
    appearance: update.appearance ? toCustomFields(update.appearance) : (current?.appearance ?? []),
    wounds: update.wounds ? toStateItems(update.wounds) : (current?.wounds ?? []),
    items: update.items ? toStateItems(update.items) : (current?.items ?? []),
    customFields: current?.customFields ?? []
});

export const runSuggestCodexUpdatesJob = async (job: AgentJob): Promise<{ chapterId: string; proposedCount: number }> => {
    if (!job.storyId) throw new Error("suggest_codex_updates job requires storyId");
    if (!job.entityId) throw new Error("suggest_codex_updates job requires entityId (chapterId)");
    const storyId = job.storyId;
    const chapterId = job.entityId;

    const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const chapterText = extractTextFromLexical(chapter.content);
    if (!chapterText.trim()) return { chapterId, proposedCount: 0 };

    const allCandidates = await listCandidateEntries(storyId);
    const candidates = filterMentioned(allCandidates, chapterText);
    if (candidates.length === 0) return { chapterId, proposedCount: 0 };

    const connection = await buildClientForFeature("codex_compile");
    if (!connection)
        throw new Error(
            "No AI provider configured for Codex Auto-Compile. Set a global default or a 'Codex Auto-Compile' feature endpoint in AI Settings."
        );
    const { client, model } = connection;

    const candidatesBlock = candidates
        .map((c, i) => `[${i}] Name: ${c.name} (${c.category})\nCurrent state: ${JSON.stringify(stateSummary(c.codexState))}`)
        .join("\n\n");

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content:
                    `=== CHAPTER TEXT ===\n${chapterText.slice(0, MAX_CHAPTER_CHARS)}\n\n` +
                    `=== CANDIDATE CODEX ENTRIES ===\n${candidatesBlock}`
            }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const updates = parseUpdates(raw);

    let proposedCount = 0;
    const sourceRef = `job:${job.id}:chapter:${chapterId}`;
    for (const update of updates) {
        const candidate = candidates[update.index];
        if (!candidate) continue; // model hallucinated an out-of-range index — skip, don't throw

        const proposedState = mergeState(candidate.codexState, update);
        await proposeChange(candidate.id, { proposedState }, "ai", sourceRef);
        proposedCount++;
    }

    return { chapterId, proposedCount };
};
