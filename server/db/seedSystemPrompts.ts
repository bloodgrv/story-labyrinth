import { eq } from "drizzle-orm";
import systemPrompts from "../../src/data/systemPrompts.js";
import type { Prompt } from "../../src/types/story.js";
import { db, schema } from "./client.js";

export const seedSystemPrompts = async () => {
    try {
        // Check if any system prompts already exist
        const existingSystemPrompts = await db.select().from(schema.prompts).where(eq(schema.prompts.isSystem, true));

        if (existingSystemPrompts.length > 0) {
            console.log(`System prompts already exist (${existingSystemPrompts.length} found), skipping seed`);
            return;
        }

        console.log("Seeding system prompts...");

        // Insert all system prompts
        const promptsToInsert = systemPrompts.map((prompt: Partial<Prompt>) => ({
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

        console.log(`Successfully seeded ${promptsToInsert.length} system prompts`);
    } catch (error) {
        console.error("Error seeding system prompts:", error);
        throw error;
    }
};
