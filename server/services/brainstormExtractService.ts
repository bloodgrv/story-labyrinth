import { attempt, attemptPromise } from "@jfdi/attempt";
import type OpenAI from "openai";
import { BRAINSTORM_SLOTS } from "../../src/types/brainstorm.js";
import type { HandoffPacket, OverviewProposalPayload } from "../../src/types/brainstorm.js";
import { buildClientForFeature } from "./aiClientFactory.js";

// Fixes a real reliability gap found live (2026-08-17): Brainstorm's ```overview-proposal /
// ```handoff-packet fences (chatContextService.ts's OVERVIEW_PROPOSAL_INSTRUCTIONS /
// HANDOFF_PACKET_INSTRUCTIONS) are almost never emitted by the model during its normal
// conversational reply, even with "you MUST" imperatives and matching trigger phrases — a "MUST"
// competing against ~15 other fence-format instructions in one system prompt, while the model is
// also trying to write good prose, reliably loses. Verified live: the exact same model reliably
// DOES emit the fence when a follow-up request's only job is to produce it.
//
// This service is that follow-up request, automated: a narrow, single-purpose, non-streaming
// extraction pass over an already-generated Brainstorm reply — mirrors sheetSyncService.ts's
// runLlmExtraction (temperature 0, tightly-scoped system prompt, defensive JSON parsing that
// degrades to empty rather than throwing). It reuses the exact wire format the client-side fence
// parsers already expect (parseOverviewProposals.ts / parseHandoffPackets.ts field names), so the
// existing accept-flow (BrainstormChecklistTray.tsx, ChatInterface.tsx's onOverviewProposal/
// onHandoffPackets) needs zero changes — only who's asked to produce the JSON, and when, changes.
//
// A first version asked for both fence types in ONE call. Live testing caught a real, milder
// recurrence of the exact bias this service exists to fix: across two independent runs on the
// same rich reply (containing both a clear synopsis AND a clear outline/character handoff), the
// model reliably produced the overview-proposal and silently skipped the handoff-packet — the
// same "satisfy the first ask, drop the second" pattern, just with two fence types competing
// instead of fifteen. Splitting into two fully independent calls (below), each with truly only
// one possible fence type to consider, restores the "single job" framing that tested as reliable
// in the first place.

const VALID_NOTE_TYPES = ["idea", "research", "todo", "other"];
const VALID_DESTINATIONS = ["outline", "worldbuilding", "notes", "research"];
const VALID_SEED_CATEGORIES = ["character", "location", "item", "event", "note", "synopsis", "starting scenario", "timeline"];

const buildUserContent = (replyText: string, userMessageText?: string): string =>
    userMessageText
        ? `User's message:\n${userMessageText}\n\nAssistant's reply to extract from:\n${replyText}`
        : `Assistant's reply to extract from:\n${replyText}`;

const OVERVIEW_EXTRACTION_SYSTEM_PROMPT = `You extract a story synopsis or loose idea from a reply already written by a story-brainstorming assistant. This is
your ONLY job — you are not evaluating anything else in the reply. If the reply contains a settled synopsis or a
loose idea/research point worth capturing, emit exactly one fenced JSON block for it. If it doesn't (a question,
a clarification, pure worldbuilding detail with no synopsis/idea to capture), emit nothing at all — an empty
response is a correct, expected answer, not a failure.

To capture the story synopsis:
\`\`\`overview-proposal
{"proposalType": "synopsis", "content": "...", "slotKey": "premise"}
\`\`\`

To capture a loose idea/research point/loose thread instead (not canon — use this OR synopsis, never both):
\`\`\`overview-proposal
{"proposalType": "note", "title": "...", "content": "...", "noteType": "idea", "slotKey": "setting"}
\`\`\`

Rules:
- "slotKey", if the content addresses one of these setup slots, must be one of: ${BRAINSTORM_SLOTS.map(s => s.key).join(", ")} — omit it otherwise.
- "noteType" must be exactly one of: idea, research, todo, other.
- Output ONLY the fenced block above (or nothing) — no prose, no commentary, no restating the reply.`;

