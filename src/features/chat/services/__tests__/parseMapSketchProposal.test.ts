import { describe, expect, it } from "vitest";
import { parseMapSketchProposal } from "../parseMapSketchProposal";

describe("parseMapSketchProposal", () => {
    it("returns null when there is no fence", () => {
        expect(parseMapSketchProposal("nothing here").mapSketchProposal).toBeNull();
    });

    it("parses valid elements and drops invalid ones", () => {
        const content =
            '```map-sketch-proposal\n{"title":"Camp","elements":[{"type":"rectangle","x":0,"y":0,"width":10,"height":10},{"type":"not-a-shape","x":1,"y":1}]}\n```';
        const result = parseMapSketchProposal(content);
        expect(result.mapSketchProposal).toEqual({
            title: "Camp",
            elements: [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10, text: undefined, label: undefined, points: undefined }]
        });
    });

    it("returns null when every element is invalid", () => {
        const content = '```map-sketch-proposal\n{"elements":[{"type":"nope","x":1,"y":1}]}\n```';
        expect(parseMapSketchProposal(content).mapSketchProposal).toBeNull();
    });

    it("validates points arrays for line/arrow elements", () => {
        const content =
            '```map-sketch-proposal\n{"elements":[{"type":"line","x":0,"y":0,"points":[[0,0],[10,10]]}]}\n```';
        const result = parseMapSketchProposal(content);
        expect(result.mapSketchProposal?.elements[0].points).toEqual([[0, 0], [10, 10]]);
    });
});
