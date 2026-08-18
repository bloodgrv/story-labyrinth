import { describe, expect, it } from "vitest";
import { parseSheetSpanProposal } from "../parseSheetSpanProposal";

describe("parseSheetSpanProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseSheetSpanProposal("nothing here").sheetSpanProposal).toBeNull();
    });

    it("extracts only the replacement span text", () => {
        const content = "```sheet-span-proposal\nnewly reworded sentence.\n```";
        expect(parseSheetSpanProposal(content).sheetSpanProposal).toBe("newly reworded sentence.");
    });

    it("returns null when the fence body is empty", () => {
        expect(parseSheetSpanProposal("```sheet-span-proposal\n\n```").sheetSpanProposal).toBeNull();
    });
});
