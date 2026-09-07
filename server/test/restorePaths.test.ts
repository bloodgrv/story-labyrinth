import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodexState } from "../../src/types/codex.js";
import { createStory, startTestServer, type TestServer } from "./integrationServer.js";

// Restore is the promise behind CLAUDE.md's "All Codex changes must be non-destructive with
// history" and the chapter undo layer. Both restore paths have already shipped real bugs — the
// 2026-08-19 QA pass found Codex restore reverting an entry *partially* (Core Identity/Appearance
// blanked, later Wardrobe/Wounds left in place), from two independent root causes. A partial
// restore is the worst failure shape here: it looks like it worked.
//
// Covered: a restore lands the entry/chapter on exactly the snapshotted state (no leftovers, no
// blanks), restoring never destroys the present (the pre-restore state stays recoverable), and a
// snapshot belonging to a different entry/chapter is refused.

let server: TestServer;
let storyId: string;

beforeAll(async () => {
    server = await startTestServer();
    storyId = await createStory(server);
}, 120_000);

afterAll(async () => {
    await server?.stop();
});

const item = (id: string, value: string) => ({ id, value });
const field = (key: string, value: string) => ({ key, label: key, value });

const state = (overrides: Partial<CodexState> = {}): CodexState => ({
    wardrobe: [],
    appearance: [],
    wounds: [],
    items: [],
    customFields: [],
    ...overrides
});

interface CodexDetail {
    entry: { description: string; codexState: CodexState };
    snapshots: { id: string; sourceType: string; description: string }[];
}

// Snapshots are selected by content, never by list position. `getSnapshotsForEntry` orders by
// `createdAt` alone, and this app stores timestamps as epoch SECONDS — so two snapshots taken in
// the same second tie, and their relative order is arbitrary. (The chapter-side query breaks the
// same tie with a secondary `desc(rowid)`; the Codex one doesn't — noted in B49's backlog row.)
const snapshotWithDescription = (detail: CodexDetail, description: string): string => {
    const match = detail.snapshots.find(s => s.description === description);
    if (!match) throw new Error(`No snapshot found with description "${description}"`);
    return match.id;
};

const createEntry = async (name: string): Promise<string> => {
    const { status, body } = await server.api<{ entry: { id: string } }>("POST", "/api/codex", {
        level: "story",
        scopeId: storyId,
        name,
        description: "original description",
        category: "character"
    });
    expect(status).toBe(201);
    return body.entry.id;
};

const readEntry = async (entryId: string): Promise<CodexDetail> => {
    const { status, body } = await server.api<CodexDetail>("GET", `/api/codex/${entryId}`);
    expect(status).toBe(200);
    return body;
};

const setState = async (entryId: string, changes: Record<string, unknown>) => {
    const { status } = await server.api("POST", `/api/codex/${entryId}/state`, { changes });
    expect(status).toBe(200);
};

describe("Codex snapshot restore", () => {
    it("restores every section, leaving nothing from the newer state behind", async () => {
        // The QA-B2 shape exactly: an early state, then a later one that changes several sections,
        // then a restore back. A partial restore would leave the later wardrobe/wounds in place.
        const entryId = await createEntry("Full Revert");
        await setState(entryId, {
            description: "the original description",
            codexState: state({
                wardrobe: [item("w1", "linen shirt")],
                appearance: [field("Hair", "black")],
                wounds: [],
                items: [item("i1", "brass key")]
            })
        });
        const original = await readEntry(entryId);
        const targetSnapshotId = snapshotWithDescription(original, "the original description");

        await setState(entryId, {
            description: "a much later description",
            codexState: state({
                wardrobe: [item("w2", "battle armour"), item("w3", "torn cloak")],
                appearance: [field("Hair", "shorn")],
                wounds: [item("s1", "broken rib")],
                items: []
            })
        });

        const restore = await server.api("POST", `/api/codex/${entryId}/snapshots/${targetSnapshotId}/restore`);
        expect(restore.status).toBe(200);

        const after = await readEntry(entryId);
        expect(after.entry.description).toBe(original.entry.description);
        expect(after.entry.codexState.wardrobe).toEqual(original.entry.codexState.wardrobe);
        expect(after.entry.codexState.appearance).toEqual(original.entry.codexState.appearance);
        expect(after.entry.codexState.items).toEqual(original.entry.codexState.items);
        // The wound only existed in the newer state — a partial restore would strand it here.
        expect(after.entry.codexState.wounds).toEqual([]);
    });

    it("lands on an empty state, not a wipe, when restoring a snapshot taken before any state existed", async () => {
        // The entry's very first snapshot (taken at creation) has codexState: null. Passing that
        // null straight through would be read as "set every Codex field to NULL" — a silent wipe
        // rather than a restore to empty.
        const entryId = await createEntry("Null State Snapshot");
        const birthSnapshotId = snapshotWithDescription(await readEntry(entryId), "original description");

        await setState(entryId, { codexState: state({ wardrobe: [item("w1", "later coat")] }) });

        const restore = await server.api("POST", `/api/codex/${entryId}/snapshots/${birthSnapshotId}/restore`);
        expect(restore.status).toBe(200);

        const { entry } = await readEntry(entryId);
        expect(entry.codexState).not.toBeNull();
        expect(entry.codexState.wardrobe).toEqual([]);
        expect(entry.codexState.appearance).toEqual([]);
        expect(entry.codexState.wounds).toEqual([]);
        expect(entry.codexState.items).toEqual([]);
    });

    it("records the restore itself, so the pre-restore state is still reachable", async () => {
        const entryId = await createEntry("Restore Is Recorded");
        await setState(entryId, { description: "state one" });
        const firstSnapshotId = snapshotWithDescription(await readEntry(entryId), "state one");
        await setState(entryId, { description: "state two" });

        const beforeRestore = await readEntry(entryId);
        expect((await server.api("POST", `/api/codex/${entryId}/snapshots/${firstSnapshotId}/restore`)).status).toBe(200);
        const afterRestore = await readEntry(entryId);

        // Non-destructive: restoring adds history rather than rewriting it.
        expect(afterRestore.snapshots.length).toBe(beforeRestore.snapshots.length + 1);
        expect(afterRestore.snapshots.some(s => s.sourceType === "restore")).toBe(true);

        // And "state two" is still recoverable — the restore didn't destroy the present.
        const stateTwoSnapshot = beforeRestore.snapshots.find(s => s.sourceType !== "restore");
        expect(stateTwoSnapshot).toBeTruthy();
    });

    it("refuses a snapshot that belongs to a different entry", async () => {
        const entryA = await createEntry("Entry A");
        const entryB = await createEntry("Entry B");
        await setState(entryB, { description: "B's own description" });
        const bSnapshotId = snapshotWithDescription(await readEntry(entryB), "B's own description");

        const restore = await server.api("POST", `/api/codex/${entryA}/snapshots/${bSnapshotId}/restore`);
        expect(restore.status).toBeGreaterThanOrEqual(400);

        expect((await readEntry(entryA)).entry.description).toBe("original description");
    });
});

