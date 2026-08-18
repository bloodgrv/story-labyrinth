import { randomUUID } from "node:crypto";
import { attemptPromise } from "@jfdi/attempt";
import type { InferSelectModel } from "drizzle-orm";
import type { schema } from "../db/client.js";
import type {
    CodexCustomField,
    CodexPendingChange,
    CodexPendingSourceType,
    CodexSnapshot,
    CodexSourceType,
    CodexState
} from "../../src/types/codex.js";
import type { LorebookEntry } from "../../src/types/story.js";
import { indexLorebookEntry } from "./ragIndexService.js";
import {
    createPendingChange,
    createSnapshot,
    getCodexEntry,
    getPendingChangeById,
    getSnapshotById,
    insertCodexEntry,
    resolvePendingChange,
    revertPendingChangeToPending,
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

// `appearance` changed shape 2026-07-17: was a flat CodexStateItem[] ({id, value}), now labeled
// CodexCustomField[] ({key, label, value}) — see DECISIONS.md's "Codex Appearance Relabeling"
// entry. codexState is stored as an unvalidated JSON blob, so any row saved before this change
// (or a restored old snapshot) still has the old shape on disk. Normalize on every read rather
// than a one-off backfill, since a restored historical snapshot can always reintroduce the old
// shape — new writes go through the form/document-import paths, which already produce the new
// shape directly, so this only ever needs to upgrade, never downgrade. Exported for
// lorebook.ts's own read path (this file's own codex-specific endpoints are a separate route
// from the general entry CRUD route, so both need to call this rather than just one).
export const normalizeAppearance = (raw: unknown): CodexCustomField[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
        const obj = (item ?? {}) as Record<string, unknown>;
        if (typeof obj.label === "string") return obj as unknown as CodexCustomField;
        return {
            key: typeof obj.id === "string" ? obj.id : randomUUID(),
            label: "",
            value: typeof obj.value === "string" ? obj.value : ""
        };
    });
};

const toCodexState = (raw: unknown): CodexState | null => {
    if (raw === null || raw === undefined) return null;
    const state = raw as CodexState;
    return { ...state, appearance: normalizeAppearance(state.appearance) };
};

const EMPTY_CODEX_STATE: CodexState = { wardrobe: [], appearance: [], wounds: [], items: [], customFields: [] };

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
    void attemptPromise(() => indexLorebookEntry(entry.id));

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
const alreadyResolvedError = async (id: string): Promise<Error> => {
    const pending = await getPendingChangeById(id);
    return pending ? new Error(`Change is already '${pending.status}'`) : new Error(`Pending change not found: ${id}`);
};

export const approvePendingChange = async (
    pendingChangeId: string
): Promise<{ entry: LorebookRow; snapshot: CodexSnapshot; pendingChange: CodexPendingChange }> => {
    // B25 (docs/CODE_REVIEW_2026-08-17.md) — claim the row atomically FIRST, before any of the
    // entry-mutation work below, via resolvePendingChange's own `WHERE status='pending'` guard.
    // Two concurrent approve calls (double-click, two open tabs) both racing a plain
    // check-then-act could otherwise both pass the check and both apply — only one caller's claim
    // can ever return a row here, so the loser gets a clean "already resolved" error immediately
    // instead of double-applying.
    const claimed = await resolvePendingChange(pendingChangeId, "approved");
    if (!claimed) throw await alreadyResolvedError(pendingChangeId);

    try {
        const existing = await getOrThrow(claimed.entryId);

        // Build the set of fields to apply — only non-null proposed values
        const changes: UpdateCodexEntryFields = {};
        if (claimed.proposedDescription !== null) changes.description = claimed.proposedDescription;
        // Shallow merge, not a wholesale replace: proposedState from a chat proposal may only include
        // the section(s) that actually changed (see CODEX_PROPOSAL_INSTRUCTIONS in
        // chatContextService.ts) — replacing codexState outright would silently wipe every other
        // section (wardrobe/appearance/wounds/items/customFields) the model didn't mention, the same
        // class of data-loss bug already fixed once for entry metadata (see entryFormUtils.ts's
        // buildSubmitData spread). Any key present in proposedState overwrites; any key absent is kept
        // from the entry's current state.
        // `secrets` is deliberately never taken from a proposal, regardless of what the AI (or a
        // future "Edit First" tray edit) included — the existing entry's own secrets always win, so a
        // secret can only ever be created, edited, or revealed through the entry's own direct save
        // path, never as a side effect of an ordinary codex-proposal Approve.
        if (claimed.proposedState !== null) {
            const currentState = toCodexState(existing.codexState) ?? EMPTY_CODEX_STATE;
            changes.codexState = { ...currentState, ...claimed.proposedState, secrets: currentState.secrets };
        }
        if (claimed.proposedTags !== null) changes.tags = claimed.proposedTags;
        if (claimed.proposedNeedsFleshingOut !== null) changes.needsFleshingOut = claimed.proposedNeedsFleshingOut;

        // Apply the changes (if any); snapshot captures the state after the update
        let entry = existing;
        if (hasFields(changes)) {
            const updated = await updateCodexEntryFields(claimed.entryId, changes);
            if (!updated) throw new Error(`Failed to apply changes to entry: ${claimed.entryId}`);
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
            sourceType: pendingSourceToCodexSource(claimed.sourceType),
            sourceRef: pendingChangeId
        });

        return { entry, snapshot, pendingChange: claimed };
    } catch (err) {
        // Don't leave the row stuck 'approved' with nothing actually applied and no way to retry
        // from the UI — put it back to 'pending' before propagating the real failure.
        await revertPendingChangeToPending(pendingChangeId).catch(() => {});
        throw err;
    }
};

/**
 * Reject a pending change without touching the live entry.
 */
export const rejectPendingChange = async (
    pendingChangeId: string
): Promise<CodexPendingChange> => {
    // B25 — same atomic-claim shape as approvePendingChange, just with no apply step to
    // compensate for on failure.
    const resolved = await resolvePendingChange(pendingChangeId, "rejected");
    if (!resolved) throw await alreadyResolvedError(pendingChangeId);

    return resolved;
};

/**
 * Restore an entry to an earlier snapshot's description/codexState (Project Saves Phase 1).
 * Non-destructive: applies the snapshot's state to the live entry, then takes a NEW snapshot
 * of the result tagged sourceType: "restore" — the restore itself becomes part of the entry's
 * history, not a silent rewind. Note codexSnapshots only ever captured description/codexState,
 * never tags/needsFleshingOut, so those two fields are left untouched by a restore.
 */
export const restoreSnapshot = async (
    entryId: string,
    snapshotId: string
): Promise<{ entry: LorebookRow; snapshot: CodexSnapshot }> => {
    const target = await getSnapshotById(snapshotId);
    if (!target) throw new Error(`Snapshot not found: ${snapshotId}`);
    if (target.entryId !== entryId) throw new Error(`Snapshot ${snapshotId} does not belong to entry ${entryId}`);

    const existing = await getOrThrow(entryId);

    const updated = await updateCodexEntryFields(entryId, {
        description: target.description,
        codexState: target.codexState
    });
    const entry = updated ?? existing;
    if (updated) void attemptPromise(() => indexLorebookEntry(entry.id));

    const snapshot = await createSnapshot({
        entryId: entry.id,
        description: entry.description,
        codexState: toCodexState(entry.codexState),
        sourceType: "restore",
        sourceRef: snapshotId
    });

    return { entry, snapshot };
};
