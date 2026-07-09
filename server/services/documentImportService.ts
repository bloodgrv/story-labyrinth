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
                const result = await parser.getText();
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
const toDraft = (raw: unknown): DocumentImportDraft => {
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
        }
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
- "description" is prose only: personality, backstory, temperament, relationships, narrative context. Do NOT put physical/wardrobe details here.
- "wardrobe": current clothing/outfit pieces, one per array entry (e.g. "shredded black oversized sweater"). Empty array if none described.
- "appearance": physical/body/facial features, one per array entry (e.g. "jet-black asymmetrical bob"). Empty array if none described.
- "wounds": scars, injuries, physical marks, one per array entry. Empty array if none described.
- "items": inventory/possessions/carried objects, one per array entry. Empty array if none described.
- "customFields": short discrete attributes that don't fit the arrays above (Age, Role, Occupation, Aesthetic, Education, etc.) as {"label","value"} pairs. Empty array if none found.
- If the document is not primarily about one character/location/item, pick the single most central subject.
- If you cannot find a clear name, use "Untitled Entry".`;

// Call the LLM to extract a structured entry draft from plain document text.
const extractEntryFromText = async (text: string): Promise<DocumentImportDraft> => {
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

    return toDraft(parsed);
};

// Main entry point: uploaded file bytes -> plain text -> AI-extracted draft entry. Not
// persisted here — the caller (route) returns the draft for the user to review/edit in the
// normal entry-creation UI before it's actually saved.
export const importEntryFromDocument = async (buffer: Buffer, filename: string): Promise<DocumentImportDraft> => {
    const text = await extractTextFromFile(buffer, filename);
    if (!text.trim()) throw new Error("No extractable text found in this file.");
    return extractEntryFromText(text);
};
