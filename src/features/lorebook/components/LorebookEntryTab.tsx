import type { LorebookEntry } from "@/types/story";
import { LevelBadge } from "./LevelBadge";
import { LorebookEntryEditor } from "./LorebookEntryEditor";

interface LorebookEntryTabProps {
    entry: LorebookEntry;
    storyId?: string;
    seriesId?: string;
}

// Full-width tab content for an entry opened from the card grid — same LorebookEntryEditor the
// Sheet uses (form + docked World-Building chat), just without Sheet chrome. Keyed on entry.id
// by the caller (LorebookPage) so switching tabs always mounts a fresh form instead of an
// effect trying to resync react-hook-form's mount-time-only defaults.
export function LorebookEntryTab({ entry, storyId, seriesId }: LorebookEntryTabProps) {
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-6 pt-4 pb-2">
                <h2 className="text-lg font-semibold">{entry.name}</h2>
                <LevelBadge level={entry.level} />
            </div>
            <div className="flex-1 min-h-0">
                <LorebookEntryEditor storyId={storyId} seriesId={seriesId} entry={entry} />
            </div>
        </div>
    );
}
