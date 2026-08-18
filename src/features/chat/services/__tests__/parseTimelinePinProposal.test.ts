import { describe, expect, it } from "vitest";
import { parseTimelinePinProposal } from "../parseTimelinePinProposal";

describe("parseTimelinePinProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseTimelinePinProposal("nothing here").timelinePinProposals).toBeNull();
    });

    it("parses multiple beats from one array fence", () => {
        const content =
            '```timeline-pin-proposal\n[{"title":"The Founding","whenKind":"relative","relativeOffsetYears":-100},{"title":"The War","whenKind":"fuzzy","fuzzyPhrase":"a generation later"}]\n```';
        const result = parseTimelinePinProposal(content);
        expect(result.timelinePinProposals).toHaveLength(2);
        expect(result.timelinePinProposals?.[0]).toMatchObject({ title: "The Founding", whenKind: "relative", relativeOffsetYears: -100 });
    });

    it("drops items missing a title or a valid whenKind", () => {
        const content =
            '```timeline-pin-proposal\n[{"title":"","whenKind":"relative"},{"title":"Bad kind","whenKind":"nope"},{"title":"OK","whenKind":"civil","civilDate":"1200"}]\n```';
        const result = parseTimelinePinProposal(content);
        expect(result.timelinePinProposals).toEqual([{ title: "OK", blurb: undefined, whenKind: "civil", relativeOffsetYears: undefined, fuzzyPhrase: undefined, civilDate: "1200" }]);
    });

    it("returns null when every item is invalid", () => {
        const content = '```timeline-pin-proposal\n[{"title":""}]\n```';
        expect(parseTimelinePinProposal(content).timelinePinProposals).toBeNull();
    });

    it("returns null when the payload is not an array", () => {
        const content = '```timeline-pin-proposal\n{"title":"not an array"}\n```';
        expect(parseTimelinePinProposal(content).timelinePinProposals).toBeNull();
    });
});
