import { randomUUID } from "node:crypto";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { CodexCustomField, CodexState, CodexStateItem } from "../../src/types/codex.js";
import type { LorebookEntry } from "../../src/types/story.js";
import { buildClientForFeature } from "./aiClientFactory.js";

export type DocumentImportDraft = {
    name: string;
    category: LorebookEntry["category"];
    description: string;
    tags: string[];
    codexState: CodexState;
    // The largest embedded image found in the source document (PDF/DOCX; md/txt never have
    // one), as a data URL the client can turn into a File for the entry's existing image-upload
    // flow. null when the document had no usable embedded image.
    image: { dataUrl: string; filename: string } | null;
};

const VALID_CATEGORIES: LorebookEntry["category"][] = [
    "character",
    "location",
    "item",
    "event",
    "note",
    "synopsis",
    "starting scenario",
    "timeline"
];

// Extract plain text from an uploaded reference document, by extension. Mirrors
// entityDetector.ts's extractTextFromLexical in spirit — normalize to plain text once, then
// hand off to the same "prompt an LLM for structured JSON" pipeline every AI-extraction
// feature in this codebase uses.
export const extractTextFromFile = async (buffer: Buffer, filename: string): Promise<string> => {
    const ext = filename.toLowerCase().split(".").pop();
    switch (ext) {
        case "pdf": {
            const parser = new PDFParse({ data: buffer });
            try {
                // pdf-parse defaults pageJoiner to "\n-- page_number of total_number --" when
                // omitted, inserting literal "-- 1 of 3 --" style markers between every page's
                // text. Passing an explicit empty string sticks (it only falls back on
                // null/undefined, not falsy values) and disables the marker, joining pages with
                // a plain blank line instead — otherwise that marker text flows straight into
                // the LLM prompt and can get echoed verbatim into the extracted description.
                const result = await parser.getText({ pageJoiner: "" });
                return result.text;
            } finally {
                await parser.destroy();
            }
        }
        case "docx": {
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        }
        case "md":
        case "txt":
            return buffer.toString("utf-8");
        default:
            throw new Error(`Unsupported file type: .${ext}. Supported: .pdf, .docx, .md, .txt`);
    }
};

// Pull the first embedded image out of a DOCX, if any. mammoth's `convertToHtml` is only used
// here for its image-callback side effect — the generated HTML itself is discarded, since
// extractTextFromFile above already extracts the plain text via extractRawText separately.
const extractImageFromDocx = async (buffer: Buffer): Promise<{ dataUrl: string; filename: string } | null> => {
    let found: { dataUrl: string; filename: string } | null = null;
    await mammoth.convertToHtml(
        { buffer },
        {
            convertImage: mammoth.images.imgElement(async image => {
                if (!found) {
                    const base64 = await image.read("base64");
                    const ext = image.contentType?.split("/")[1]?.split("+")[0] || "png";
                    found = { dataUrl: `data:${image.contentType};base64,${base64}`, filename: `imported-image.${ext}` };
                }
                return { src: "" };
            })
        }
    );
    return found;
};

// Pull the largest embedded image out of a PDF, if any — "largest by pixel area" rather than
// "first found" so a small decorative icon/logo earlier in the document doesn't win over the
// actual character/reference photo. Uses pdf-parse's own getImage() (backed by the `canvas`
// package for rasterizing) rather than a page screenshot, so it only picks up genuinely embedded
// images, not a render of the whole page. A separate PDFParse instance/parse pass from
// extractTextFromFile's — reused/shared parsing would save a bit of work but isn't worth the
// coupling for a low-frequency, user-initiated action.
const extractImageFromPdf = async (buffer: Buffer): Promise<{ dataUrl: string; filename: string } | null> => {
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getImage();
        const images = result.pages.flatMap(page => page.images).filter(image => !!image.dataUrl);
        const best = images.reduce<(typeof images)[number] | null>(
            (largest, image) => (!largest || image.width * image.height > largest.width * largest.height ? image : largest),
            null
        );
        return best ? { dataUrl: best.dataUrl, filename: "imported-image.png" } : null;
    } finally {
        await parser.destroy();
    }
};

const extractImageFromFile = async (
    buffer: Buffer,
    filename: string
): Promise<{ dataUrl: string; filename: string } | null> => {
    const ext = filename.toLowerCase().split(".").pop();
    if (ext === "docx") return extractImageFromDocx(buffer);
    if (ext === "pdf") return extractImageFromPdf(buffer);
    return null;
};

const slugifyKey = (label: string): string =>
    label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || randomUUID();

const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map(x => x.trim()) : [];

const toStateItems = (v: unknown): CodexStateItem[] => asStringArray(v).map(value => ({ id: randomUUID(), value }));

