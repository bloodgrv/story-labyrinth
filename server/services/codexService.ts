import { attemptPromise } from "@jfdi/attempt";
import type { InferSelectModel } from "drizzle-orm";
import type { schema } from "../db/client.js";
import type { CodexPendingChange, CodexPendingSourceType, CodexSnapshot, CodexSourceType, CodexState } from "../../src/types/codex.js";
import type { LorebookEntry } from "../../src/types/story.js";
import { indexLorebookEntry } from "./ragIndexService.js";
import {
    createPendingChange,
    createSnapshot,
    getCodexEntry,
    getPendingChangeById,
    insertCodexEntry,
    resolvePendingChange,
    updateCodexEntryFields,
    type UpdateCodexEntryFields
} from "./codexRepository.js";

type LorebookRow = InferSelectModel<typeof schema.lorebookEntries>;

// ── Parameter types ────────────────────────────────────────────────────────────

export type NewCodexEntryParams = {
    level: LorebookEntry["level"];
    scopeId?: string | null;
    name: string;
    description: string;
    category: LorebookEntry["category"];
    tags?: string[];
    needsFleshingOut?: boolean;
    sourceType: CodexSourceType;
    sourceRef?: string | null;
};

export type StateChangeFields = {
    description?: string;
    codexState?: CodexState;
    tags?: string[];
    needsFleshingOut?: boolean;
};

export type ChangeProposal = {
    proposedDescription?: string;
    proposedState?: CodexState;
    proposedTags?: string[];
    proposedNeedsFleshingOut?: boolean;
};

// ── Private helpers ────────────────────────────────────────────────────────────

const getOrThrow = async (id: string): Promise<LorebookRow> => {
    const entry = await getCodexEntry(id);
    if (!entry) throw new Error(`Lorebook entry not found: ${id}`);
    return entry;
};

const assertCodexEnabled = (entry: LorebookRow): void => {
    if (!entry.codexEnabled) throw new Error(`Entry '${entry.name}' is not Codex-enabled`);
};

const hasFields = (obj: Record<string, unknown>): boolean =>
    Object.values(obj).some(v => v !== undefined);

const toCodexState = (raw: unknown): CodexState | null =>
    (raw as CodexState | null) ?? null;

// ── Service ────────────────────────────────────────────────────────────────────

/**
 * Create a new lorebook entry with Codex enabled and take an initial snapshot.
 */
export const createCodexEntry = async (
    params: NewCodexEntryParams
): Promise<{ entry: LorebookRow; snapshot: CodexSnapshot }> => {
    if (!params.name.trim()) throw new Error("Name is required");
    if (!params.description.trim()) throw new Error("Description is required");
    if (params.level !== "global" && !params.scopeId)
        throw new Error(`scopeId is required for level '${params.level}'`);
    if (params.level === "global" && params.scopeId)
        throw new Error("Global entries cannot have a scopeId");

    const entry = await insertCodexEntry({
        level: params.level,
        scopeId: params.scopeId ?? null,
        name: params.name.trim(),
        description: params.description.trim(),
        category: params.category,
        tags: params.tags ?? [],
        needsFleshingOut: params.needsFleshingOut ?? null
    });

    const snapshot = await createSnapshot({
        entryId: entry.id,
        description: entry.description,
        codexState: toCodexState(entry.codexState),
        sourceType: params.sourceType,
        sourceRef: params.sourceRef ?? null
    });

    return { entry, snapshot };
};

/**
 * Enable Codex on an existing lorebook entry. Idempotent — safe to call on an
 * already-enabled entry (takes a snapshot of current state without modifying it).
 */
export const enableCodexForEntry = async (
    entryId: string,
    sourceType: CodexSourceType,
    sourceRef?: string | null
): Promise<{ entry: LorebookRow; snapshot: CodexSnapshot }> => {
    const existing = await getOrThrow(entryId);

    let entry = existing;
    if (!existing.codexEnabled) {
        const updated = await updateCodexEntryFields(entryId, { codexEnabled: true });
        if (!updated) throw new Error(`Failed to enable Codex on entry: ${entryId}`);
        entry = updated;
    }

    const snapshot = await createSnapshot({
        entryId: entry.id,
        description: entry.description,
        codexState: toCodexState(entry.codexState),
        sourceType,
        sourceRef: sourceRef ?? null
    });

    return { entry, snapshot };
};

/**
 * Apply a state change to a Codex entry and automatically record a snapshot.
 * Only Codex-enabled entries can be updated via this function.
 */
