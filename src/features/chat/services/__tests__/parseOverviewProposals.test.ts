import { describe, expect, it } from "vitest";
import { parseOverviewProposals } from "../parseOverviewProposals";

describe("parseOverviewProposals", () => {
    it("returns null when there is no fence", () => {
        expect(parseOverviewProposals("nothing here").proposal).toBeNull();
    });

    it("parses a synopsis proposal", () => {
        const content = '```overview-proposal\n{"proposalType":"synopsis","content":"C"}\n```';
        expect(parseOverviewProposals(content).proposal).toEqual({ proposalType: "synopsis", content: "C" });
    });

    it("parses a note proposal", () => {
        const content = '```overview-proposal\n{"proposalType":"note","title":"T","content":"C","noteType":"idea"}\n```';
        const result = parseOverviewProposals(content);
        expect(result.proposal).toMatchObject({ proposalType: "note", title: "T" });
    });

    it("parses a memory proposal", () => {
        const content = '```overview-proposal\n{"proposalType":"memory","title":"T","body":"B","category":"fact"}\n```';
        const result = parseOverviewProposals(content);
        expect(result.proposal).toMatchObject({ proposalType: "memory", body: "B" });
    });

    it("returns null for an unknown proposalType", () => {
        expect(parseOverviewProposals('```overview-proposal\n{"proposalType":"bogus"}\n```').proposal).toBeNull();
    });
});
