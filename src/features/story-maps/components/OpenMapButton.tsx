import { Loader2, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useCreateStoryMapDocumentMutation, useMapForLocationQuery } from "@/features/story-maps/hooks/useStoryMapsQuery";

interface OpenMapButtonProps {
    storyId: string;
    locationId: string;
    locationName: string;
}

// MV3 (docs/Maps_V2_Sketch_Design.md) — "from location Open map" create flow. Lives on the
// location entry editor (RawEntryFields.tsx), not gated by L4's codexEnabled/"Track Place State"
// — map ownership is orthogonal to place-Codex versioning, a location can have either, both, or
// neither.
export function OpenMapButton({ storyId, locationId, locationName }: OpenMapButtonProps) {
    const { data: existingMap, isLoading } = useMapForLocationQuery(storyId, locationId);
    const createMutation = useCreateStoryMapDocumentMutation(storyId);
    const { setCurrentTool, setPendingMapId } = useStoryContext();

    const openMap = (mapId: string) => {
        setPendingMapId(mapId);
        setCurrentTool("story-map");
    };

    const handleClick = () => {
        if (existingMap) {
            openMap(existingMap.id);
            return;
        }
        createMutation.mutate({ title: locationName, locationId }, { onSuccess: map => openMap(map.id) });
    };

    return (
        <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isLoading || createMutation.isPending}>
            {isLoading || createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapIcon className="h-4 w-4 mr-2" />}
            {existingMap ? "Open map" : "Create map for this location"}
        </Button>
    );
}
