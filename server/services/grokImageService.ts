import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { deleteLorebookImage, saveLorebookImage, sniffImageMimetype } from "./lorebookImageStorage.js";

// L2, docs/Locations_And_Maps_Design.md — dedicated top-down/ink-map framing, prefixed onto
// whatever brief text is available. Illustration only, never SoT — layoutMd/the future Story Map
// graph stay the map's real source of truth regardless of what gets generated here.
const MAP_IMAGE_PROMPT_PREFIX =
    "Top-down map illustration, simple ink linework, clear labeled landmarks, no photorealism, " +
    "no perspective/establishing-shot framing. Depict: ";

// xAI's image generation is a real, separate endpoint from chat completions -
// POST {baseURL}/images/generations, confirmed against xAI's own docs (not assumed from the
// chat-completions shape) since this hits a real billed API. Not exposed through the `openai`
// npm SDK's typed images.generate() (that's shaped around OpenAI's own `size` param; xAI uses
// aspect_ratio/resolution instead), so this does a raw fetch reusing the same resolved
// baseURL/apiKey/model buildClientForFeature already produces for every other feature.
// 2026-08-31 fix — used to always re-read the entry's own saved `description` column here,
// ignoring whatever the caller actually has on screen. Since T5 made the Lore Sheet the primary
// authored surface (description is now a derived projection, only updated via the separate Sync
// propose→Accept loop), that meant a generated image could reflect neither unsaved edits nor the
// sheet content the user was actually looking at. `promptText` is now resolved client-side, from
// the form's live (possibly unsaved) values — see entryFormUtils.ts's resolveImageGenerationBrief,
// the client-side mirror of what the old resolveMapPrompt fallback chain did against a DB row.
export const generateLorebookImage = async (entryId: string, preset: "mood" | "map", promptText: string): Promise<void> => {
    const [entry] = await db.select().from(schema.lorebookEntries).where(eq(schema.lorebookEntries.id, entryId));
    if (!entry) throw new Error(`Lorebook entry not found: ${entryId}`);
    const brief = promptText.trim();
    if (!brief) throw new Error("This entry has no description or lore sheet content to generate an image from.");

    const connection = await buildClientForFeature("image_generation");
    if (!connection)
        throw new Error(
            "No AI provider configured. Set up a model in AI Settings (Feature Endpoints → Image Generation) before generating an image."
        );
    const { client, model } = connection;

    const prompt = preset === "map" ? MAP_IMAGE_PROMPT_PREFIX + brief : brief;

    const response = await fetch(`${client.baseURL}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${client.apiKey}` },
        body: JSON.stringify({ model, prompt, response_format: "b64_json" })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Image generation failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const body = (await response.json()) as { data?: { b64_json?: string }[] };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generation response did not include image data.");

    const buffer = Buffer.from(b64, "base64");
    const mimetype = sniffImageMimetype(buffer);
    if (!mimetype) throw new Error("Generated image was not a recognized format.");

    const filename = await saveLorebookImage(buffer, mimetype);
    if (entry.imageFilename) await deleteLorebookImage(entry.imageFilename);

    await db.update(schema.lorebookEntries).set({ imageFilename: filename }).where(eq(schema.lorebookEntries.id, entryId));
};
