import { describe, expect, it } from "vitest";
import { parseSheetProposal } from "../parseSheetProposal";

describe("parseSheetProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseSheetProposal("nothing here").sheetProposal).toBeNull();
    });

    it("extracts the raw markdown body and strips the fence", () => {
        const content = "```sheet-proposal\n## Appearance\nTall, dark hair.\n```";
        const result = parseSheetProposal(content);
        expect(result.sheetProposal).toBe("## Appearance\nTall, dark hair.");
        expect(result.cleanedContent).toBe("");
    });

    it("returns null when the fence body is empty", () => {
        expect(parseSheetProposal("```sheet-proposal\n\n```").sheetProposal).toBeNull();
    });
});
