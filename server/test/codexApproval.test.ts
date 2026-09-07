import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodexState } from "../../src/types/codex.js";
import { createStory, startTestServer, type TestServer } from "./integrationServer.js";

// B25 + the propose→approve doctrine itself (CLAUDE.md: "All Codex modifications require explicit
// user approval", "no silent canon"). This is the architectural centre of the app, and until now
// nothing asserted it automatically — a regression here is silent by construction: the app would
// go on returning 200s while quietly writing, double-applying, or dropping state.
//
// Covered here:
//   - proposing never touches the live entry
//   - approve is an atomic claim (double-approve can't apply twice), including under a real race
//   - a rejected change can never later be approved
//   - approve shallow-merges, so sections the proposal didn't mention survive
//   - `secrets` can never be written by a proposal, whatever the payload says
//   - the propose route's .strict() schema rejects unknown fields instead of storing them (B39)

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

const createEntry = async (name: string): Promise<string> => {
    const { status, body } = await server.api<{ entry: { id: string } }>("POST", "/api/codex", {
        level: "story",
        scopeId: storyId,
        name,
        description: "starting description",
        category: "character"
    });
    expect(status).toBe(201);
    return body.entry.id;
};

const readEntry = async (entryId: string) => {
    const { status, body } = await server.api<{
        entry: { description: string; codexState: CodexState };
        snapshots: unknown[];
        pendingChanges: unknown[];
    }>("GET", `/api/codex/${entryId}`);
    expect(status).toBe(200);
    return body;
};

const propose = async (entryId: string, proposal: Record<string, unknown>) => {
    const { status, body } = await server.api<{ id: string }>("POST", `/api/codex/${entryId}/propose`, {
        proposal,
        sourceType: "chat"
    });
    return { status, body };
};

const proposeOk = async (entryId: string, proposal: Record<string, unknown>): Promise<string> => {
    const { status, body } = await propose(entryId, proposal);
    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
    return body.id;
};

