import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { lorebookApi } from "@/services/api/client";
import type { LorebookEntry } from "@/types/story";
import { LevelBadge } from "./LevelBadge";

const MAX_VISIBLE_TAGS = 3;

interface LorebookEntryRowProps {
    entry: LorebookEntry;
    showLevel: boolean;
    isEditable: boolean;
    onOpen: () => void;
    onToggleDisabled: () => void;
    onDelete: () => void;
    // Folder path crumb (B9, docs/Folders_Org_Design.md) — e.g. ["Cast", "Antagonists"].
    folderPath?: string[];
}

// Compact list row for Lorebook Browse's "List" density mode — see docs/Lorebook_Browse_Density_Design.md.
// Thumb · name · level badge · importance · up to 3 tag chips. No category chip, no description.
export function LorebookEntryRow({
    entry,
    showLevel,
    isEditable,
    onOpen,
    onToggleDisabled,
    onDelete,
    folderPath
}: LorebookEntryRowProps) {
    const visibleTags = entry.tags?.slice(0, MAX_VISIBLE_TAGS) ?? [];
    const hiddenTagCount = (entry.tags?.length ?? 0) - visibleTags.length;

    return (
        <Card
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen();
                }
            }}
            role="button"
            tabIndex={0}
            className={`group flex cursor-pointer items-center gap-2 rounded-md border-2 border-border px-3 py-2 shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${entry.isDisabled ? "opacity-60" : ""} ${!isEditable ? "opacity-75" : ""}`}
        >
            {entry.imageFilename && (
                <img
                    src={lorebookApi.imageUrl(entry.id)}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full object-cover border"
                />
            )}
            {showLevel && <LevelBadge level={entry.level} />}
            <span className="truncate font-medium text-sm">{entry.name}</span>
            {folderPath && folderPath.length > 0 && (
                <span className="hidden shrink-0 truncate text-xs text-muted-foreground/70 sm:inline max-w-[140px]">
                    {folderPath.join(" / ")}
                </span>
            )}
            {entry.metadata?.importance && (
                <Badge variant="outline" className="shrink-0 text-xs">
                    {entry.metadata.importance}
                </Badge>
            )}
            {entry.isDisabled && (
                <Badge variant="outline" className="shrink-0 bg-destructive/10 text-destructive text-xs">
                    Disabled
                </Badge>
            )}
            <div className="flex min-w-0 flex-1 flex-wrap gap-1 justify-end">
                {visibleTags.map(tag => (
                    <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary text-xs px-2 py-0.5 shrink-0">
                        {tag}
                    </Badge>
                ))}
                {hiddenTagCount > 0 && (
                    <Badge variant="secondary" className="text-xs px-2 py-0.5 shrink-0">
                        +{hiddenTagCount}
                    </Badge>
                )}
            </div>
            {isEditable && (
                <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={e => {
                            e.stopPropagation();
                            onToggleDisabled();
                        }}
                        title={entry.isDisabled ? "Enable entry" : "Disable entry"}
                    >
                        {entry.isDisabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={e => {
                            e.stopPropagation();
                            onDelete();
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </Card>
    );
}
