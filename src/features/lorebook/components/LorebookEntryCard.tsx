import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lorebookApi } from "@/services/api/client";
import type { LorebookEntry } from "@/types/story";
import { LevelBadge } from "./LevelBadge";

interface LorebookEntryCardProps {
    entry: LorebookEntry;
    showLevel: boolean;
    isEditable: boolean;
    onOpen: () => void;
    onToggleDisabled: () => void;
    onDelete: () => void;
}

// Card grid tile for Lorebook Browse's "Cards" density mode — see docs/Lorebook_Browse_Density_Design.md.
export function LorebookEntryCard({
    entry,
    showLevel,
    isEditable,
    onOpen,
    onToggleDisabled,
    onDelete
}: LorebookEntryCardProps) {
    return (
        <Card
            onClick={onOpen}
            className={`cursor-pointer border-2 border-border shadow-sm transition-colors hover:border-primary/50 ${entry.isDisabled ? "opacity-60" : ""} ${!isEditable ? "opacity-75" : ""}`}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                    {entry.imageFilename && (
                        <img
                            src={lorebookApi.imageUrl(entry.id)}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full object-cover border"
                        />
                    )}
                    {showLevel && <LevelBadge level={entry.level} />}
                    <CardTitle className="text-lg font-semibold truncate">{entry.name}</CardTitle>
                </div>
                {isEditable && (
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
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
                            onClick={e => {
                                e.stopPropagation();
                                onDelete();
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2 mb-2">
                    <Badge variant="secondary">{entry.category}</Badge>
                    {entry.metadata?.importance && <Badge variant="outline">{entry.metadata.importance}</Badge>}
                    {entry.isDisabled && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive">
                            Disabled
                        </Badge>
                    )}
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                    {entry.tags?.map(tag => (
                        <Badge key={tag} variant="secondary" className="bg-primary/10 text-xs px-2 py-0.5">
                            {tag}
                        </Badge>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3">{entry.description}</p>
            </CardContent>
        </Card>
    );
}
