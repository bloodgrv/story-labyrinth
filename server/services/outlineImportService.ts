import { randomUUID } from "node:crypto";
import type { DraftChapter, DraftScene, ImportArcNotePayload, ImportCastPayload } from "../../src/types/outlineImport.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { extractTextFromFile } from "./documentImportService.js";

export { extractTextFromFile };

export type OutlineRichPacket =
    | { kind: "import_cast"; payload: ImportCastPayload }
    | { kind: "import_arc_note"; payload: ImportArcNotePayload };

export type OutlineImportResult = {
    structureDraft: DraftChapter[];
    richPackets: OutlineRichPacket[];
};

const MAX_CHAPTERS = 200;
const MAX_SCENES_PER_CHAPTER = 100;

const newChapter = (title: string): DraftChapter => ({
    tempId: randomUUID(),
    title: title.trim() || "Untitled Chapter",
    summary: null,
    wordCountTarget: null,
    scenes: []
});

const newScene = (title: string): DraftScene => ({
    tempId: randomUUID(),
    title: title.trim() || "Untitled Scene",
    summary: null,
    wordCountTarget: null
});

const appendSummaryLine = (current: string | null, line: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed) return current;
    return current ? `${current}\n${trimmed}` : trimmed;
};

// Deterministic structure parse: recognizes markdown headings (# / ##  = chapter, ### -######  =
// scene) and plain "Chapter N[: Title]" / "Scene N[: Title]" lines (case-insensitive) as an
// alternative to markdown, since plain-text/PDF-extracted outlines rarely carry heading syntax.
// Any heading depth deeper than scene, or any non-heading text between headings, collapses into
// the nearest open node's `summary` per design lock #9. Returns null when the document doesn't
// look outline-shaped at all (fewer than 2 recognized chapter-level headers) — caller falls back
// to the LLM-normalize path.
const CHAPTER_HEADING = /^#{1,2}\s+(.+)$/;
const SCENE_HEADING = /^#{3,6}\s+(.+)$/;
const CHAPTER_PLAIN = /^chapter\s+\d+\s*[:.\-–]?\s*(.*)$/i;
const SCENE_PLAIN = /^scene\s+\d+\s*[:.\-–]?\s*(.*)$/i;

export const parseDeterministicStructure = (text: string): DraftChapter[] | null => {
    const lines = text.split(/\r?\n/);
    const chapters: DraftChapter[] = [];
    let currentChapter: DraftChapter | null = null;
    let currentScene: DraftScene | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const chapterMatch = line.match(CHAPTER_HEADING) ?? line.match(CHAPTER_PLAIN);
        if (chapterMatch) {
            if (chapters.length >= MAX_CHAPTERS) continue;
            currentChapter = newChapter(chapterMatch[1] || line);
            currentScene = null;
            chapters.push(currentChapter);
            continue;
        }

        const sceneMatch = line.match(SCENE_HEADING) ?? line.match(SCENE_PLAIN);
        if (sceneMatch && currentChapter) {
            if (currentChapter.scenes.length >= MAX_SCENES_PER_CHAPTER) continue;
            currentScene = newScene(sceneMatch[1] || line);
            currentChapter.scenes.push(currentScene);
            continue;
        }

        // Non-heading text: collapse into whichever node is currently open (design lock #9).
        if (currentScene) {
            currentScene.summary = appendSummaryLine(currentScene.summary, line);
        } else if (currentChapter) {
            currentChapter.summary = appendSummaryLine(currentChapter.summary, line);
        }
    }

    // Require at least 2 recognized chapter-level headers before trusting this as "already
    // outline-shaped" — a single heading is too weak a signal and risks silently swallowing an
    // unstructured document's first line as a lone "chapter."
    if (chapters.length < 2) return null;
    return chapters;
};

