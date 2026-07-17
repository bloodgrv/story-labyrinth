import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMigrateFromMetadataMutation } from "../hooks/useStoryGraphQuery";

interface GraphMigrationBannerProps {
    storyId: string;
    // "legacy": nodes/edges may already exist, but unmigrated metadata.relationships were found.
    // "empty": no edges exist yet at all — same CTA, different framing since migration may yield 0.
    variant: "legacy" | "empty";
}

export function GraphMigrationBanner({ storyId, variant }: GraphMigrationBannerProps) {
    const migrateMutation = useMigrateFromMetadataMutation();

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-4 w-4 shrink-0" />
                {variant === "legacy"
                    ? "Some entries have legacy relationship data that hasn't been added to this graph yet."
                    : "No relationships yet — link entries by dragging between nodes, or migrate any legacy data."}
            </div>
            <Button size="sm" variant="outline" onClick={() => migrateMutation.mutate(storyId)} disabled={migrateMutation.isPending}>
                {migrateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Migrate legacy relationships
            </Button>
        </div>
    );
}