const HANDOFF_EXTRACTION_SYSTEM_PROMPT = `You extract hand-off-worthy content from a reply already written by a story-brainstorming assistant — things ready
to send to a specialized desk (an outline/beat structure for Outline, a specific character/location/item worth
developing for World-Building, working material for Notes, a research question for Research). This is your ONLY
job. If the reply contains one or more such things, emit exactly one \`\`\`handoff-packet fence whose "handoffs" is
an array with one entry per item (an outline beat list AND a character AND a location can all be separate entries
in the SAME array). If there's nothing hand-off-worthy (a question, a clarification, nothing concrete yet), emit
nothing at all — an empty response is a correct, expected answer, not a failure.

\`\`\`handoff-packet
{"handoffs": [{"destination": "outline", "summary": "one-line summary", "detail": "longer paste-ready text for that chat"}]}
\`\`\`

Rules, followed exactly:
- Each item's "destination" must be exactly one of: outline, worldbuilding, notes, research.
- A "worldbuilding" item must also include "seedName" (the entry's name) and "seedCategory", exactly one of:
  ${VALID_SEED_CATEGORIES.join(", ")}.
- Every item MUST have all three keys "destination", "summary", "detail" — never substitute a different key name
  (e.g. never "content" in place of "detail").
- If the reply contains an outline/beat list AND one or more characters/locations, emit ALL of them as separate
  items in the SAME "handoffs" array — never only the first one you notice.
- Output ONLY the fence above (or nothing) — no prose, no commentary, no restating the reply.`;

const CORRECTIVE_RETRY_PROMPT = (invalidItemsJson: string) =>
    `The following handoff item(s) you produced are missing required keys or used the wrong key names:\n\n${invalidItemsJson}\n\n` +
    `Reformat EACH of them using exactly these three keys: "destination", "summary", "detail" (plus "seedName"/"seedCategory" ` +
    `only when destination is "worldbuilding"). Output ONLY a \`\`\`handoff-packet fence with a "handoffs" array containing the ` +
    `corrected items, nothing else.`;

const OVERVIEW_FENCE = /```overview-proposal\s*\n([\s\S]*?)```/;
const HANDOFF_FENCE = /```handoff-packet\s*\n([\s\S]*?)```/;

const isValidOverview = (value: Record<string, unknown>): value is OverviewProposalPayload => {
    if (value.proposalType === "synopsis") return typeof value.content === "string";
    if (value.proposalType === "note")
        return typeof value.title === "string" && typeof value.content === "string" && VALID_NOTE_TYPES.includes(value.noteType as string);
    return false;
};

const isValidHandoff = (value: unknown): value is HandoffPacket => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return VALID_DESTINATIONS.includes(record.destination as string) && typeof record.summary === "string" && typeof record.detail === "string";
};

const parseOverview = (raw: string): OverviewProposalPayload | null => {
    const match = raw.match(OVERVIEW_FENCE);
    if (!match) return null;
    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    return isValidOverview(record) ? record : null;
};

// Returns both the valid handoffs and however many raw candidate items were present but failed
// validation (for the corrective retry / non-silent partial-failure reporting) — unlike the
// client-side parseHandoffPackets.ts, which only ever returns the survivors.
const parseHandoffs = (raw: string): { valid: HandoffPacket[]; invalidRaw: unknown[] } => {
    const match = raw.match(HANDOFF_FENCE);
    if (!match) return { valid: [], invalidRaw: [] };
    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { valid: [], invalidRaw: [] };
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.handoffs)) return { valid: [], invalidRaw: [] };

    const valid: HandoffPacket[] = [];
    const invalidRaw: unknown[] = [];
    for (const item of record.handoffs) (isValidHandoff(item) ? valid : invalidRaw).push(item);
    return { valid, invalidRaw };
};

export interface BrainstormExtractResult {
    overview: OverviewProposalPayload | null;
    handoffs: HandoffPacket[];
    droppedCount: number;
}

const runOverviewExtraction = async (client: OpenAI, model: string, userContent: string): Promise<OverviewProposalPayload | null> => {
    const [error, completion] = await attemptPromise(() =>
        client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: OVERVIEW_EXTRACTION_SYSTEM_PROMPT },
                { role: "user", content: userContent }
            ],
            temperature: 0,
            max_tokens: 1024
        })
    );
    if (error) return null;
    return parseOverview(completion.choices[0]?.message?.content ?? "");
};