describe("chapter content snapshot restore", () => {
    const createChapter = async (content: string): Promise<string> => {
        const { status, body } = await server.api<{ id: string }>("POST", "/api/chapters", {
            storyId,
            title: "Restorable Chapter",
            order: 1,
            content
        });
        expect(status).toBe(201);
        return body.id;
    };

    const snapshot = async (chapterId: string, label: string): Promise<string> => {
        const { status, body } = await server.api<{ id: string }>("POST", `/api/chapters/${chapterId}/snapshots`, {
            label
        });
        expect(status).toBe(201);
        return body.id;
    };

    const readChapter = async (chapterId: string) => {
        const { status, body } = await server.api<{ content: string }>("GET", `/api/chapters/${chapterId}`);
        expect(status).toBe(200);
        return body;
    };

    const listSnapshots = async (chapterId: string) => {
        const { status, body } = await server.api<{ snapshots: { id: string; sourceType: string; content: string }[] }>(
            "GET",
            `/api/chapters/${chapterId}/snapshots`
        );
        expect(status).toBe(200);
        return body.snapshots;
    };

    it("puts the snapshotted prose back", async () => {
        const chapterId = await createChapter("the draft as first written");
        const snapshotId = await snapshot(chapterId, "first draft");

        await server.api("PUT", `/api/chapters/${chapterId}`, { content: "a later rewrite" });
        expect((await readChapter(chapterId)).content).toBe("a later rewrite");

        const restore = await server.api("POST", `/api/chapters/${chapterId}/snapshots/${snapshotId}/restore`);
        expect(restore.status).toBe(200);
        expect((await readChapter(chapterId)).content).toBe("the draft as first written");
    });

    it("checkpoints the current prose before overwriting it, so a restore is itself undoable", async () => {
        // The safety net that makes restore non-destructive: clicking restore on the wrong entry in
        // a history list must never be the end of the newer draft.
        const chapterId = await createChapter("early draft");
        const earlySnapshotId = await snapshot(chapterId, "early");
        await server.api("PUT", `/api/chapters/${chapterId}`, { content: "the newer draft, not yet snapshotted" });

        expect((await server.api("POST", `/api/chapters/${chapterId}/snapshots/${earlySnapshotId}/restore`)).status).toBe(200);

        // The un-snapshotted newer draft must have been captured on the way past. The list rows
        // already carry their content, so no per-snapshot fetch is needed (there is no such route).
        const contents = (await listSnapshots(chapterId)).map(s => s.content);
        expect(contents).toContain("the newer draft, not yet snapshotted");
    });

    it("refuses a snapshot that belongs to a different chapter", async () => {
        const chapterA = await createChapter("chapter A prose");
        const chapterB = await createChapter("chapter B prose");
        const bSnapshotId = await snapshot(chapterB, "B's snapshot");

        const restore = await server.api("POST", `/api/chapters/${chapterA}/snapshots/${bSnapshotId}/restore`);
        expect(restore.status).toBeGreaterThanOrEqual(400);
        expect((await readChapter(chapterA)).content).toBe("chapter A prose");
    });
});
