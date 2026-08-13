import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CATEGORIES } from "@/features/lorebook/components/form/entryFormUtils";
import { useTimelineSuggestSettingsQuery, useUpdateTimelineSuggestSettingsMutation } from "@/features/story-timeline/hooks/useStoryTimelineQuery";

interface TimelineSuggestContextPanelProps {
    storyId: string;
}

const titleCase = (value: string) => value.replace(/\b\w/g, c => c.toUpperCase());

// TL13 (docs/Story_Timeline_Design.md) — always-open right rail, same "Context & memory" toggle
// vocabulary as ChatContextPanelContent.tsx but story-scoped rather than chat-scoped: the
// timeline_suggest_pins job reads a story's whole visible Lorebook + Notes + synopsis with no
// selection today, so this is the first control over what specifically it sees. Persisted via
// storyTimelineSuggestSettings (one row per story, get-or-create), not local component state, so
// the choice survives a reload/revisit.
export function TimelineSuggestContextPanel({ storyId }: TimelineSuggestContextPanelProps) {
    const { data: settings, isLoading } = useTimelineSuggestSettingsQuery(storyId);
    const updateMutation = useUpdateTimelineSuggestSettingsMutation(storyId);

    if (isLoading || !settings) {
        return (
            <div className="w-72 shrink-0 border-l p-4">
                <p className="text-xs text-muted-foreground">Loading context settings…</p>
            </div>
        );
    }

    // null (unrestricted) displays as "every category checked" — toggling one off switches to an
    // explicit array; toggling the last remaining category back on collapses back to null so the
    // stored state stays "unrestricted" rather than an incidentally-full explicit list.
    const selectedCategories = new Set(settings.includeCategories ?? CATEGORIES);

    const toggleCategory = (category: string, checked: boolean) => {
        const next = new Set(selectedCategories);
        if (checked) next.add(category);
        else next.delete(category);
        const asArray = [...next];
        updateMutation.mutate({ includeCategories: asArray.length === CATEGORIES.length ? null : asArray });
    };

    return (
        <div className="w-72 shrink-0 border-l flex flex-col h-full">
            <div className="p-4 border-b shrink-0">
                <h3 className="text-sm font-semibold">Suggest Pins Context</h3>
                <p className="text-xs text-muted-foreground mt-1">What "Suggest pins" reads from this story.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <section>
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Story Context</h4>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="suggest-include-synopsis"
                            checked={settings.includeSynopsis}
                            onCheckedChange={checked => updateMutation.mutate({ includeSynopsis: checked })}
                        />
                        <Label htmlFor="suggest-include-synopsis" className="text-sm font-normal">
                            Include story synopsis
                        </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Background only — never a source it proposes beats from directly.</p>
                </section>

                <section>
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Notes</h4>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="suggest-include-notes"
                            checked={settings.includeNotes}
                            onCheckedChange={checked => updateMutation.mutate({ includeNotes: checked })}
                        />
                        <Label htmlFor="suggest-include-notes" className="text-sm font-normal">
                            Include Notes
                        </Label>
                    </div>
                </section>

                <section>
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Lorebook categories</h4>
                    <div className="space-y-2">
                        {CATEGORIES.map(category => (
                            <div key={category} className="flex items-center gap-2">
                                <Switch
                                    id={`suggest-category-${category}`}
                                    checked={selectedCategories.has(category)}
                                    onCheckedChange={checked => toggleCategory(category, checked)}
                                />
                                <Label htmlFor={`suggest-category-${category}`} className="text-sm font-normal">
                                    {titleCase(category)}
                                </Label>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