const runHandoffExtraction = async (
    client: OpenAI,
    model: string,
    userContent: string
): Promise<{ handoffs: HandoffPacket[]; droppedCount: number; callFailed: boolean }> => {
    // Generous budget — "detail" often needs to reproduce a full beat list AND multiple character
    // bios verbatim across several array items, easily 2000+ tokens of content alone. A cap too
    // tight here silently truncates the JSON mid-generation, which then fails to parse and
    // degrades to an empty result indistinguishable from "nothing to hand off" — a real bug found
    // live in testing (droppedCount stayed 0 because parseHandoffs' JSON.parse threw before any
    // per-item validation ever ran, not because items were individually invalid).
    const [error, completion] = await attemptPromise(() =>
        client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: HANDOFF_EXTRACTION_SYSTEM_PROMPT },
                { role: "user", content: userContent }
            ],
            temperature: 0,
            max_tokens: 8192
        })
    );
    if (error) {
        // B16: this used to fail completely silently — indistinguishable client-side from "the
        // model genuinely had nothing to hand off" (its own documented, valid empty-response
        // case, see HANDOFF_EXTRACTION_SYSTEM_PROMPT above). Logging here is what let this get
        // root-caused at all; the callFailed flag on the return value lets the client tell the
        // two cases apart too instead of silently showing an empty Approvals tray either way.
        console.warn("Brainstorm handoff extraction call failed:", error);
        return { handoffs: [], droppedCount: 0, callFailed: true };
    }

    const raw = completion.choices[0]?.message?.content ?? "";
    let { valid: handoffs, invalidRaw } = parseHandoffs(raw);

    // One bounded corrective retry — quote the malformed item(s) back and ask for the exact
    // required keys, rather than silently dropping them (the failure mode found live in testing).
    if (invalidRaw.length > 0) {
        const [retryError, retryCompletion] = await attemptPromise(() =>
            client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: HANDOFF_EXTRACTION_SYSTEM_PROMPT },
                    { role: "user", content: userContent },
                    { role: "assistant", content: raw },
                    { role: "user", content: CORRECTIVE_RETRY_PROMPT(JSON.stringify(invalidRaw)) }
                ],
                temperature: 0,
                max_tokens: 4096
            })
        );
        if (!retryError) {
            const retryResult = parseHandoffs(retryCompletion.choices[0]?.message?.content ?? "");
            handoffs = [...handoffs, ...retryResult.valid];
            invalidRaw = retryResult.invalidRaw;
        }
    }

    // Note: an empty handoffs+invalidRaw result is NOT logged here — it's the model's documented,
    // valid "nothing hand-off-worthy in this reply" case (see the system prompt above) and happens
    // on most ordinary conversational turns, so treating it as a warning would just be noise. The
    // callFailed flag above is what actually distinguishes a real failure from this expected case.
    return { handoffs, droppedCount: invalidRaw.length, callFailed: false };
};

const EMPTY_RESULT: BrainstormExtractResult = { overview: null, handoffs: [], droppedCount: 0, handoffCallFailed: false };

export const extractBrainstormProposals = async (replyText: string, userMessageText?: string): Promise<BrainstormExtractResult> => {
    if (!replyText.trim()) return EMPTY_RESULT;

    const connection = await buildClientForFeature("brainstorm_extract");
    if (!connection) {
        console.warn("Brainstorm proposal extraction skipped: no AI connection configured for feature 'brainstorm_extract'.");
        return EMPTY_RESULT;
    }
    const { client, model } = connection;

    const userContent = buildUserContent(replyText, userMessageText);

    // Two fully independent calls, run in parallel — each with truly only one possible fence type
    // to consider (see the module comment above for why this replaced a single combined call).
    const [overview, handoffResult] = await Promise.all([
        runOverviewExtraction(client, model, userContent),
        runHandoffExtraction(client, model, userContent)
    ]);

    return {
        overview,
        handoffs: handoffResult.handoffs,
        droppedCount: handoffResult.droppedCount,
        handoffCallFailed: handoffResult.callFailed
    };
};
