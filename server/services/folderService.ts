import { and, eq, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";

// Cosmetic org folders (B9, docs/Folders_Org_Design.md) — one shared "folder engine" used by
// both server/routes/folders.ts (folder CRUD) and server/routes/lorebook.ts / chats.ts (leaf
// filing validation), so the depth rule and scope/kind matching only live in one place. UI-only:
// never read by RAG, Codex, or agent context assembly.

export type FolderRow = typeof schema.orgFolders.$inferSelect;
type LorebookRow = typeof schema.lorebookEntries.$inferSelect;
// Narrow shape (not the full aiChats row) — resolveChatFolderId is called from chatService.ts
// with its own normalized ChatRow (parsed messages/typed chatType), not the raw drizzle row.
type ChatFolderScope = { storyId: string | null; chatType: string | null };
// Narrow shape for resolveNotesFolderId — a note's own scoping is just storyId, no
// category/chatType concept (T7, docs/Notes_Org_Browse_Design.md).
type NoteFolderScope = { storyId: string };

export type FolderKind = "lorebook" | "chat" | "notes";

const MAX_DEPTH = 3;

// All folders sharing a (kind, scopeId) pair, across categories/chatTypes — small enough (a
// personal novel's lorebook/chat folders) that fetching the whole scope once and doing depth/
// tree math in memory is simpler and cheaper than N+1 parentId walks per validation.
const listFoldersInScope = (kind: FolderKind, scopeId: string): Promise<FolderRow[]> =>
    db.select().from(schema.orgFolders).where(and(eq(schema.orgFolders.kind, kind), eq(schema.orgFolders.scopeId, scopeId)));

const buildParentMap = (folders: FolderRow[]): Map<string, string | null> =>
    new Map(folders.map(f => [f.id, f.parentId]));

const buildChildrenMap = (folders: FolderRow[]): Map<string | null, FolderRow[]> => {
    const map = new Map<string | null, FolderRow[]>();
    for (const folder of folders) {
        const key = folder.parentId;
        if (!map.has(key)) map.set(key, []);
        map.get(key)?.push(folder);
    }
    return map;
};

// Depth of `folderId` itself, root = 1.
const computeDepth = (folderId: string, parentMap: Map<string, string | null>): number => {
    let depth = 1;
    let currentId: string | null = folderId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const parentId: string | null = parentMap.get(currentId) ?? null;
        if (!parentId) break;
        currentId = parentId;
        depth++;
    }
    return depth;
};

// Height of the subtree rooted at `folderId` (1 = leaf, no children).
const computeSubtreeHeight = (folderId: string, childrenMap: Map<string | null, FolderRow[]>): number => {
    const children = childrenMap.get(folderId) ?? [];
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map(child => computeSubtreeHeight(child.id, childrenMap)));
};

const isDescendant = (candidateId: string, ancestorId: string, childrenMap: Map<string | null, FolderRow[]>): boolean => {
    const children = childrenMap.get(ancestorId) ?? [];
    return children.some(child => child.id === candidateId || isDescendant(candidateId, child.id, childrenMap));
};

// Validates that placing a folder (new, or `movingId` being reparented) under `targetParentId`
// stays within MAX_DEPTH, and — for a move — that the target isn't the folder itself or one of
// its own descendants (which would orphan a cycle).
const validatePlacement = (
    folders: FolderRow[],
    targetParentId: string | null,
    movingId: string | null
): void => {
    if (!targetParentId) return; // becoming/staying a root is always valid depth-wise
    const parentMap = buildParentMap(folders);
    const childrenMap = buildChildrenMap(folders);

    if (movingId) {
        if (targetParentId === movingId) throw new Error("A folder cannot be moved into itself");
        if (isDescendant(targetParentId, movingId, childrenMap))
            throw new Error("A folder cannot be moved into one of its own subfolders");
    }

    const parentDepth = computeDepth(targetParentId, parentMap);
    const movingHeight = movingId ? computeSubtreeHeight(movingId, childrenMap) : 1;
    if (parentDepth + movingHeight > MAX_DEPTH)
        throw new Error(`Folders can only be nested ${MAX_DEPTH} levels deep`);
};

// A folder's parent must share the same kind/scope, and (for lorebook) the same level+category,
// or (for chat) the same chatType — same rule leaves are held to (see assignLorebookFolder/
// assignChatFolder below). Prevents nesting a Character folder under a Location folder, etc.
const validateSameBucket = (folder: Pick<FolderRow, "kind" | "level" | "scopeId" | "category" | "chatType">, parent: FolderRow | null): void => {
    if (!parent) return;
    if (
        parent.kind !== folder.kind ||
        parent.scopeId !== folder.scopeId ||
        (folder.kind === "lorebook" && (parent.level !== folder.level || parent.category !== folder.category)) ||
        (folder.kind === "chat" && parent.chatType !== folder.chatType)
    )
        throw new Error("A folder's parent must share the same scope and category/chat type");
};

