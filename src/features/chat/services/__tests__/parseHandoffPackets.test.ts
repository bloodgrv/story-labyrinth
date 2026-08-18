import { describe, expect, it } from "vitest";
import { parseHandoffPackets } from "../parseHandoffPackets";

describe("parseHandoffPackets", () => {
    it("returns no packets when there is no fence", () => {
        expect(parseHandoffPackets("nothing here").packets).toEqual([]);
    });

    it("parses valid handoffs and filters out an invalid destination", () => {
        const content =
            '```handoff-packet\n{"handoffs":[{"destination":"outline","summary":"s1","detail":"d1"},{"destination":"not-a-real-desk","summary":"s2","detail":"d2"}]}\n```';
        const result = parseHandoffPackets(content);
        expect(result.packets).toEqual([{ destination: "outline", summary: "s1", detail: "d1" }]);
    });

    it("returns no packets on malformed JSON", () => {
        expect(parseHandoffPackets("```handoff-packet\n{bad\n```").packets).toEqual([]);
    });

    it("returns no packets when handoffs is not an array", () => {
        expect(parseHandoffPackets('```handoff-packet\n{"handoffs":"nope"}\n```').packets).toEqual([]);
    });
});
