import { beforeEach, describe, expect, it, vi } from "vitest";

// Guards the two fixes made after a live run against a local reasoning model (2026-09-07) found
// auto-titling silently broken: the token ceiling was too low for a model that reasons before
// speaking, and — once raised — a model that keeps its reasoning in `content` would have had the
// first 60 characters of its own thinking saved as the chat's title.

const generate = vi.fn();
const handleStreamedResponse = vi.fn();

vi.mock("@/services/ai/AIService", () => ({
    aiService: {
        initialize: vi.fn().mockResolvedValue(undefined),
        generate: (...args: unknown[]) => generate(...args),
        handleStreamedResponse: (...args: unknown[]) => handleStreamedResponse(...args)
    }
}));

const { generateChatTitle } = await import("../generateChatTitle");

// The real readFullResponseText drives aiService.handleStreamedResponse's callbacks; this stands in
// for a stream that yields `text` and completes.
const respondWith = (text: string, status = 200) => {
    generate.mockResolvedValue({ status, ok: status >= 200 && status < 300 } as Response);
    handleStreamedResponse.mockImplementation(
        (_response: Response, onToken: (t: string) => void, onComplete: () => void) => {
            if (text) onToken(text);
            onComplete();
        }
    );
};

const titleFor = () => generateChatTitle("local", "some-model", "a question", "an answer");

beforeEach(() => {
    generate.mockReset();
    handleStreamedResponse.mockReset();
});

describe("chat title generation", () => {
    it("asks for enough tokens that a reasoning model can finish thinking and still answer", async () => {
        // The bug: a 30-token ceiling was consumed entirely by the model's reasoning phase, so the
        // call returned finish_reason "length" with zero content and the title was silently dropped.
        respondWith("A Fine Title");
        await titleFor();

        const maxTokens = generate.mock.calls[0][4] as number;
        expect(maxTokens).toBeGreaterThanOrEqual(256);
    });

    it("strips a model's own reasoning instead of saving it as the title", async () => {
        respondWith("<think>The user asked about weather, so a good title would be...</think>Berlin Rain Scene");

        expect(await titleFor()).toBe("Berlin Rain Scene");
    });

    it("handles the other reasoning tag spellings too", async () => {
        respondWith("<reasoning>hmm</reasoning>Dead Drop Handoff");
        expect(await titleFor()).toBe("Dead Drop Handoff");
    });

    it("still trims quotes and collapses whitespace", async () => {
        respondWith('  "A   Quoted   Title"  ');
        expect(await titleFor()).toBe("A Quoted Title");
    });

    it("returns null rather than a junk title when the model produced nothing usable", async () => {
        // Callers leave the existing title alone on null — writing an empty/garbage title would be
        // worse than leaving "New Chat <date>".
        respondWith("<think>I thought, but never answered.</think>");
        expect(await titleFor()).toBeNull();

        respondWith("");
        expect(await titleFor()).toBeNull();
    });

    it("returns null on a failed response without reading a stream", async () => {
        respondWith("ignored", 502);
        expect(await titleFor()).toBeNull();
    });
});
