import { describe, expect, it } from "vitest";
import { parseNoteProposals } from "../parseNoteProposals";

describe("parseNoteProposals", () => {
    it("returns null when there is no fence", () => {
        expect(parseNoteProposals("nothing here").noteProposal).toBeNull();
    });

    it("parses a valid note proposal", () => {
        const content = '```note-proposal\n{"title":"T","content":"C","type":"todo"}\n```';
        expect(parseNoteProposals(content).noteProposal).toEqual({ title: "T", content: "C", type: "todo" });
    });

    it("defaults an unrecognized type to idea", () => {
        const content = '```note-proposal\n{"title":"T","content":"C","type":"bogus"}\n```';
        expect(parseNoteProposals(content).noteProposal).toEqual({ title: "T", content: "C", type: "idea" });
    });

    it("returns null when required fields are missing", () => {
        expect(parseNoteProposals('```note-proposal\n{"title":"T"}\n```').noteProposal).toBeNull();
    });
});
