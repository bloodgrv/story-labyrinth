import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStoriesQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { PlaybookPacksPanel } from "./PlaybookPacksPanel";

const GLOBAL_VALUE = "__global__";

// Settings' Writing Tools tab used to always pass storyId={null} here, showing only Shipped+Global
// packs — the "This story" section (story-specific overrides) was reachable only via the now-removed
// left-sidebar "Playbooks" tool. Rather than keep two differently-scoped surfaces users had to be
// taught apart, this wraps the same PlaybookPacksPanel with its own story picker so Settings alone
// covers every scope. Defaults to whatever story is currently open in the workspace (if any) since
// that's almost always what someone reaching Settings from inside a story wants to manage.
export function PlaybookPacksSettingsCard() {
    const { data: stories = [] } = useStoriesQuery();
    const { currentStoryId } = useStoryContext();
    const [storyId, setStoryId] = useState<string | null>(currentStoryId ?? null);

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Label htmlFor="playbook-story-picker" className="text-sm text-muted-foreground shrink-0">
                    Manage packs for
                </Label>
                <Select
                    value={storyId ?? GLOBAL_VALUE}
                    onValueChange={value => setStoryId(value === GLOBAL_VALUE ? null : value)}
                >
                    <SelectTrigger id="playbook-story-picker" className="w-64">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={GLOBAL_VALUE}>Global only (no story)</SelectItem>
                        {stories.map(story => (
                            <SelectItem key={story.id} value={story.id}>
                                {story.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <PlaybookPacksPanel storyId={storyId} />
        </div>
    );
}
