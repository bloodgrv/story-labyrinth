import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStory, startTestServer, type TestServer } from "./integrationServer.js";

// B27 — chat messages are stored as one JSON array on the row, so every write is a read-modify-
// write over the whole transcript. Before `messagesVersion`, two writes landing together meant one
// silently vanished: the streamed assistant reply overwriting the user message that prompted it,
// or an edit wiping a message that arrived mid-edit.
//
// The two paths deliberately behave differently, and both are asserted here:
//   - append (POST /:chatId/messages) RETRIES, because losing that race just means someone else's
//     write landed first and re-appending is always right;
//   - replace (PATCH /:chatId with messages) CONFLICTS with a 409, because a user-initiated edit
//     or delete against a stale transcript is a decision only the user can make.

let server: TestServer;
let storyId: string;

beforeAll(async () => {
    server = await startTestServer();
    storyId = await createStory(server);
}, 120_000);

afterAll(async () => {
    await server?.stop();
});

interface Chat {
    id: string;
    messages: { id: string; role: string; content: string }[];
    messagesVersion: number;
}

const createChat = async (): Promise<Chat> => {
    const { status, body } = await server.api<Chat>("POST", "/api/chats", {
        storyId,
        chatType: "worldbuilding"
    });
    expect(status).toBe(201);
    return body;
};

const readChat = async (chatId: string): Promise<Chat> => {
    const { status, body } = await server.api<Chat>("GET", `/api/chats/${chatId}`);
    expect(status).toBe(200);
    return body;
};

const message = (content: string) => ({
    id: `m-${content.replace(/\W/g, "-")}`,
    role: "user" as const,
    content,
    timestamp: new Date().toISOString()
});

describe("chat message concurrency (B27)", () => {
    // SCOPE NOTE (verified by mutation, do not over-read this test): it asserts that appends
    // ACCUMULATE — it does not exercise appendMessageInternal's retry loop. Replacing that loop
    // with a naive single-attempt read-modify-write leaves this green, because better-sqlite3 is
    // synchronous: concurrent request handlers don't actually interleave between their read and
    // their write, so no lost-update race occurs here to retry from. Covering the retry itself
    // needs a seam or a stubbed repository — see B49's row in docs/CURRENT_BACKLOG.md.
    it("keeps every append rather than overwriting the transcript", async () => {
        const chat = await createChat();
        const contents = ["first", "second", "third", "fourth", "fifth"];

        const results = await Promise.all(
            contents.map(content =>
                server.api("POST", `/api/chats/${chat.id}/messages`, { role: "user", content })
            )
        );
        expect(results.every(r => r.status === 201)).toBe(true);

        const stored = await readChat(chat.id);
        expect(stored.messages).toHaveLength(contents.length);
        expect(stored.messages.map(m => m.content).sort()).toEqual([...contents].sort());
    });

    it("advances the version on every append", async () => {
        const chat = await createChat();
        const before = (await readChat(chat.id)).messagesVersion;

        await server.api("POST", `/api/chats/${chat.id}/messages`, { role: "user", content: "hello" });

        expect((await readChat(chat.id)).messagesVersion).toBe(before + 1);
    });

    it("accepts a replace carrying the current version", async () => {
        const chat = await createChat();
        const current = await readChat(chat.id);

        const { status } = await server.api("PATCH", `/api/chats/${chat.id}`, {
            messages: [message("edited transcript")],
            expectedMessagesVersion: current.messagesVersion
        });

        expect(status).toBe(200);
        const stored = await readChat(chat.id);
        expect(stored.messages.map(m => m.content)).toEqual(["edited transcript"]);
        expect(stored.messagesVersion).toBe(current.messagesVersion + 1);
    });

    it("rejects a stale replace instead of clobbering the newer transcript", async () => {
        const chat = await createChat();
        const staleVersion = (await readChat(chat.id)).messagesVersion;

        // Something else writes first — e.g. a streamed reply landing while an edit dialog is open.
        const appended = await server.api("POST", `/api/chats/${chat.id}/messages`, {
            role: "assistant",
            content: "a reply that arrived mid-edit"
        });
        expect(appended.status).toBe(201);

        const stale = await server.api<{ error: string; latest: Chat }>("PATCH", `/api/chats/${chat.id}`, {
            messages: [message("edit built from a stale view")],
            expectedMessagesVersion: staleVersion
        });

        expect(stale.status).toBe(409);
        // The 409 carries the current transcript so the client can rebuild rather than guess.
        expect(stale.body.latest.messages.map(m => m.content)).toEqual(["a reply that arrived mid-edit"]);

        const stored = await readChat(chat.id);
        expect(stored.messages.map(m => m.content)).toEqual(["a reply that arrived mid-edit"]);
    });

    it("lets exactly one of two simultaneous replaces win", async () => {
        const chat = await createChat();
        const version = (await readChat(chat.id)).messagesVersion;

        const [a, b] = await Promise.all([
            server.api("PATCH", `/api/chats/${chat.id}`, {
                messages: [message("edit A")],
                expectedMessagesVersion: version
            }),
            server.api("PATCH", `/api/chats/${chat.id}`, {
                messages: [message("edit B")],
                expectedMessagesVersion: version
            })
        ]);

        expect([a.status, b.status].sort()).toEqual([200, 409]);

        const stored = await readChat(chat.id);
        expect(stored.messages).toHaveLength(1);
        expect(stored.messages[0].content).toBe(a.status === 200 ? "edit A" : "edit B");
    });

    it("still replaces when no version is supplied, and still advances the version", async () => {
        // Back-compat branch, same reasoning as the chapter CAS: a caller that never sends the token
        // keeps the old unconditional behaviour, but the version must still move so a caller that
        // starts sending it later has a real baseline.
        const chat = await createChat();
        const version = (await readChat(chat.id)).messagesVersion;

        const { status } = await server.api("PATCH", `/api/chats/${chat.id}`, {
            messages: [message("written without a version")]
        });

        expect(status).toBe(200);
        expect((await readChat(chat.id)).messagesVersion).toBe(version + 1);
    });
});
