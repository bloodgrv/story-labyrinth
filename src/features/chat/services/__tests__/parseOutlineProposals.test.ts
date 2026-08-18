import { describe, expect, it } from "vitest";
import { parseOutlineProposals } from "../parseOutlineProposals";

describe("parseOutlineProposals", () => {
    it("returns no proposals when there is no fence", () => {
        expect(parseOutlineProposals("no fences here").proposals).toEqual([]);
    });

    it("parses a create proposal", () => {
        const content = '```outline-proposal\n{"type":"create","itemType":"chapter","parentId":null,"title":"Ch 1","summary":null,"wordCountTarget":null}\n```';
        const result = parseOutlineProposals(content);
        expect(result.proposals).toEqual([
            { type: "create", itemType: "chapter", parentId: null, title: "Ch 1", summary: null, wordCountTarget: null }
        ]);
    });

    it("parses edit/reorder/delete variants", () => {
        const content = [
            '```outline-proposal\n{"type":"edit","itemId":"a","title":"New title"}\n```',
            '```outline-proposal\n{"type":"reorder","updates":[{"id":"a","order":0},{"id":"b","order":1}]}\n```',
            '```outline-proposal\n{"type":"delete","itemId":"c"}\n```'
        ].join("\n");
        const result = parseOutlineProposals(content);
        expect(result.proposals).toHaveLength(3);
        expect(result.proposals.map(p => p.type)).toEqual(["edit", "reorder", "delete"]);
    });

    it("rejects a proposal missing its required discriminant fields", () => {
        const content = '```outline-proposal\n{"type":"create"}\n```';
        expect(parseOutlineProposals(content).proposals).toEqual([]);
    });
});
