import { eq } from "drizzle-orm";
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
