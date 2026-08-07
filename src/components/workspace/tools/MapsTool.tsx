import { useEffect, useState } from "react";
import { MapDetailPanel } from "@/features/story-maps/components/MapDetailPanel";
import { MapsListPanel } from "@/features/story-maps/components/MapsListPanel";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { MapSketchElementSkeleton } from "@/types/storyMaps";

// Maps v2 (MV1, docs/Maps_V2_Sketch_Design.md) — supersedes StoryMapTool.tsx (the L3 spatial
// relationship graph) in the sidebar's "story-map" slot (id kept per decision #4/implementation
// clarification d, only the label/component changed — see Sidebar.tsx/toolLabels.ts). The old
// graph tool/components are left on disk unreferenced rather than deleted — full leftover cleanup
// is MV7's explicit job, not this slice's (decision #8).
export function MapsTool() {
    const { currentStoryId, pendingMapId, setPendingMapId, pendingMapSketch, setPendingMapSketch } = useStoryContext();
    const [openMapId, setOpenMapId] = useState<string | null>(null);
    const [seedSkeleton, setSeedSkeleton] = useState<MapSketchElementSkeleton[] | null>(null);

    // MV3/MV5 — a location lore entry's "Open map" affordance (MV3) or an accepted
    // ```map-sketch-proposal (MV5, ChatInterface.tsx's handleAcceptMapSketch) sets one of these
    // then switches to this tool (StoryContext.setCurrentTool("story-map")); consume once on
    // arrival, same one-shot pattern as useLorebookPendingHandoffs' pendingLorebookEntryId.
    // pendingMapSketch takes priority since it also implies "open this map" — MV5 never sets both.
    useEffect(() => {
        if (pendingMapSketch) {
            setOpenMapId(pendingMapSketch.mapId);
            setSeedSkeleton(pendingMapSketch.elements);
            setPendingMapSketch(null);
            return;
        }
        if (pendingMapId) {
            setOpenMapId(pendingMapId);
            setPendingMapId(null);
        }
    }, [pendingMapSketch, setPendingMapSketch, pendingMapId, setPendingMapId]);

    if (!currentStoryId) return null;

    if (openMapId) {
        return (
            <MapDetailPanel
                storyId={currentStoryId}
                mapId={openMapId}
                seedSkeleton={seedSkeleton ?? undefined}
                onBack={() => {
                    setOpenMapId(null);
                    setSeedSkeleton(null);
                }}
                onDeleted={() => {
                    setOpenMapId(null);
                    setSeedSkeleton(null);
                }}
            />
        );
    }

    return <MapsListPanel storyId={currentStoryId} onOpenMap={setOpenMapId} />;
}
