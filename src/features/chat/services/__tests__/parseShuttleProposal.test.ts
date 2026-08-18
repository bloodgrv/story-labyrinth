import { describe, expect, it } from "vitest";
import { parseShuttleProposal } from "../parseShuttleProposal";

describe("parseShuttleProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseShuttleProposal("nothing here").proposal).toBeNull();
    });

    it("parses a valid shuttle proposal", () => {
        const content = '```shuttle-proposal\n{"destination":"research","question":"What year did the Bastille fall?"}\n```';
        expect(parseShuttleProposal(content).proposal).toEqual({
            destination: "research",
            question: "What year did the Bastille fall?"
        });
    });

    it("returns null when destination is not research", () => {
        const content = '```shuttle-proposal\n{"destination":"outline","question":"q"}\n```';
        expect(parseShuttleProposal(content).proposal).toBeNull();
    });

    it("returns null when question is blank", () => {
        const content = '```shuttle-proposal\n{"destination":"research","question":"   "}\n```';
        expect(parseShuttleProposal(content).proposal).toBeNull();
    });
});
