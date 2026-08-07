// Maps v2 — MV4 layoutMd bridge (docs/Maps_V2_Sketch_Design.md). Deliberately loose/local typing
// (not importing anything from @excalidraw/excalidraw) so this stays usable from MapDetailPanel.tsx
// without pulling any Excalidraw runtime code out of MapCanvas.tsx's lazy chunk — a scene element
// is just plain JSON by the time it reaches here (map.sceneJson is opaque `unknown` at this layer
// throughout the feature, same posture as the backend).
interface SceneElementLike {
    id: string;
    type: string;
    x: number;
    y: number;
    text?: string;
    containerId?: string | null;
    isDeleted?: boolean;
}

// Dumb-but-honest one-way summary (implementation clarification b's spirit applied to the export
// direction too — no attempt at spatial/topological inference, just a reading-order list of what's
// on the canvas). Bound text (a label typed inside a shape) is attached to its container; a
// standalone text element gets its own line. Sorted top-to-bottom then left-to-right, the closest
// this gets to "read the sketch out loud."
export const sceneToMarkdown = (elements: unknown): string => {
    const list = (Array.isArray(elements) ? elements : []) as SceneElementLike[];
    const live = list.filter(el => el && !el.isDeleted);
    if (live.length === 0) return "";

    const boundTextByContainer = new Map<string, string>();
    for (const el of live) if (el.type === "text" && el.containerId) boundTextByContainer.set(el.containerId, el.text ?? "");

    const lines = live
        .filter(el => !(el.type === "text" && el.containerId)) // bound text folded into its container's line below
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map(el => {
            const label = el.type === "text" ? el.text : boundTextByContainer.get(el.id);
            const typeLabel = el.type.charAt(0).toUpperCase() + el.type.slice(1);
            return label ? `- ${typeLabel}: "${label}"` : `- ${typeLabel}`;
        });

    return lines.join("\n");
};
