import { describe, expect, it } from "vitest";
import { parseNameProposal } from "../parseNameProposal";

describe("parseNameProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseNameProposal("nothing here").proposal).toBeNull();
    });

    it("parses a full proposal", () => {
        const content = '```name-proposal\n{"kind":"first_name","gender":"female","region":"Norse","era":"medieval","count":5}\n```';
        const result = parseNameProposal(content);
        expect(result.proposal).toEqual({ kind: "first_name", gender: "female", region: "Norse", era: "medieval", count: 5 });
    });

    it("returns null when kind is not one of the known generate kinds", () => {
        expect(parseNameProposal('```name-proposal\n{"kind":"nickname"}\n```').proposal).toBeNull();
    });

    it("drops an unrecognized gender but keeps the rest of the proposal", () => {
        const content = '```name-proposal\n{"kind":"surname","gender":"nonbinary-typo"}\n```';
        const result = parseNameProposal(content);
        expect(result.proposal).toEqual({ kind: "surname", gender: undefined, region: undefined, era: undefined, count: undefined });
    });
});
