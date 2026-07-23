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

// Picks the best available brief for a "map" preset generation, per the design doc's fallback
// chain (imageBrief > layoutMd > landmarks > plain description).
const resolveMapPrompt = (entry: typeof schema.lorebookEntries.$inferSelect): string => {
    const placeState = (entry.metadata as { placeState?: { imageBrief?: string; layoutMd?: string; landmarks?: string[] } } | null)
        ?.placeState;
    const brief = placeState?.imageBrief || placeState?.layoutMd || placeState?.landmarks?.join(", ") || entry.description;
    return MAP_IMAGE_PROMPT_PREFIX + brief;
};

// xAI's image generation is a real, separate endpoint from chat completions -
// POST {baseURL}/images/generations, confirmed against xAI's own docs (not assumed from the
// chat-completions shape) since this hits a real billed API. Not exposed through the `openai`
// npm SDK's typed images.generate() (that's shaped around OpenAI's own `size` param; xAI uses
// aspect_ratio/resolution instead), so this does a raw fetch reusing the same resolved
// baseURL/apiKey/model buildClientForFeature already produces for every other feature.
export const generateLorebookImage = async (entryId: string, preset: "mood" | "map" = "mood"): Promise<void> => {
    const [entry] = await db.select().from(schema.lorebookEntries).where(eq(schema.lorebookEntries.id, entryId));
    if (!entry) throw new Error(`Lorebook entry not found: ${entryId}`);
    if (!entry.description.trim()) throw new Error("This entry has no description to generate an image from.");

    const connection = await buildClientForFeature("image_generation");
    if (!connection)
        throw new Error(
            "No AI provider configured. Set up a model in AI Settings (Feature Endpoints → Image Generation) before generating an image."
        );
    const { client, model } = connection;

    const prompt = preset === "map" ? resolveMapPrompt(entry) : entry.description;

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
