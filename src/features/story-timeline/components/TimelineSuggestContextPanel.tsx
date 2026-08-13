import { Label } from "@/components/ui/label";
import { RemovableBadge } from "@/components/ui/RemovableBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { CATEGORIES } from "@/features/lorebook/components/form/entryFormUtils";
import { useTimelineSuggestSettingsQuery, useUpdateTimelineSuggestSettingsMutation } from "@/features/story-timeline/hooks/useStoryTimelineQuery";

interface TimelineSuggestContextPanelProps {
    storyId: string;
}

const titleCase = (value: string) => value.replace(/\b\w/g, c => c.toUpperCase());

// TL13 (docs/Story_Timeline_Design.md) — sheet body for the icon-rail "Suggest Pins Context"
// panel (TimelineTool.tsx), same SimpleSheet shell every other tool's rail panels use. Persisted
// via storyTimelineSuggestSettings (one row per story, get-or-create), not local component state.
//
// "Story Context" here mirrors ContextSelector.tsx's chat-side bucket of the same name — Chapter
// Summaries (toggle per chapter) + Chapter Content (add-picker for full chapter text) — just
// persisted per-story instead of re-picked every message. Lorebook Entries isn't repeated from
// that component since the category checkboxes below already cover Lorebook scope at a coarser
// grain.
export function TimelineSuggestContextPanel({ storyId }: TimelineSuggestContextPanelProps) {
    const { data: settings, isLoading } = useTimelineSuggestSettingsQuery(storyId);
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId);
    const updateMutation = useUpdateTimelineSuggestSettingsMutation(storyId);

    if (isLoading || !settings) {
        return <p className="text-xs text-muted-foreground p-4">Loading context settings…</p>;
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

    const toggleChapterSummary = (chapterId: string) => {
        const has = settings.includeChapterSummaryIds.includes(chapterId);
        const next = has
            ? settings.includeChapterSummaryIds.filter(id => id !== chapterId)
            : [...settings.includeChapterSummaryIds, chapterId];
        updateMutation.mutate({ includeChapterSummaryIds: next });
    };

    const addChapterContent = (chapterId: string) => {
        if (settings.includeChapterContentIds.includes(chapterId)) return;
        updateMutation.mutate({ includeChapterContentIds: [...settings.includeChapterContentIds, chapterId] });
    };

    const removeChapterContent = (chapterId: string) => {
        updateMutation.mutate({ includeChapterContentIds: settings.includeChapterContentIds.filter(id => id !== chapterId) });
    };

    return (
        <div className="space-y-5 pt-3">
            <section className="rounded-lg border border-border p-3 space-y-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Story Context</h4>

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

                {chapters.length > 0 && (
                    <div className="space-y-2">
                        <span className="text-sm font-medium">Chapter Summaries</span>
                        <div className="space-y-1.5">
                            {chapters.map(chapter => (
                                <div key={chapter.id} className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">
                                        Chapter {chapter.order}: {chapter.title}
                                    </span>
                                    <Switch
                                        checked={settings.includeChapterSummaryIds.includes(chapter.id)}
                                        onCheckedChange={() => toggleChapterSummary(chapter.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {chapters.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">Chapter Content</span>
                            <Select onValueChange={addChapterContent}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Add chapter..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {chapters
                                        .filter(ch => !settings.includeChapterContentIds.includes(ch.id))
                                        .map(chapter => (
                                            <SelectItem key={chapter.id} value={chapter.id}>
                                                Chapter {chapter.order}: {chapter.title}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {settings.includeChapterContentIds.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {settings.includeChapterContentIds.map(chapterId => {
                                    const chapter = chapters.find(ch => ch.id === chapterId);
                                    if (!chapter) return null;
                                    return (
                                        <RemovableBadge key={chapterId} onRemove={() => removeChapterContent(chapterId)}>
                                            Chapter {chapter.order}: {chapter.title}
                                        </RemovableBadge>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-border p-3 space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</h4>
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

            <section className="rounded-lg border border-border p-3 space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lorebook categories</h4>
                <div className="space-y-1.5">
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
    );
}
