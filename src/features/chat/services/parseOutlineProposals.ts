import { attempt } from "@jfdi/attempt";

// P0.4 R5 — Outline chat's structure-proposal fence. Mirrors parseCodexProposals.ts's shape
// (multiple fences per reply, `g`-flag). "create" is routed straight to an immediate
// status:'pending' outlineItems insert by the caller (ChatInterface.tsx) — the same mechanism the
// retired bulk-Generate button used, so it needs no ephemeral card of its own. "edit"/"reorder"/
// "delete" act on an already-confirmed row, so the caller renders those as an ephemeral
// accept/reject card instead (same posture as prose-proposal/note-proposal).
export interface ParsedOutlineCreateProposal {
    type: "create";
    itemType: "chapter" | "scene";
    // A real outline item id, a `tempId` declared by an earlier "create" in the same reply (see
    // below), or null for a top-level chapter.
    parentId: string | null;
    title: string;
    summary: string | null;
    wordCountTarget: number | null;
    // Optional model-chosen label (e.g. "ch1") a chapter can declare on itself so scene "create"
    // proposals later in the *same reply* can reference it as `parentId` before the real
    // server-generated id exists yet — lets one reply create a chapter and its scenes together
    // instead of forcing one outline change per turn. Resolved client-side in ChatInterface.tsx.
    tempId?: string;
}

export interface ParsedOutlineEditProposal {
    type: "edit";
    itemId: string;
    title?: string;
    summary?: string;
    wordCountTarget?: number | null;
}

export interface ParsedOutlineReorderProposal {
    type: "reorder";
    updates: Array<{ id: string; order: number; parentId?: string }>;
}

export interface ParsedOutlineDeleteProposal {
    type: "delete";
    itemId: string;
}

export type ParsedOutlineProposal =
    | ParsedOutlineCreateProposal
    | ParsedOutlineEditProposal
    | ParsedOutlineReorderProposal
    | ParsedOutlineDeleteProposal;

export interface ParsedOutlineProposals {
    cleanedContent: string;
    proposals: ParsedOutlineProposal[];
}

const OUTLINE_PROPOSAL_FENCE = /```outline-proposal\s*\n([\s\S]*?)```/g;

const isCreate = (v: Record<string, unknown>): boolean =>
    v.type === "create" && (v.itemType === "chapter" || v.itemType === "scene") && typeof v.title === "string";

const isEdit = (v: Record<string, unknown>): boolean => v.type === "edit" && typeof v.itemId === "string";

const isReorder = (v: Record<string, unknown>): boolean => v.type === "reorder" && Array.isArray(v.updates);

const isDelete = (v: Record<string, unknown>): boolean => v.type === "delete" && typeof v.itemId === "string";

const isValidProposal = (value: unknown): value is ParsedOutlineProposal => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return isCreate(record) || isEdit(record) || isReorder(record) || isDelete(record);
};

// Extracts model-emitted ```outline-proposal fenced JSON blocks out of a chat reply, matching the
// wire format documented in server/services/chatContextService.ts's OUTLINE_PROPOSAL_INSTRUCTIONS.
export const parseOutlineProposals = (content: string): ParsedOutlineProposals => {
    const proposals: ParsedOutlineProposal[] = [];

    const cleanedContent = content.replace(OUTLINE_PROPOSAL_FENCE, (_match, jsonBlock: string) => {
        const [error, parsed] = attempt(() => JSON.parse(jsonBlock));
        if (!error && isValidProposal(parsed)) proposals.push(parsed);
        return "";
    });

    return { cleanedContent: cleanedContent.replace(/\n{3,}/g, "\n\n").trim(), proposals };
};