const nextSiblingOrder = (folders: FolderRow[], parentId: string | null): number => {
    const siblings = folders.filter(f => f.parentId === parentId);
    return siblings.length === 0 ? 0 : Math.max(...siblings.map(f => f.order)) + 1;
};

export type CreateFolderInput = {
    kind: FolderKind;
    level?: "series" | "story" | null;
    scopeId: string;
    category?: string | null;
    chatType?: string | null;
    parentId?: string | null;
    name: string;
};

export const createFolder = async (input: CreateFolderInput): Promise<FolderRow> => {
    if (input.kind === "lorebook" && (!input.level || !input.category))
        throw new Error("Lorebook folders require level and category");
    if (input.kind === "chat" && !input.chatType) throw new Error("Chat folders require chatType");
    if (!input.name.trim()) throw new Error("Folder name is required");

    const parentId = input.parentId ?? null;
    const folders = await listFoldersInScope(input.kind, input.scopeId);

    if (parentId) {
        const parent = folders.find(f => f.id === parentId);
        if (!parent) throw new Error("Parent folder not found");
        validateSameBucket(input as Pick<FolderRow, "kind" | "level" | "scopeId" | "category" | "chatType">, parent);
    }
    validatePlacement(folders, parentId, null);

    const now = new Date();
    const [created] = await db
        .insert(schema.orgFolders)
        .values({
            id: crypto.randomUUID(),
            kind: input.kind,
            level: input.level ?? null,
            scopeId: input.scopeId,
            category: input.category ?? null,
            chatType: input.chatType ?? null,
            parentId,
            name: input.name.trim(),
            order: nextSiblingOrder(folders, parentId),
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return created;
};

export const renameFolder = async (id: string, name: string): Promise<FolderRow> => {
    if (!name.trim()) throw new Error("Folder name is required");
    const [updated] = await db
        .update(schema.orgFolders)
        .set({ name: name.trim(), updatedAt: new Date() })
        .where(eq(schema.orgFolders.id, id))
        .returning();
    if (!updated) throw new Error(`Folder not found: ${id}`);
    return updated;
};

export type MoveFolderInput = { parentId?: string | null; order?: number };

export const moveFolder = async (id: string, input: MoveFolderInput): Promise<FolderRow> => {
    const [folder] = await db.select().from(schema.orgFolders).where(eq(schema.orgFolders.id, id));
    if (!folder) throw new Error(`Folder not found: ${id}`);

    const folders = await listFoldersInScope(folder.kind as FolderKind, folder.scopeId as string);
    const targetParentId = input.parentId !== undefined ? input.parentId : folder.parentId;

    if (targetParentId) {
        const parent = folders.find(f => f.id === targetParentId);
        if (!parent) throw new Error("Parent folder not found");
        validateSameBucket(folder, parent);
    }
    validatePlacement(folders, targetParentId, id);

    const order = input.order !== undefined ? input.order : nextSiblingOrder(folders.filter(f => f.id !== id), targetParentId);
    const [updated] = await db
        .update(schema.orgFolders)
        .set({ parentId: targetParentId, order, updatedAt: new Date() })
        .where(eq(schema.orgFolders.id, id))
        .returning();
    return updated;
};

// Bulk reorder/reparent — same shape as outline.ts's PATCH /reorder (a single drag can shift many
// siblings' order at once). Trusts the client for plain order changes (matching that precedent);
// re-validates depth in-memory (single scope fetch, not per-item) whenever an update carries a
// parentId change, since that's the one case that could actually violate the depth rule.
export const reorderFolders = async (updates: Array<{ id: string; order: number; parentId?: string | null }>): Promise<void> => {
    if (updates.length === 0) return;
    const [sample] = await db.select().from(schema.orgFolders).where(eq(schema.orgFolders.id, updates[0].id));
    if (!sample) throw new Error(`Folder not found: ${updates[0].id}`);
    const folders = await listFoldersInScope(sample.kind as FolderKind, sample.scopeId as string);

    for (const update of updates)
        if ("parentId" in update) {
            const folder = folders.find(f => f.id === update.id);
            if (folder && update.parentId) {
                const parent = folders.find(f => f.id === update.parentId);
                if (parent) validateSameBucket(folder, parent);
            }
            validatePlacement(folders, update.parentId ?? null, update.id);
        }

    const now = new Date();
    for (const update of updates) {
        const setValues: { order: number; updatedAt: Date; parentId?: string | null } = { order: update.order, updatedAt: now };
        if ("parentId" in update) setValues.parentId = update.parentId ?? null;
        await db.update(schema.orgFolders).set(setValues).where(eq(schema.orgFolders.id, update.id));
    }
};

// Deletes a folder without touching its contents: child folders re-parent to the deleted folder's
// own parent (or become roots if it was a root), and any leaves (lorebook entries / chats) filed
// directly in it retarget the same way. Never cascades — per the design doc, deleting a folder
// must never delete the entries/chats inside it.
export const deleteFolder = async (id: string): Promise<void> => {
    const [folder] = await db.select().from(schema.orgFolders).where(eq(schema.orgFolders.id, id));
    if (!folder) return;

    const newParentId = folder.parentId ?? null;

    await db.update(schema.orgFolders).set({ parentId: newParentId, updatedAt: new Date() }).where(eq(schema.orgFolders.parentId, id));

    if (folder.kind === "lorebook")
        await db.update(schema.lorebookEntries).set({ folderId: newParentId }).where(eq(schema.lorebookEntries.folderId, id));
    else if (folder.kind === "notes")
        await db.update(schema.notes).set({ folderId: newParentId }).where(eq(schema.notes.folderId, id));
    else await db.update(schema.aiChats).set({ folderId: newParentId }).where(eq(schema.aiChats.folderId, id));

    await db.delete(schema.orgFolders).where(eq(schema.orgFolders.id, id));
};

export const listFolders = async (params: {
    kind: FolderKind;
    scopeId: string;
    category?: string;
    chatType?: string;
}): Promise<FolderRow[]> => {
    const conditions = [eq(schema.orgFolders.kind, params.kind), eq(schema.orgFolders.scopeId, params.scopeId)];
    if (params.category) conditions.push(eq(schema.orgFolders.category, params.category));
    if (params.chatType) conditions.push(eq(schema.orgFolders.chatType, params.chatType));
    return db.select().from(schema.orgFolders).where(and(...conditions));
};

// ── Leaf filing validation ──────────────────────────────────────────────────────
// Called from lorebook.ts's PUT and chats.ts's PATCH before the entry/chat row is actually
// updated — resolves what folderId should be written (validating an explicit choice, or
// auto-clearing a now-mismatched one after a category change per the design doc's edge case).

export const resolveLorebookFolderId = async (
    entry: LorebookRow,
    updates: { folderId?: string | null; category?: string; level?: string; scopeId?: string | null }
): Promise<string | null | undefined> => {
    if (updates.folderId === undefined && updates.category === undefined) return undefined; // untouched

    const effectiveCategory = updates.category ?? entry.category;
    const effectiveLevel = updates.level ?? entry.level;
    const effectiveScopeId = updates.scopeId !== undefined ? updates.scopeId : entry.scopeId;
    const targetFolderId = updates.folderId !== undefined ? updates.folderId : entry.folderId;
    if (!targetFolderId) return null;

    const [folder] = await db.select().from(schema.orgFolders).where(eq(schema.orgFolders.id, targetFolderId));
    const matches =
        folder &&
        folder.kind === "lorebook" &&
        folder.level === effectiveLevel &&
        folder.scopeId === effectiveScopeId &&
        folder.category === effectiveCategory;

    if (matches) return targetFolderId;
    // An explicit folderId the caller chose that doesn't match: fail loudly. An implicit mismatch
    // caused only by a category change dragging along the old folderId: auto-clear instead.
    if (updates.folderId !== undefined) throw new Error("Folder does not match this entry's level/scope/category");
    return null;
};

export const resolveChatFolderId = async (
    chat: ChatFolderScope,
    updates: { folderId?: string | null }
): Promise<string | null | undefined> => {
    if (updates.folderId === undefined) return undefined;
    if (!updates.folderId) return null;

    const [folder] = await db.select().from(schema.orgFolders).where(eq(schema.orgFolders.id, updates.folderId));
    const matches =
        folder && folder.kind === "chat" && folder.scopeId === chat.storyId && folder.chatType === (chat.chatType ?? "general");
    if (!matches) throw new Error("Folder does not match this chat's story/chatType");
    return updates.folderId;
};

// T7 (NO3) — mirrors resolveChatFolderId, simpler: a note's own scope is just its storyId, no
// category/chatType concept to also match.
export const resolveNotesFolderId = async (
    note: NoteFolderScope,
    updates: { folderId?: string | null }
): Promise<string | null | undefined> => {
    if (updates.folderId === undefined) return undefined;
    if (!updates.folderId) return null;

    const [folder] = await db.select().from(schema.orgFolders).where(eq(schema.orgFolders.id, updates.folderId));
    const matches = folder && folder.kind === "notes" && folder.scopeId === note.storyId;
    if (!matches) throw new Error("Folder does not match this note's story");
    return updates.folderId;
};

// ── Scope cleanup on story/series delete ────────────────────────────────────────

export const deleteFoldersForStoryScope = async (storyId: string): Promise<void> => {
    await db
        .delete(schema.orgFolders)
        .where(
            or(
                and(eq(schema.orgFolders.kind, "lorebook"), eq(schema.orgFolders.level, "story"), eq(schema.orgFolders.scopeId, storyId)),
                and(eq(schema.orgFolders.kind, "chat"), eq(schema.orgFolders.scopeId, storyId)),
                and(eq(schema.orgFolders.kind, "notes"), eq(schema.orgFolders.scopeId, storyId))
            )
        );
};

export const deleteFoldersForSeriesScope = async (seriesId: string): Promise<void> => {
    await db
        .delete(schema.orgFolders)
        .where(and(eq(schema.orgFolders.kind, "lorebook"), eq(schema.orgFolders.level, "series"), eq(schema.orgFolders.scopeId, seriesId)));
};

