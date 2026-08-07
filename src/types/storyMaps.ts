// Story Maps v2 domain types (docs/Maps_V2_Sketch_Design.md) — the drawable sketch-canvas document
// (Excalidraw scene), distinct from src/types/storyMap.ts's L3 spatial relationship *graph*
// between location entries (deprecated in the UI by v2, left in the DB — see storyMaps' own
// schema.ts comment). `sceneJson` stays `unknown` at this layer deliberately: the backend has no
// business knowing Excalidraw's element shape, only that it's an opaque JSON blob it round-trips.

export interface StoryMapDocument {
    id: string;
    storyId: string;
    title: string;
    locationId: string | null;
    sceneJson: unknown;
    thumbnailFilename: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// MV5 — a model-proposed sketch (```map-sketch-proposal fence, chatContextService.ts's
// MAP_SKETCH_INSTRUCTIONS). Deliberately loose/partial, not Excalidraw's own element type — this
// is what the model emits as raw JSON (parseMapSketchProposal.ts validates the shape below), later
// converted to real Excalidraw elements via `convertToExcalidrawElements` inside MapCanvas.tsx's
// lazy chunk (implementation clarification c: the model emits an Element Skeleton directly, no
// custom intermediate DSL). Kept here rather than importing anything from @excalidraw/excalidraw
// so this type is usable from ChatInterface.tsx (eager) without pulling in Excalidraw's runtime.
export interface MapSketchElementSkeleton {
    type: "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line";
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    label?: string;
    points?: [number, number][];
}

export interface MapSketchProposal {
    title?: string;
    elements: MapSketchElementSkeleton[];
}
