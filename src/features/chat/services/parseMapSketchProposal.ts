import { attempt } from "@jfdi/attempt";
import type { MapSketchElementSkeleton, MapSketchProposal } from "@/types/storyMaps";

const MAP_SKETCH_PROPOSAL_FENCE = /```map-sketch-proposal\s*\n([\s\S]*?)```/;

const VALID_TYPES = new Set(["rectangle", "ellipse", "diamond", "text", "arrow", "line"]);

const isValidPoints = (value: unknown): value is [number, number][] =>
    Array.isArray(value) && value.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number");

const toElementSkeleton = (value: unknown): MapSketchElementSkeleton | null => {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.type !== "string" || !VALID_TYPES.has(record.type)) return null;
    if (typeof record.x !== "number" || typeof record.y !== "number") return null;

    return {
        type: record.type as MapSketchElementSkeleton["type"],
        x: record.x,
        y: record.y,
        width: typeof record.width === "number" ? record.width : undefined,
        height: typeof record.height === "number" ? record.height : undefined,
        text: typeof record.text === "string" ? record.text : undefined,
        label: typeof record.label === "string" ? record.label : undefined,
        points: isValidPoints(record.points) ? record.points : undefined
    };
};

// Extracts a model-emitted ```map-sketch-proposal fenced JSON block from a World-Building chat
// reply (MV5, docs/Maps_V2_Sketch_Design.md — see chatContextService.ts's MAP_SKETCH_INSTRUCTIONS).
// Mirrors parsePsychProposal.ts/parsePlaceSheetProposal.ts exactly: single fence per reply, never
// persisted server-side — ephemeral until the user accepts (ChatInterface.tsx's
// handleAcceptMapSketch, which resolves/creates the anchor location's map and applies a full-scene
// replace) or rejects (discarded). Per-element validation mirrors the loose skeleton shape
// `convertToExcalidrawElements` itself expects — anything malformed is dropped rather than
// crashing the whole proposal, same defensive posture as every other fence parser here.
export const parseMapSketchProposal = (content: string): { cleanedContent: string; mapSketchProposal: MapSketchProposal | null } => {
    const match = content.match(MAP_SKETCH_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, mapSketchProposal: null };

    const cleanedContent = content.replace(MAP_SKETCH_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, mapSketchProposal: null };

    const record = parsed as Record<string, unknown>;
    const rawElements = Array.isArray(record.elements) ? record.elements : [];
    const elements = rawElements.map(toElementSkeleton).filter((el): el is MapSketchElementSkeleton => el !== null);
    if (elements.length === 0) return { cleanedContent, mapSketchProposal: null };

    const title = typeof record.title === "string" ? record.title : undefined;
    return { cleanedContent, mapSketchProposal: { title, elements } };
};
