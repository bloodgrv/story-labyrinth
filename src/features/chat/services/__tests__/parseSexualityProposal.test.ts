import { describe, expect, it } from "vitest";
import { parseSexualityProposal } from "../parseSexualityProposal";

describe("parseSexualityProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseSexualityProposal("nothing here").sexualityProposal).toBeNull();
    });

    it("parses a full proposal", () => {
        const content = '```sexuality-proposal\n{"orientation":"bisexual","dynamic":"switch","kinks":"k","limits":"l","blurb":"b"}\n```';
        expect(parseSexualityProposal(content).sexualityProposal).toEqual({
            orientation: "bisexual",
            dynamic: "switch",
            kinks: "k",
            limits: "l",
            blurb: "b"
        });
    });

    it("returns null when every field is absent", () => {
        expect(parseSexualityProposal('```sexuality-proposal\n{}\n```').sexualityProposal).toBeNull();
    });
});