const toCustomFields = (v: unknown): CodexCustomField[] => {
    if (!Array.isArray(v)) return [];
    return v
        .filter((f): f is { label: string; value: string } => {
            if (typeof f !== "object" || f === null) return false;
            const field = f as Record<string, unknown>;
            return (
                typeof field.label === "string" &&
                field.label.trim().length > 0 &&
                typeof field.value === "string" &&
                field.value.trim().length > 0
            );
        })
        .map(f => ({ key: slugifyKey(f.label), label: f.label.trim(), value: f.value.trim() }));
};

// Normalize the LLM's raw JSON into DocumentImportDraft — same "type-guard filter, don't throw
// on individual bad fields" tolerance as entityDetector.ts/beatDetector.ts.
const toDraft = (raw: unknown, image: { dataUrl: string; filename: string } | null): DocumentImportDraft => {
    if (typeof raw !== "object" || raw === null) throw new Error("Unexpected extraction result shape");
    const r = raw as Record<string, unknown>;

    const category = VALID_CATEGORIES.includes(r.category as LorebookEntry["category"])
        ? (r.category as LorebookEntry["category"])
        : "character";

    return {
        name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Untitled Entry",
        category,
        description: typeof r.description === "string" ? r.description.trim() : "",
        tags: asStringArray(r.tags),
        codexState: {
            wardrobe: toStateItems(r.wardrobe),
            appearance: toStateItems(r.appearance),
            wounds: toStateItems(r.wounds),
            items: toStateItems(r.items),
            customFields: toCustomFields(r.customFields)
        },
        image
    };
};

const DOCUMENT_IMPORT_SYSTEM_PROMPT = `You are extracting a structured Lorebook entry from a character/world reference document for a fiction-writing app.

Read the document and return ONLY a single valid JSON object, no prose, no markdown fences, shaped exactly like:
{
  "name": string,
  "category": "character"|"location"|"item"|"event"|"note"|"synopsis"|"starting scenario"|"timeline",
  "description": string,
  "tags": string[],
  "wardrobe": string[],
  "appearance": string[],
  "wounds": string[],
  "items": string[],
  "customFields": [{"label": string, "value": string}]
}

Rules:
- "description" is the full narrative profile in flowing prose, written as continuous paragraphs (not bullet lists): personality, backstory, temperament, relationships, physical appearance, narrative context — everything the document says about this subject. Physical/wardrobe details belong here too, not just in the structured fields below — do not omit or strip them from the description just because they're also captured in wardrobe/appearance/wounds/items.
- "wardrobe": current clothing/outfit pieces, one per array entry (e.g. "shredded black oversized sweater"). Empty array if none described.
- "appearance": physical/body/facial features, one per array entry (e.g. "jet-black asymmetrical bob"). Empty array if none described.
- "wounds": scars, injuries, physical marks, one per array entry. Empty array if none described.
- "items": inventory/possessions/carried objects, one per array entry. Empty array if none described.
- "customFields": short discrete attributes that don't fit the arrays above (Age, Role, Occupation, Aesthetic, Education, etc.) as {"label","value"} pairs. Empty array if none found.
- If the document is not primarily about one character/location/item, pick the single most central subject.
- If you cannot find a clear name, use "Untitled Entry".`;

// Call the LLM to extract a structured entry draft from plain document text.
const extractEntryFromText = async (
    text: string,
    image: { dataUrl: string; filename: string } | null
): Promise<DocumentImportDraft> => {
    const connection = await buildClientForFeature("document_import");
    if (!connection)
        throw new Error(
            "No AI provider configured. Set up a model in AI Settings (Feature Endpoints → Document Import) before importing a document."
        );
    const { client, model } = connection;

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: DOCUMENT_IMPORT_SYSTEM_PROMPT },
            { role: "user", content: text.slice(0, 20000) }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The model did not return a parseable result. Try again or use a different model.");

    let parsed: unknown;
    try {
        parsed = JSON.parse(match[0]);
    } catch {
        throw new Error("The model's response wasn't valid JSON. Try again or use a different model.");
    }

    return toDraft(parsed, image);
};

// Main entry point: uploaded file bytes -> plain text (+ embedded image, DOCX only) -> AI-
// extracted draft entry. Not persisted here — the caller (route) returns the draft for the user
// to review/edit in the normal entry-creation UI before it's actually saved.
export const importEntryFromDocument = async (buffer: Buffer, filename: string): Promise<DocumentImportDraft> => {
    const [text, image] = await Promise.all([extractTextFromFile(buffer, filename), extractImageFromFile(buffer, filename)]);
    if (!text.trim()) throw new Error("No extractable text found in this file.");
    return extractEntryFromText(text, image);
};
