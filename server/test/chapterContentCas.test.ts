import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStory, startTestServer, type TestServer } from "./integrationServer.js";

// B24/B38 — the defence against the prose-loss bug class. MultiView can have the same chapter open
// in two panes; before `contentVersion` existed, the slower pane's save silently overwrote the
// faster one's, destroying real manuscript text with no warning. These tests assert the guarantee
// itself (a stale save cannot win), not the implementation of it.
//
// Lives at the HTTP layer because that is where the guarantee lives: the conditional
// `UPDATE ... WHERE id = ? AND contentVersion = ?` is in server/routes/chapters.ts's PUT handler,
// not in a service.

let server: TestServer;
let storyId: string;

beforeAll(async () => {
    server = await startTestServer();
    storyId = await createStory(server);
}, 120_000);

afterAll(async () => {
    await server?.stop();
});

const createChapter = async (content: string): Promise<{ id: string; contentVersion: number }> => {
    const { status, body } = await server.api<{ id: string; contentVersion: number }>("POST", "/api/chapters", {
        storyId,
        title: "Chapter One",
        order: 1,
        content
    });
    expect(status).toBe(201);
    return body;
};

const readChapter = async (id: string) => {
    const { status, body } = await server.api<{ content: string; contentVersion: number }>("GET", `/api/chapters/${id}`);
    expect(status).toBe(200);
    return body;
};

describe("chapter content optimistic concurrency (B24/B38)", () => {
    it("accepts a save carrying the current version, and bumps it", async () => {
        const chapter = await createChapter("original prose");

        const { status, body } = await server.api<{ contentVersion: number }>("PUT", `/api/chapters/${chapter.id}`, {
            content: "edited prose",
            expectedContentVersion: chapter.contentVersion
        });

        expect(status).toBe(200);
        expect(body.contentVersion).toBe(chapter.contentVersion + 1);
        expect((await readChapter(chapter.id)).content).toBe("edited prose");
    });

    it("rejects a stale save and leaves the winner's prose intact", async () => {
        const chapter = await createChapter("shared starting point");
        const staleVersion = chapter.contentVersion;

        // Pane A saves first and moves the version on.
        const first = await server.api("PUT", `/api/chapters/${chapter.id}`, {
            content: "pane A's work",
            expectedContentVersion: staleVersion
        });
        expect(first.status).toBe(200);

        // Pane B still believes it is on the original version.
        const second = await server.api<{ error: string; latest: { content: string } }>(
            "PUT",
            `/api/chapters/${chapter.id}`,
            { content: "pane B's stale overwrite", expectedContentVersion: staleVersion }
        );

        expect(second.status).toBe(409);
        // The 409 hands back the current row so the client can offer "reload latest" rather than
        // retrying blind — without it the user has no path forward but to lose one side.
        expect(second.body.latest.content).toBe("pane A's work");
        expect((await readChapter(chapter.id)).content).toBe("pane A's work");
    });

    it("lets exactly one of two simultaneous saves win", async () => {
        const chapter = await createChapter("racing start");

        // The real MultiView shape: both panes read the same version, then both save.
        const [a, b] = await Promise.all([
            server.api("PUT", `/api/chapters/${chapter.id}`, {
                content: "winner A",
                expectedContentVersion: chapter.contentVersion
            }),
            server.api("PUT", `/api/chapters/${chapter.id}`, {
                content: "winner B",
                expectedContentVersion: chapter.contentVersion
            })
        ]);

        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual([200, 409]);

        // Whichever won, the stored content must be a whole save — never a mix, never the loser's.
        const stored = (await readChapter(chapter.id)).content;
        const winner = a.status === 200 ? "winner A" : "winner B";
        expect(stored).toBe(winner);
    });

    it("still writes when no version is supplied, but advances the version anyway", async () => {
        // Back-compat branch: a caller that never sends expectedContentVersion keeps the old
        // unconditional behaviour. The version must still advance, or a caller that starts sending
        // it later would be handed a baseline that silently never changes.
        const chapter = await createChapter("no-cas start");

        const { status, body } = await server.api<{ contentVersion: number }>("PUT", `/api/chapters/${chapter.id}`, {
            content: "written without a version"
        });

        expect(status).toBe(200);
        expect(body.contentVersion).toBe(chapter.contentVersion + 1);

        // And a stale CAS save afterwards is still correctly refused.
        const stale = await server.api("PUT", `/api/chapters/${chapter.id}`, {
            content: "stale follow-up",
            expectedContentVersion: chapter.contentVersion
        });
        expect(stale.status).toBe(409);
        expect((await readChapter(chapter.id)).content).toBe("written without a version");
    });
});
