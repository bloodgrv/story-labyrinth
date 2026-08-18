import { describe, expect, it } from "vitest";
import { parsePsychProposal } from "../parsePsychProposal";

describe("parsePsychProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parsePsychProposal("nothing here").psychProposal).toBeNull();
    });

    it("parses a full proposal", () => {
        const content = '```psych-proposal\n{"mbti":"INTJ","enneagram":"5w4","blurb":"Reserved and analytical."}\n```';
        expect(parsePsychProposal(content).psychProposal).toEqual({ mbti: "INTJ", enneagram: "5w4", blurb: "Reserved and analytical." });
    });

    it("returns null when every field is absent", () => {
        expect(parsePsychProposal('```psych-proposal\n{}\n```').psychProposal).toBeNull();
    });

    it("keeps whichever subset of fields is present", () => {
        const content = '```psych-proposal\n{"blurb":"Just a blurb"}\n```';
        expect(parsePsychProposal(content).psychProposal).toEqual({ mbti: undefined, enneagram: undefined, blurb: "Just a blurb" });
    });
});
