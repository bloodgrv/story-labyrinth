import { describe, expect, it } from "vitest";
import { parseProseProposal } from "../parseProseProposal";

describe("parseProseProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseProseProposal("nothing here").proseProposal).toBeNull();
    });

    it("extracts the raw prose text and strips the fence", () => {
        const content = "Here you go:\n```prose-proposal\nThe rain fell softly.\n```\nLet me know what you think.";
        const result = parseProseProposal(content);
        expect(result.proseProposal).toBe("The rain fell softly.");
        expect(result.cleanedContent).toBe("Here you go:\n\nLet me know what you think.");
    });

    it("returns null when the fence body is empty/whitespace-only", () => {
        const content = "```prose-proposal\n   \n```";
        expect(parseProseProposal(content).proseProposal).toBeNull();
    });
});
