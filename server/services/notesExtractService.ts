import { attempt, attemptPromise } from "@jfdi/attempt";
import { buildClientForFeature } from "./aiClientFactory.js";

// Reliability fix, same root cause as brainstormExtractService.ts (see that file's own comment):
// the Notes chat's NOTE_PROPOSAL_INSTRUCTIONS/NOTE_SPLIT_PROPOSAL_INSTRUCTIONS
// (chatContextService.ts) are phrased as a soft "you may propose..." rather than Brainstorm's hard
// "the instant X you MUST" trigger, and even that hard version wasn't reliable enough on its own —
// which is exactly why the extraction-pass pattern exists at all. This gap bites hardest right
// where the Brainstorm/other-desk "handoff → notes" flow lands: the handoff seeds the Notes chat
// composer with paste-ready material (useBrainstormChecklistActions.ts's handleOpenHandoff), the
// user sends it, and the model — treating it as just another user message — often replies
// conversationally without ever proposing a Note, so nothing is ever created (found live,
// 2026-08-23). This is that same isolated, single-purpose, non-streaming follow-up call, scoped to
// Notes' own two fence types.

export interface ParsedNoteExtraction {
    title: string;
    content: string;
    type: "idea" | "research" | "todo" | "other";
}

export interface ParsedNoteSplitExtraction {
    notes: ParsedNoteExtraction[];
}

export interface NotesExtractResult {
    note: ParsedNoteExtraction | null;
    split: ParsedNoteSplitExtraction | null;
    callFailed: boolean;
}

const VALID_NOTE_TYPES = ["idea", "research", "todo", "other"];

const buildUserContent = (replyText: string, userMessageText?: string): string =>
    userMessageText
        ? `User's message:\n${userMessageText}\n\nAssistant's reply to extract from:\n${replyText}`
        : `Assistant's reply to extract from:\n${replyText}`;

const NOTES_EXTRACTION_SYSTEM_PROMPT = `You extract Story Note(s) worth saving from a reply already written by a working-material ("Notes")
assistant for a fiction project. This is your ONLY job — you are not evaluating anything else in the reply. If the
reply (or the user's message it's replying to) contains working material worth capturing as a Story Note, emit
exactly one fenced block for it. If it doesn't (a question, small talk, nothing concrete to save), emit nothing at
all — an empty response is a correct, expected answer, not a failure.

To capture ONE note:
\`\`\`note-proposal
{"title": "...", "content": "...", "type": "idea"}
\`\`\`

To split a larger block of pasted/described material into SEVERAL separate notes instead (use this OR the single
form above, never both):
\`\`\`note-split-proposal
{"notes": [{"title": "...", "content": "...", "type": "idea"}, {"title": "...", "content": "...", "type": "research"}]}
\`\`\`

Rules:
- "type"/each note's "type" must be exactly one of: idea, research, todo, other.
- Output ONLY the fenced block above (or nothing) — no prose, no commentary, no restating the reply.`;

const NOTE_FENCE = /```note-proposal\s*\n([\s\S]*?)```/;
const NOTE_SPLIT_FENCE = /```note-split-proposal\s*\n([\s\S]*?)```/;

const isValidNote = (value: unknown): value is ParsedNoteExtraction => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return typeof record.title === "string" && typeof record.content === "string" && VALID_NOTE_TYPES.includes(record.type as string);
};

const parseNote = (raw: string): ParsedNoteExtraction | null => {
    const match = raw.match(NOTE_FENCE);
    if (!match) return null;
    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error) return null;
    return isValidNote(parsed) ? parsed : null;
};

const parseNoteSplit = (raw: string): ParsedNoteSplitExtraction | null => {
    const match = raw.match(NOTE_SPLIT_FENCE);
    if (!match) return null;
    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.notes)) return null;
    const notes = record.notes.filter(isValidNote);
    return notes.length > 0 ? { notes } : null;
};

const EMPTY_RESULT: NotesExtractResult = { note: null, split: null, callFailed: false };

export const extractNoteProposal = async (replyText: string, userMessageText?: string): Promise<NotesExtractResult> => {
    if (!replyText.trim()) return EMPTY_RESULT;

    const connection = await buildClientForFeature("notes_extract");
    if (!connection) {
        console.warn("Notes proposal extraction skipped: no AI connection configured for feature 'notes_extract'.");
        return EMPTY_RESULT;
    }
    const { client, model } = connection;

    const [error, completion] = await attemptPromise(() =>
        client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: NOTES_EXTRACTION_SYSTEM_PROMPT },
                { role: "user", content: buildUserContent(replyText, userMessageText) }
            ],
            temperature: 0,
            max_tokens: 4096
        })
    );
    if (error) {
        console.warn("Notes proposal extraction call failed:", error);
        return { note: null, split: null, callFailed: true };
    }

    const raw = completion.choices[0]?.message?.content ?? "";
    return { note: parseNote(raw), split: parseNoteSplit(raw), callFailed: false };
};