export const recordStateChange = async (
    entryId: string,
    changes: StateChangeFields,
    sourceType: CodexSourceType,
    sourceRef?: string | null
): Promise<{ entry: LorebookRow; snapshot: CodexSnapshot }> => {
    const existing = await getOrThrow(entryId);
    assertCodexEnabled(existing);
    if (!hasFields(changes)) throw new Error("At least one field must change");

    const entry = await updateCodexEntryFields(entryId, changes);
    if (!entry) throw new Error(`Failed to update entry: ${entryId}`);

    const snapshot = await createSnapshot({
        entryId: entry.id,
        description: entry.description,
        codexState: toCodexState(entry.codexState),
        sourceType,
        sourceRef: sourceRef ?? null
    });

    return { entry, snapshot };
};

/**
 * Submit an AI-proposed change for user review. Does not modify the live entry.
 * The proposal must include at least one changed field.
 */
export const proposeChange = async (
    entryId: string,
    proposal: ChangeProposal,
    sourceType: CodexPendingSourceType,
    sourceRef?: string | null
): Promise<CodexPendingChange> => {
    await getOrThrow(entryId);
    if (!hasFields(proposal)) throw new Error("Proposal must include at least one changed field");

    return createPendingChange({
        entryId,
        proposedDescription: proposal.proposedDescription ?? null,
        proposedState: proposal.proposedState ?? null,
        proposedTags: proposal.proposedTags ?? null,
        proposedNeedsFleshingOut: proposal.proposedNeedsFleshingOut ?? null,
        sourceType,
        sourceRef: sourceRef ?? null
    });
};

/**
 * Approve a pending change: apply proposed fields to the live entry, snapshot the result,
 * and mark the pending change as approved. Idempotent on the snapshot side — safe to call
 * even if the proposal has no fields (takes a snapshot of current state without modifying).
 */
export const approvePendingChange = async (
    pendingChangeId: string
): Promise<{ entry: LorebookRow; snapshot: CodexSnapshot; pendingChange: CodexPendingChange }> => {
    const pending = await getPendingChangeById(pendingChangeId);
    if (!pending) throw new Error(`Pending change not found: ${pendingChangeId}`);
    if (pending.status !== "pending") throw new Error(`Change is already '${pending.status}'`);

    const existing = await getOrThrow(pending.entryId);

    // Build the set of fields to apply — only non-null proposed values
    const changes: UpdateCodexEntryFields = {};
    if (pending.proposedDescription !== null) changes.description = pending.proposedDescription;
    if (pending.proposedState !== null) changes.codexState = pending.proposedState;
    if (pending.proposedTags !== null) changes.tags = pending.proposedTags;
    if (pending.proposedNeedsFleshingOut !== null) changes.needsFleshingOut = pending.proposedNeedsFleshingOut;

    // Apply the changes (if any); snapshot captures the state after the update
    let entry = existing;
    if (hasFields(changes)) {
        const updated = await updateCodexEntryFields(pending.entryId, changes);
        if (!updated) throw new Error(`Failed to apply changes to entry: ${pending.entryId}`);
        entry = updated;
        void attemptPromise(() => indexLorebookEntry(entry.id));
    }

    // sourceRef on the snapshot points back to the pending change for full audit trail
    const pendingSourceToCodexSource = (src: CodexPendingSourceType): CodexSourceType =>
        src === "ai" ? "ai_suggestion" : src;

    const snapshot = await createSnapshot({
        entryId: entry.id,
        description: entry.description,
        codexState: toCodexState(entry.codexState),
        sourceType: pendingSourceToCodexSource(pending.sourceType),
        sourceRef: pendingChangeId
    });

    const resolved = await resolvePendingChange(pendingChangeId, "approved");
    if (!resolved) throw new Error(`Failed to resolve pending change: ${pendingChangeId}`);

    return { entry, snapshot, pendingChange: resolved };
};

/**
 * Reject a pending change without touching the live entry.
 */
export const rejectPendingChange = async (
    pendingChangeId: string
): Promise<CodexPendingChange> => {
    const pending = await getPendingChangeById(pendingChangeId);
    if (!pending) throw new Error(`Pending change not found: ${pendingChangeId}`);
    if (pending.status !== "pending") throw new Error(`Change is already '${pending.status}'`);

    const resolved = await resolvePendingChange(pendingChangeId, "rejected");
    if (!resolved) throw new Error(`Failed to resolve pending change: ${pendingChangeId}`);

    return resolved;
};
