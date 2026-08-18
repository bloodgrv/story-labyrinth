import { describe, expect, it } from "vitest";
import { parseLoreSuggestions } from "../parseLoreSuggestions";

describe("parseLoreSuggestions", () => {
    it("returns no suggestions when there is no fence", () => {
        expect(parseLoreSuggestions("nothing here").suggestions).toEqual([]);
    });

    it("parses valid suggestions and filters out a malformed one", () => {
        const content =
            '```lore-suggestion\n{"suggestions":[{"name":"Kael","category":"character","blurb":"b"},{"name":"missing fields"}]}\n```';
        const result = parseLoreSuggestions(content);
        expect(result.suggestions).toEqual([{ name: "Kael", category: "character", blurb: "b" }]);
    });

    it("strips the fence from cleanedContent", () => {
        const content = 'before\n```lore-suggestion\n{"suggestions":[]}\n```\nafter';
        expect(parseLoreSuggestions(content).cleanedContent).toBe("before\n\nafter");
    });
});