const OUTLINE_IMPORT_SYSTEM_PROMPT = `You are normalizing a story structure/outline document into a fixed 2-level chapter->scene JSON shape for a fiction-writing app.

Read the document and return ONLY a single valid JSON object, no prose, no markdown fences, shaped exactly like:
{
  "chapters": [
    {
      "title": string,
      "summary": string | null,
      "wordCountTarget": number | null,
      "scenes": [
        { "title": string, "summary": string | null, "wordCountTarget": number | null }
      ]
    }
  ],
  "castMentions": [{ "name": string, "context": string }],
  "arcNotes": [{ "subject": string, "text": string }]
}

Rules:
- Collapse any deeper structure (acts, parts, sub-beats) into the nearest chapter or scene's "summary" — only 2 levels exist in the output (chapter, scene).
- "summary" is a short prose synopsis of what happens, drawn from the document's own text. null if nothing to summarize.
- "wordCountTarget" only if the document explicitly states a length goal for that chapter/scene; otherwise null.
- If the document has no scene-level breakdown, return each chapter with an empty "scenes" array — do not invent scenes.
- "castMentions": named characters the document calls out with meaningful context (role, description, relationships) — not just any proper noun. "context" is a short excerpt/summary of what's said about them. Empty array if none.
- "arcNotes": character development/arc observations tied to a specific subject that don't belong in a chapter/scene summary. Empty array if none.
- If the document isn't outline-shaped at all (e.g. prose synopsis with no chapter breaks), do your best to infer a reasonable chapter breakdown from its structure/paragraphs rather than returning an empty list.`;

const asString = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const toDraftScene = (raw: unknown): DraftScene | null => {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const title = asString(r.title);
    if (!title) return null;
    return { tempId: randomUUID(), title, summary: asString(r.summary), wordCountTarget: asNumber(r.wordCountTarget) };
};

const toDraftChapter = (raw: unknown): DraftChapter | null => {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const title = asString(r.title);
    if (!title) return null;
    const scenes = Array.isArray(r.scenes)
        ? r.scenes.map(toDraftScene).filter((s): s is DraftScene => s !== null).slice(0, MAX_SCENES_PER_CHAPTER)
        : [];
    return { tempId: randomUUID(), title, summary: asString(r.summary), wordCountTarget: asNumber(r.wordCountTarget), scenes };
};

const toCastPacket = (raw: unknown): OutlineRichPacket | null => {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const name = asString(r.name);
    if (!name) return null;
    return { kind: "import_cast", payload: { name, context: asString(r.context) ?? "" } };
};

const toArcNotePacket = (raw: unknown): OutlineRichPacket | null => {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const text = asString(r.text);
    if (!text) return null;
    return { kind: "import_arc_note", payload: { subject: asString(r.subject) ?? "Unknown", text } };
};

// LLM-normalize path: called when the deterministic parse above didn't find a clean structure, or
// as a cleanup pass. Mirrors documentImportService.ts's extractEntryFromText pattern exactly
// (feature-key client, text-truncate, regex JSON-block extraction, tolerant type-guard normalize).
const normalizeWithLlm = async (text: string): Promise<OutlineImportResult> => {
    const connection = await buildClientForFeature("outline_import");
    if (!connection)
        throw new Error(
            "No AI provider configured. Set up a model in AI Settings (Feature Endpoints → Outline Import) before importing this document."
        );
    const { client, model } = connection;

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: OUTLINE_IMPORT_SYSTEM_PROMPT },
            { role: "user", content: text.slice(0, 20000) }
        ],
        temperature: 0,
        max_tokens: 4096
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

    const r = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
    const structureDraft = Array.isArray(r.chapters)
        ? r.chapters.map(toDraftChapter).filter((c): c is DraftChapter => c !== null).slice(0, MAX_CHAPTERS)
        : [];
    const castPackets = Array.isArray(r.castMentions) ? r.castMentions.map(toCastPacket).filter((p): p is OutlineRichPacket => p !== null) : [];
    const arcPackets = Array.isArray(r.arcNotes) ? r.arcNotes.map(toArcNotePacket).filter((p): p is OutlineRichPacket => p !== null) : [];

    if (structureDraft.length === 0) throw new Error("The model didn't find any chapters in this document. Try a different file.");

    return { structureDraft, richPackets: [...castPackets, ...arcPackets] };
};

// Main entry point: uploaded file bytes -> plain text -> hybrid structure extraction (design
// lock #1). Deterministic parse first (no AI call, no provider dependency); falls back to
// LLM-normalize only when the document doesn't already look outline-shaped. The deterministic
// path never produces rich packets (cast/arc-note detection requires the LLM pass) — this is a
// deliberate v1 narrowing, not a bug: a clean markdown outline has nothing "hidden" in it worth
// surfacing to the tray.
export const importOutlineFromDocument = async (buffer: Buffer, filename: string): Promise<OutlineImportResult> => {
    const text = await extractTextFromFile(buffer, filename);
    if (!text.trim()) throw new Error("No extractable text found in this file.");

    const deterministic = parseDeterministicStructure(text);
    if (deterministic) return { structureDraft: deterministic, richPackets: [] };

    return normalizeWithLlm(text);
};
