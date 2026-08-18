import { describe, expect, it } from "vitest";
import { parseNoteSplitProposal } from "../parseNoteSplitProposal";

describe("parseNoteSplitProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseNoteSplitProposal("nothing here").proposal).toBeNull();
    });

    it("parses a valid multi-note payload", () => {
        const content =
            '```note-split-proposal\n{"notes":[{"title":"A","content":"a","type":"idea"},{"title":"B","content":"b","type":"todo"}]}\n```';
        const result = parseNoteSplitProposal(content);
        expect(result.proposal?.notes).toHaveLength(2);
    });

    it("returns null when notes is empty", () => {
        expect(parseNoteSplitProposal('```note-split-proposal\n{"notes":[]}\n```').proposal).toBeNull();
    });

    it("returns null when any note has an invalid type", () => {
        const content = '```note-split-proposal\n{"notes":[{"title":"A","content":"a","type":"bogus"}]}\n```';
        expect(parseNoteSplitProposal(content).proposal).toBeNull();
    });
});
