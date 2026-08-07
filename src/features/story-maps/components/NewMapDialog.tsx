import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocationEntriesQuery } from "@/features/story-maps/hooks/useLocationEntriesQuery";
import { useCreateStoryMapDocumentMutation } from "@/features/story-maps/hooks/useStoryMapsQuery";

interface NewMapDialogProps {
    storyId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (mapId: string) => void;
}

// Sentinel for the Select's "no link" option — Radix Select doesn't allow an empty-string
// item value (reserved for clearing selection internally).
const NO_LOCATION = "__none__";

// MV3 (docs/Maps_V2_Sketch_Design.md) — free map (no selection) or link-to-location, the "create
// flows" slice's other entry point being the location entry's own "Open map" affordance
// (OpenMapButton.tsx), which bypasses this dialog entirely.
export function NewMapDialog({ storyId, open, onOpenChange, onCreated }: NewMapDialogProps) {
    const [title, setTitle] = useState("");
    const [locationId, setLocationId] = useState<string>(NO_LOCATION);
    const { data: locations } = useLocationEntriesQuery(open ? storyId : null);
    const createMutation = useCreateStoryMapDocumentMutation(storyId);

    const handleCreate = () => {
        if (!title.trim()) return;
        createMutation.mutate(
            { title: title.trim(), locationId: locationId === NO_LOCATION ? null : locationId },
            {
                onSuccess: map => {
                    setTitle("");
                    setLocationId(NO_LOCATION);
                    onOpenChange(false);
                    onCreated(map.id);
                }
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New map</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="new-map-title">Title</Label>
                    <Input
                        id="new-map-title"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. Safehouse B-4, Front lines — Book 2"
                        onKeyDown={e => {
                            if (e.key === "Enter") handleCreate();
                        }}
                        autoFocus
                    />
                </div>
                <div className="space-y-2">
                    <Label>Link to a location (optional)</Label>
                    <Select value={locationId} onValueChange={setLocationId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Free story map" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_LOCATION}>Free story map (no location)</SelectItem>
                            {locations?.map(entry => (
                                <SelectItem key={entry.id} value={entry.id}>
                                    {entry.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={!title.trim() || createMutation.isPending}>
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