describe("Codex propose → approve doctrine (B25)", () => {
    it("does not touch the live entry when a change is merely proposed", async () => {
        const entryId = await createEntry("Untouched By Proposal");
        await proposeOk(entryId, { proposedDescription: "a description the user has not approved" });

        const { entry, pendingChanges } = await readEntry(entryId);
        expect(entry.description).toBe("starting description");
        expect(pendingChanges).toHaveLength(1);
    });

    it("applies the change and records a snapshot on approve", async () => {
        const entryId = await createEntry("Approved Once");
        const before = await readEntry(entryId);
        const pendingId = await proposeOk(entryId, { proposedDescription: "approved description" });

        const approve = await server.api("POST", `/api/codex/pending/${pendingId}/approve`);
        expect(approve.status).toBe(200);

        const after = await readEntry(entryId);
        expect(after.entry.description).toBe("approved description");
        // Non-destructive with history is a standing constraint, not an optional extra.
        expect(after.snapshots.length).toBeGreaterThan(before.snapshots.length);
        expect(after.pendingChanges).toHaveLength(0);
    });

    it("refuses a second approve of the same change", async () => {
        const entryId = await createEntry("Double Approve");
        await server.api("POST", `/api/codex/${entryId}/state`, {
            changes: { codexState: { wardrobe: [item("w1", "grey coat")], appearance: [], wounds: [], items: [], customFields: [] } }
        });
        const pendingId = await proposeOk(entryId, {
            proposedState: { wardrobe: [item("w1", "grey coat"), item("w2", "red scarf")] }
        });

        const first = await server.api("POST", `/api/codex/pending/${pendingId}/approve`);
        expect(first.status).toBe(200);

        const second = await server.api("POST", `/api/codex/pending/${pendingId}/approve`);
        expect(second.status).toBeGreaterThanOrEqual(400);

        // The point of the guard: the wardrobe must not have been applied twice.
        const { entry } = await readEntry(entryId);
        expect(entry.codexState.wardrobe).toHaveLength(2);
    });

    it("lets only one of two simultaneous approves through", async () => {
        const entryId = await createEntry("Raced Approve");
        const pendingId = await proposeOk(entryId, { proposedDescription: "raced description" });

        // The real shape: a double-click, or the same tray open in two tabs.
        const [a, b] = await Promise.all([
            server.api("POST", `/api/codex/pending/${pendingId}/approve`),
            server.api("POST", `/api/codex/pending/${pendingId}/approve`)
        ]);

        const okCount = [a, b].filter(r => r.status === 200).length;
        expect(okCount).toBe(1);
    });

    it("never lets a rejected change be approved afterwards", async () => {
        const entryId = await createEntry("Rejected Then Approved");
        const pendingId = await proposeOk(entryId, { proposedDescription: "the user said no to this" });

        const reject = await server.api("POST", `/api/codex/pending/${pendingId}/reject`);
        expect(reject.status).toBe(200);

        const approve = await server.api("POST", `/api/codex/pending/${pendingId}/approve`);
        expect(approve.status).toBeGreaterThanOrEqual(400);

        const { entry } = await readEntry(entryId);
        expect(entry.description).toBe("starting description");
    });

    it("keeps state sections the proposal never mentioned", async () => {
        // A chat proposal usually names only the section that changed. A wholesale replace here
        // would silently wipe wardrobe/wounds/items the model simply didn't talk about.
        const entryId = await createEntry("Shallow Merge");
        await server.api("POST", `/api/codex/${entryId}/state`, {
            changes: {
                codexState: {
                    wardrobe: [item("w1", "travelling cloak")],
                    appearance: [field("Hair", "black")],
                    wounds: [item("s1", "scarred left hand")],
                    items: [item("i1", "brass key")],
                    customFields: []
                }
            }
        });

        const pendingId = await proposeOk(entryId, { proposedState: { appearance: [field("Hair", "silver")] } });
        expect((await server.api("POST", `/api/codex/pending/${pendingId}/approve`)).status).toBe(200);

        const { entry } = await readEntry(entryId);
        expect(entry.codexState.appearance).toEqual([field("Hair", "silver")]);
        expect(entry.codexState.wardrobe).toEqual([item("w1", "travelling cloak")]);
        expect(entry.codexState.wounds).toEqual([item("s1", "scarred left hand")]);
        expect(entry.codexState.items).toEqual([item("i1", "brass key")]);
    });

    it("never writes secrets through a proposal, whatever the payload contains", async () => {
        // A secret may only be created, edited or revealed through the entry's own save path —
        // never as a side effect of approving a Codex proposal.
        //
        // There are two independent guards, and this asserts BOTH, because each covers a producer
        // the other doesn't:
        //   1. the propose route's .strict() schema, which rejects a `secrets` key outright;
        //   2. approvePendingChange's `secrets: currentState.secrets` override, which is the ONLY
        //      guard for pending changes created outside that route — chatCodexService.ts passes a
        //      model-supplied proposedState straight to createPendingChange with no validation.
        // Testing only (1) would leave (2) free to be deleted without any test noticing; verified
        // by mutation, which is why this test reaches past HTTP for the second half.
        const entryId = await createEntry("Secret Keeper");
        const secret = { id: "s1", value: "is the informant", revealed: false, revealedAtChapterId: null };
        await server.api("POST", `/api/codex/${entryId}/state`, {
            changes: {
                codexState: { wardrobe: [], appearance: [], wounds: [], items: [], customFields: [], secrets: [secret] }
            }
        });

        // Guard 1 — the route refuses to even record it.
        const rejected = await propose(entryId, {
            proposedState: { secrets: [{ ...secret, revealed: true }] }
        });
        expect(rejected.status).toBe(400);

        // Guard 2 — a pending change created the way a chat proposal creates one, carrying both a
        // legitimate change and a tampered secret. Written directly because no route will accept it.
        process.env.DATABASE_PATH = server.dbPath;
        const { createPendingChange } = await import("../services/codexRepository.js");
        const tamperedState: CodexState = {
            wardrobe: [item("w1", "plain coat")],
            appearance: [],
            wounds: [],
            items: [],
            customFields: [],
            secrets: [{ id: "s1", value: "is the informant", revealed: true, revealedAtChapterId: null }]
        };
        const smuggled = await createPendingChange({
            entryId,
            proposedDescription: null,
            proposedState: tamperedState,
            proposedTags: null,
            proposedNeedsFleshingOut: null,
            sourceType: "chat",
            sourceRef: null
        });

        expect((await server.api("POST", `/api/codex/pending/${smuggled.id}/approve`)).status).toBe(200);

        const { entry } = await readEntry(entryId);
        // The legitimate half applied...
        expect(entry.codexState.wardrobe).toEqual([item("w1", "plain coat")]);
        // ...and the secret is untouched: still unrevealed, exactly as the user left it.
        expect(entry.codexState.secrets).toEqual([secret]);
    });

    it("rejects unknown fields on the propose route rather than storing them (B39)", async () => {
        const entryId = await createEntry("Strict Schema");

        const unknownTopLevel = await propose(entryId, {
            proposedDescription: "fine",
            proposedSomethingElse: "not a real field"
        });
        expect(unknownTopLevel.status).toBe(400);

        const unknownNested = await propose(entryId, {
            proposedState: { wardrobe: [{ id: "w1", value: "coat", extra: "smuggled" }] }
        });
        expect(unknownNested.status).toBe(400);

        const { pendingChanges } = await readEntry(entryId);
        expect(pendingChanges).toHaveLength(0);
    });
});
