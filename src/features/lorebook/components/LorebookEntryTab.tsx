import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LorebookEntry } from "@/types/story";
import type { WorldBuildingSeed } from "@/types/worldbuilding";
import { LevelBadge } from "./LevelBadge";
import { LorebookEntryEditor } from "./LorebookEntryEditor";

interface LorebookEntryTabProps {
    entry: LorebookEntry;
    storyId?: string;
    seriesId?: string;
    onRefresh: () => void;
    isRefreshing: boolean;
    // Only ever set right after a WB-handoff "new" tab is promoted to a real entry tab
    // (LorebookPage.tsx carries it across that remount) — auto-starts the docked WB chat once
    // this tab has a stable entryId. See LorebookEntryEditor.tsx's WorldBuildingChatPanel.
    initialWorldBuildingSeed?: WorldBuildingSeed;
    onWorldBuildingSeedConsumed?: () => void;
}

// Full-width tab content for an entry opened from the card grid — same LorebookEntryEditor the
// Sheet uses (form + docked World-Building chat), just without Sheet chrome. Keyed on
// entry.id + entry.updatedAt by the caller (LorebookPage) so switching tabs, or a Refresh that
// pulls back changed data, always mounts a fresh form instead of an effect trying to resync
// react-hook-form's mount-time-only defaults.
export function LorebookEntryTab({
    entry,
    storyId,
    seriesId,
    onRefresh,
    isRefreshing,
    initialWorldBuildingSeed,
    onWorldBuildingSeedConsumed
}: LorebookEntryTabProps) {
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-6 pt-4 pb-2">
                <h2 className="text-lg font-semibold">{entry.name}</h2>
                <LevelBadge level={entry.level} />
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="h-8 w-8"
                    title="Refresh"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
            </div>
            <div className="flex-1 min-h-0">
                <LorebookEntryEditor
                    storyId={storyId}
                    seriesId={seriesId}
                    entry={entry}
                    initialWorldBuildingSeed={initialWorldBuildingSeed}
                    onWorldBuildingSeedConsumed={onWorldBuildingSeedConsumed}
                />
            </div>
        </div>
    );
}
