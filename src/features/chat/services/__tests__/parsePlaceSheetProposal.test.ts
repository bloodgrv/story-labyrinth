import { describe, expect, it } from "vitest";
import { parsePlaceSheetProposal } from "../parsePlaceSheetProposal";

describe("parsePlaceSheetProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parsePlaceSheetProposal("nothing here").placeSheetProposal).toBeNull();
    });

    it("picks up only the recognized string/array fields", () => {
        const content =
            '```place-sheet-proposal\n{"scale":"village","holder":"The Baron","landmarks":["Well","Tower",42],"unknownField":"x"}\n```';
        const result = parsePlaceSheetProposal(content);
        expect(result.placeSheetProposal).toEqual({ scale: "village", holder: "The Baron", landmarks: ["Well", "Tower"] });
    });

    it("returns null when no recognized field is present", () => {
        expect(parsePlaceSheetProposal('```place-sheet-proposal\n{"unknownField":"x"}\n```').placeSheetProposal).toBeNull();
    });
});
