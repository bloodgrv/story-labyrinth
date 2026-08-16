import { Loader2, Map as MapIcon, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocationEntriesQuery } from "@/features/story-maps/hooks/useLocationEntriesQuery";
import { useStoryMapDocumentsQuery } from "@/features/story-maps/hooks/useStoryMapsQuery";
import { NewMapDialog } from "./NewMapDialog";

interface MapsListPanelProps {
    storyId: string;
    onOpenMap: (mapId: string) => void;
}

// MV1 shell + MV3 metadata (docs/Maps_V2_Sketch_Design.md) — list + empty state + create (free or
// location-linked, MV3). Thumbnails aren't in yet (no canvas-export wiring). Location badges
// resolve real names via useLocationEntriesQuery rather than a generic "Location-linked" label.
// This establishes the list surface the old sidebar "Story Map" graph tool used to occupy
// (decision #3/#4 — same slot, new job). Owns its own scroll region (`h-full overflow-y-auto`)
// since MV2 made the parent tool shell bounded-height for the detail view's Excalidraw canvas —
// see MainContent.tsx's needsBoundedHeight.
export function MapsListPanel({ storyId, onOpenMap }: MapsListPanelProps) {
    const { data: maps, isLoading } = useStoryMapDocumentsQuery(storyId);
    const { data: locations } = useLocationEntriesQuery(storyId);
    const locationNameById = new Map((locations ?? []).map(entry => [entry.id, entry.name]));
    const [newMapOpen, setNewMapOpen] = useState(false);

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 max-w-4xl mx-auto space-y-4">
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle>Maps</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Sketch places at any scale — a room, a village, a continent — and nudge the boxes yourself or let AI
                                draft a first pass.
                            </p>
                        </div>
                        <Button variant="gradient" size="sm" onClick={() => setNewMapOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            New map
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : !maps || maps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12 text-center text-muted-foreground">
                                <MapIcon className="h-8 w-8 opacity-50" />
                                <p className="text-sm font-medium">No sketch maps yet</p>
                                <p className="text-xs max-w-sm">
                                    Create one to start drawing — a safehouse floor plan, a city, or a whole continent.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y rounded-md border">
                                {maps.map(map => (
                                    <button
                                        key={map.id}
                                        onClick={() => onOpenMap(map.id)}
                                        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="min-w-0 space-y-1">
                                            <span className="text-sm font-medium">{map.title}</span>
                                            {map.locationId && (
                                                <Badge variant="secondary" className="ml-2 gap-1 text-[10px]">
                                                    <MapPin className="h-3 w-3" />
                                                    {locationNameById.get(map.locationId) ?? "Location-linked"}
                                                </Badge>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground shrink-0">{new Date(map.updatedAt).toLocaleString()}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <NewMapDialog storyId={storyId} open={newMapOpen} onOpenChange={setNewMapOpen} onCreated={onOpenMap} />
            </div>
        </div>
    );
}
