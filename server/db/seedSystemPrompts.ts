import { and, eq } from "drizzle-orm";
import systemPrompts from "../../src/data/systemPrompts.js";
import type { Prompt } from "../../src/types/story.js";
import { db, schema } from "./client.js";

export const seedSystemPrompts = async () => {
    try {
        // Per-promptType check, not "any system prompt exists at all" — otherwise a promptType
        // added after a user's first run (e.g. "outline", P0.4 R5) would never get seeded into an
        // existing DB, since the old all-or-nothing skip short-circuited before ever looking at
        // which types were actually present.
        const existingSystemPrompts = await db.select().from(schema.prompts).where(eq(schema.prompts.isSystem, true));
        const existingTypes = new Set(existingSystemPrompts.map(p => p.promptType));

        const missing = systemPrompts.filter((prompt: Partial<Prompt>) => !existingTypes.has(prompt.promptType ?? "other"));
        if (missing.length === 0) {
            console.log(`System prompts already exist (${existingSystemPrompts.length} found), nothing new to seed`);
            return;
        }

        console.log(`Seeding ${missing.length} missing system prompt(s)...`);

        const promptsToInsert = missing.map((prompt: Partial<Prompt>) => ({
            id: prompt.id ?? crypto.randomUUID(),
            name: prompt.name ?? "",
            description: prompt.description ?? null,
            promptType: prompt.promptType ?? "other",
            messages: prompt.messages ?? [],
            allowedModels: prompt.allowedModels || [],
            storyId: null,
            isSystem: true,
            createdAt: new Date()
        }));

        await db.insert(schema.prompts).values(promptsToInsert);

        console.log(`Successfully seeded ${promptsToInsert.length} system prompt(s)`);
    } catch (error) {
        console.error("Error seeding system prompts:", error);
        throw error;
    }
};

// P0.4 K-track prerequisite fix — seedSystemPrompts above only ever INSERTS missing promptTypes,
// never updates an existing row's content, so a stale seed (like "research-system"'s pre-S1
// static system message, which never referenced {{codex_context}} and so silently dropped
// RESEARCH_FRAMING/web-search context before it ever reached the model — see DECISIONS.md "P0.4
// K0-K5") stays broken forever on any already-provisioned database. This patches known-stale
// system prompts in place, idempotently: only touches a row if its current content is missing
// the token the fix adds, so re-running on every boot is safe and a no-op once fixed.
const STALE_PROMPT_FIXES: { promptType: string; requiredToken: string }[] = [{ promptType: "research", requiredToken: "{{codex_context}}" }];

export const patchStaleSystemPrompts = async () => {
    for (const { promptType, requiredToken } of STALE_PROMPT_FIXES) {
        const [existing] = await db
            .select()
            .from(schema.prompts)
            .where(and(eq(schema.prompts.isSystem, true), eq(schema.prompts.promptType, promptType)));
        if (!existing) continue; // not seeded yet — seedSystemPrompts will insert the already-correct version

        const currentContent = JSON.stringify(existing.messages ?? "");
        if (currentContent.includes(requiredToken)) continue; // already fixed (or a user has since customized it correctly)

        const correctPrompt = systemPrompts.find((p: Partial<Prompt>) => p.promptType === promptType);
        if (!correctPrompt?.messages) continue;

        await db.update(schema.prompts).set({ messages: correctPrompt.messages }).where(eq(schema.prompts.id, existing.id));
        console.log(`Patched stale system prompt content for promptType "${promptType}" (missing ${requiredToken})`);
    }
};

// Scene Beat Removal (SB7, docs/Scene_Beat_Removal_Design.md) — "scene_beat" is no longer a
// selectable promptType (the feature it backed is gone), but per the design's own "do not
// hard-delete user prompt rows" decision, existing rows (system-seeded or user-authored) are
// recategorized to "other" rather than deleted. Idempotent (the UPDATE only ever matches rows
// still tagged "scene_beat", none after the first successful run) — safe on every boot.
export const migrateSceneBeatPromptType = async () => {
    const result = await db
        .update(schema.prompts)
        .set({ promptType: "other" })
        .where(eq(schema.prompts.promptType, "scene_beat"));
    if (result.changes > 0)
        console.log(`Migrated ${result.changes} prompt row(s) from promptType "scene_beat" to "other" (Scene Beat Removal)`);
};
