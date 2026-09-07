import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../src/types/story.js";

// Closes the gap chatMessagesCas.test.ts documents but cannot reach: appendMessageInternal's
// retry loop. Over HTTP it is unobservable — better-sqlite3 is synchronous, so two concurrent
// request handlers never actually interleave between their read and their write, and a naive
// single-attempt append passes the integration suite unchanged (verified by mutation).
//
// So this drives the loop directly with a stubbed repository, which is the only way to force the
// lost-race branch deterministically. Unit-shaped on purpose: no server, no database, ~0ms.
//
// The behaviour under test is deliberately asymmetric with replaceMessages (see chatService.ts's
// own comment): an append that loses the race RETRIES, because re-reading and re-appending is
// always the right outcome; a user-initiated replace CONFLICTS, because only the user can decide.

const chatRow = (messages: ChatMessage[], messagesVersion: number) => ({
    id: "chat-1",
    storyId: "story-1",
    chatType: "worldbuilding",
    title: "Test chat",
    messages,
    messagesVersion,
    createdAt: new Date(),
    updatedAt: new Date()
});

const getChatById = vi.fn();
const updateChatMessages = vi.fn();

vi.mock("../services/chatRepository.js", () => ({
    getChatById: (...args: unknown[]) => getChatById(...args),
    updateChatMessages: (...args: unknown[]) => updateChatMessages(...args),
    // Unused by this test, but chatService imports them at module level.
    archiveChat: vi.fn(),
    createChat: vi.fn(),
    deleteChat: vi.fn(),
    getArchivedChats: vi.fn(),
    getChatsForStory: vi.fn(),
    getGlobalChats: vi.fn(),
    softDeleteChat: vi.fn(),
    unarchiveChat: vi.fn(),
    updateChatMeta: vi.fn()
}));

// chatService also imports folderService, which would otherwise pull in db/client.ts and open a
// real SQLite file as an import side effect.
vi.mock("../services/folderService.js", () => ({ resolveChatFolderId: vi.fn() }));

const { appendMessage } = await import("../services/chatService.js");

beforeEach(() => {
    getChatById.mockReset();
    updateChatMessages.mockReset();
});

describe("chat append retry loop (B27)", () => {
    it("re-reads and re-appends after losing a version race, keeping the message that landed first", async () => {
        const theirs: ChatMessage = {
            id: "theirs",
            role: "assistant",
            content: "a reply that landed first",
            timestamp: new Date()
        };

        // First read sees an empty transcript at v0; the conditional update then fails because
        // someone else's write has already moved the row to v1. The re-read must see THEIR message.
        getChatById.mockResolvedValueOnce(chatRow([], 0)).mockResolvedValueOnce(chatRow([theirs], 1));
        updateChatMessages.mockResolvedValueOnce(null).mockImplementationOnce(async (_id, messages) => chatRow(messages, 2));

        const result = await appendMessage("chat-1", "user", "mine");

        expect(updateChatMessages).toHaveBeenCalledTimes(2);
        // The retry must be built on the re-read, not on the stale array it first held — otherwise
        // the winning write is silently dropped, which is the whole bug B27 exists to prevent.
        const [, retriedMessages, retriedVersion] = updateChatMessages.mock.calls[1];
        expect((retriedMessages as ChatMessage[]).map(m => m.content)).toEqual([
            "a reply that landed first",
            "mine"
        ]);
        // And each attempt carries the version it actually read, so the write stays conditional.
        expect(updateChatMessages.mock.calls[0][2]).toBe(0);
        expect(retriedVersion).toBe(1);
        expect(result.messages).toHaveLength(2);
    });

    it("gives up with a clear error rather than looping forever", async () => {
        getChatById.mockResolvedValue(chatRow([], 0));
        updateChatMessages.mockResolvedValue(null); // every attempt loses

        await expect(appendMessage("chat-1", "user", "mine")).rejects.toThrow(/repeated conflicts/);
        expect(updateChatMessages).toHaveBeenCalledTimes(5);
    });

    it("writes conditionally on the first attempt too, not just on retries", async () => {
        // A first attempt that ignored the version would make the whole loop pointless: the race
        // it exists to detect would already have been lost silently.
        getChatById.mockResolvedValue(chatRow([], 7));
        updateChatMessages.mockImplementation(async (_id, messages) => chatRow(messages, 8));

        await appendMessage("chat-1", "assistant", "only attempt");

        expect(updateChatMessages).toHaveBeenCalledTimes(1);
        expect(updateChatMessages.mock.calls[0][2]).toBe(7);
    });
});
