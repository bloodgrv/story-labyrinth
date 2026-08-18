import { describe, expect, it } from "vitest";
import { parseCodexProposals } from "../parseCodexProposals";

describe("parseCodexProposals", () => {
    it("returns no proposals and unchanged content when there is no fence", () => {
        const result = parseCodexProposals("just a normal reply");
        expect(result.proposals).toEqual([]);
        expect(result.cleanedContent).toBe("just a normal reply");
    });

    it("parses a single new_entry proposal and strips the fence from the content", () => {
        const content =
            'Sure, here is a new entry.\n```codex-proposal\n{"type":"new_entry","level":"story","name":"Kael","description":"A wanderer","category":"character"}\n```\nHope that helps.';
        const result = parseCodexProposals(content);
        expect(result.proposals).toEqual([
            { type: "new_entry", level: "story", name: "Kael", description: "A wanderer", category: "character" }
        ]);
        expect(result.cleanedContent).toBe("Sure, here is a new entry.\n\nHope that helps.");
    });

    it("parses multiple fences in one reply (g flag)", () => {
        const content =
            '```codex-proposal\n{"type":"modify_entry","entryId":"abc"}\n```\n```codex-proposal\n{"type":"new_entry","level":"global","name":"Town","description":"d","category":"location"}\n```';
        const result = parseCodexProposals(content);
        expect(result.proposals).toHaveLength(2);
        expect(result.proposals[0]).toMatchObject({ type: "modify_entry", entryId: "abc" });
        expect(result.proposals[1]).toMatchObject({ type: "new_entry", name: "Town" });
    });

    it("drops a fence with malformed JSON instead of throwing", () => {
        const content = "```codex-proposal\n{not valid json\n```";
        const result = parseCodexProposals(content);
        expect(result.proposals).toEqual([]);
    });

    it("drops a fence whose JSON is well-formed but fails shape validation", () => {
        const content = '```codex-proposal\n{"type":"new_entry","name":"Missing fields"}\n```';
        const result = parseCodexProposals(content);
        expect(result.proposals).toEqual([]);
    });
});
