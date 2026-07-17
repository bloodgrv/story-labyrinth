import { randomUUID } from "node:crypto";
import {
    activatePendingAndSupersede,
    createPendingMemory,
    type CreatePendingParams,
    deleteMemory,
    getMemory,
    insertActiveAndSupersede,
    listMemories,
    type ListMemoriesParams,
    rejectMemory,
    reviseMemory,
    type ReviseMemoryFields,
    setPinned,
    updateActiveMemoryContent
} from "./agentMemoriesRepository.js";
import { indexAgentMemory, removeEntityFromIndex } from "./ragIndexService.js";
import { AGENT_MEMORY_CATEGORIES } from "../../src/types/agentMemory.js";
import type { AgentMemory, AgentMemoryCategory } from "../../src/types/agentMemory.js";

// Sits over agentMemoriesRepository.ts the same way codexService.ts sits over
// codexRepository.ts: the repository is pure DB access, this layer owns the RAG-index side
// effects and validation that make "approve"/"reject"/"delete" actually mean something.

// Plain validator (not a TS assertion function) — assertion signatures can't narrow property-
// access expressions like `params.category`, only bare identifiers, so callers cast explicitly
// after validating instead of relying on narrowing.
const isValidCategory = (category: string): category is AgentMemoryCategory =>
    AGENT_MEMORY_CATEGORIES.includes(category as AgentMemoryCategory);

const validateCategory = (category: string): void => {
    if (!isValidCategory(category))
        throw new Error(`Invalid category '${category}'. Must be one of: ${AGENT_MEMORY_CATEGORIES.join(", ")}`);
};

// Single source of truth for what gets chunked/embedded for this entity type — mirrors
// ragIndexService.ts's buildLorebookEntryText's role.
export const buildMemoryText = (memory: Pick<AgentMemory, "title" | "body">): string =>
    [memory.title, memory.body].filter(Boolean).join("\n\n");

// (Re)index an active/edited memory's ragChunks. Global memories (storyId: null) are never
// indexed — hybridSearch is always story-scoped, so a global memory has nowhere to attach a
// ragChunks.storyId to; it stays visible only via the list/CRUD API, never via search.
export const indexMemory = async (memory: AgentMemory): Promise<{ indexed: boolean; chunks: number }> => {
    if (!memory.storyId) return { indexed: false, chunks: 0 };
    return indexAgentMemory({ memoryId: memory.id, storyId: memory.storyId, text: buildMemoryText(memory) });
};

// Create a distill_memory-sourced pending row. Always status: 'pending' — this is what
// satisfies the design doc's "distill_memory only creates pending rows" acceptance criterion.
export const proposeMemory = async (params: CreatePendingParams): Promise<AgentMemory> => {
    validateCategory(params.category);
    return createPendingMemory(params);
};

export type CreateUserNoteParams = {
    storyId: string | null;
    memoryKey?: string;
    category: string;
    title: string;
    body: string;
    pinned?: boolean;
};

// User-authored notes go active immediately (design doc §4.7 "prefer active for pure user
// notes"). If no memoryKey is supplied, a fresh UUID is generated — most notes have no natural
// stable slug. If the caller (deliberately or not) reuses an existing memoryKey, this still
// goes through the same atomic supersession transition approve uses — "latest wins for a key"
// applies regardless of who created the new row (design doc §4.4).
export const createUserNote = async (params: CreateUserNoteParams): Promise<{ memory: AgentMemory; superseded: AgentMemory | null }> => {
    validateCategory(params.category);
    const { activated, superseded } = insertActiveAndSupersede({
        storyId: params.storyId,
        memoryKey: params.memoryKey?.trim() || randomUUID(),
        category: params.category as AgentMemoryCategory,
        title: params.title,
        body: params.body,
        pinned: params.pinned ?? false,
        createdBy: "user"
    });

    await indexMemory(activated);
    if (superseded) removeEntityFromIndex("agent_memory", superseded.id);

    return { memory: activated, superseded };
};

// Approve: pending -> active (+ supersede whichever row was previously active for the same
// memoryKey, if any), then the index side effects. Throws if the target isn't 'pending'
// (activatePendingAndSupersede's own guard — the route layer also pre-checks for a cleaner
// 400, but this is the real atomicity boundary).
export const approveMemory = async (id: string): Promise<{ memory: AgentMemory; superseded: AgentMemory | null }> => {
    const { activated, superseded } = activatePendingAndSupersede(id);

    await indexMemory(activated);
    // The superseded row persists as history (status only) — only its RAG chunks are removed,
    // it is never deleted.
    if (superseded) removeEntityFromIndex("agent_memory", superseded.id);

    return { memory: activated, superseded };
};

// Reject: pending -> rejected, no index touch (mirrors rejectPendingChange exactly — a rejected
// proposal never had chunks in the first place, since pending memories are never indexed).
export const rejectMemoryChange = async (id: string): Promise<AgentMemory> => {
    const rejected = await rejectMemory(id);
    if (!rejected) throw new Error(`Memory not found or not pending: ${id}`);
    return rejected;
};

// Dispatches a content edit to the right path based on the row's current status. Pending: pure
// draft edit (reviseMemory, never indexes). Active: edit-in-place + re-index (design doc §4.2B
// "on edit of an active memory"). Rejected/superseded: dead ends, no content edits allowed.
const applyContentEdit = async (existing: AgentMemory, id: string, contentFields: ReviseMemoryFields): Promise<AgentMemory> => {
    if (existing.status === "pending") {
        const revised = await reviseMemory(id, contentFields);
        if (!revised) throw new Error(`Memory is no longer pending: ${id}`);
        return revised;
    }
    if (existing.status === "active") {
        const updated = await updateActiveMemoryContent(id, contentFields);
        if (!updated) throw new Error(`Memory is no longer active: ${id}`);
        await indexMemory(updated);
        return updated;
    }
    throw new Error(`Cannot edit content of a '${existing.status}' memory`);
};

// The single entry point the PATCH route calls.
export const patchMemory = async (id: string, fields: ReviseMemoryFields & { pinned?: boolean }): Promise<AgentMemory> => {
    const existing = await getMemory(id);
    if (!existing) throw new Error(`Memory not found: ${id}`);

    if (fields.category !== undefined) validateCategory(fields.category);

    const contentFields: ReviseMemoryFields = {};
    if (fields.title !== undefined) contentFields.title = fields.title;
    if (fields.body !== undefined) contentFields.body = fields.body;
    if (fields.category !== undefined) contentFields.category = fields.category;

    let result = existing;
    if (Object.keys(contentFields).length > 0) result = await applyContentEdit(existing, id, contentFields);

    if (fields.pinned !== undefined) {
        const pinned = await setPinned(id, fields.pinned);
        if (pinned) result = pinned;
    }

    return result;
};

// Delete: any status -> gone, remove index entry if it was active (idempotent — safe even if
// the row was never indexed, e.g. a pending or rejected memory).
export const deleteMemoryAndUnindex = async (id: string): Promise<void> => {
    const existing = await getMemory(id);
    if (!existing) throw new Error(`Memory not found: ${id}`);
    await deleteMemory(id);
    removeEntityFromIndex("agent_memory", id);
};

export { getMemory, listMemories, type ListMemoriesParams };
