import { $getSelection, $isRangeSelection } from "lexical";
import { Loader2, Sparkles } from "lucide-react";
import { attemptPromise } from "@jfdi/attempt";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getActiveChapterEditor } from "@/lib/activeChapterEditorStore";
import {
    useHumanizerSettingsQuery,
    useUpdateHumanizerSettingsMutation
} from "@/features/humanizer/hooks/useHumanizerSettingsQuery";
import { useHumanizeMutation } from "@/features/humanizer/hooks/useHumanizeMutation";
import { HUMANIZER_INTENSITIES } from "@/types/humanizerSettings";
import type { HumanizerIntensity } from "@/types/humanizerSettings";
import {
    useAutoHumanizerSettingsQuery,
    useUpdateAutoHumanizerSettingsMutation
} from "@/features/auto-humanizer/hooks/useAutoHumanizerSettingsQuery";
import { useActiveChapterSelection } from "@/features/auto-humanizer/hooks/useActiveChapterSelection";
import { AutoHumanizerFields } from "./AutoHumanizerFields";

interface EditorHumanizeSheetProps {
    chapterId: string;
}

// Editor right-rail "Humanize" sheet (AH8, docs/Auto_Humanizer_Design.md) — one sheet, two
// sections, both bound to the exact same query/mutation hooks the Settings cards use (no
// duplicate persistence). Section A (Manual) mirrors the floating toolbar's Humanize button —
// same useHumanizeMutation/endpoint, just sourcing the editor via getActiveChapterEditor since
// this sheet is outside the Lexical composer tree. Section B (Auto) reuses AutoHumanizerFields
// verbatim.
export function EditorHumanizeSheet({ chapterId }: EditorHumanizeSheetProps) {
    const { data: manualSettings } = useHumanizerSettingsQuery();
    const updateManualMutation = useUpdateHumanizerSettingsMutation();
    const humanizeMutation = useHumanizeMutation();

    const { data: autoSettings } = useAutoHumanizerSettingsQuery();
    const updateAutoMutation = useUpdateAutoHumanizerSettingsMutation();

    const hasSelection = useActiveChapterSelection(chapterId);

    const handleHumanizeSelection = async () => {
        const editor = getActiveChapterEditor(chapterId);
        if (!editor) return;

        let selectedText = "";
        editor.getEditorState().read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selectedText = selection.getTextContent();
        });
        if (!selectedText) {
            toast.error("No text selected");
            return;
        }

        const [err, result] = await attemptPromise(() => humanizeMutation.mutateAsync(selectedText));
        if (err) {
            toast.error("Failed to humanize text");
            return;
        }
        if (!result.success || !result.text) {
            toast.error(result.message ?? "Failed to humanize text");
            return;
        }

        editor.update(() => {
            const currentSelection = $getSelection();
            if ($isRangeSelection(currentSelection)) currentSelection.insertText(result.text as string);
        });
        toast.success("Text humanized");
    };

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <h3 className="text-sm font-semibold">Manual Humanizer</h3>
                {manualSettings ? (
                    <>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="humanize-sheet-manual-enabled" className="text-sm font-normal">
                                Enable Humanizer
                            </Label>
                            <Switch
                                id="humanize-sheet-manual-enabled"
                                checked={manualSettings.enabled}
                                onCheckedChange={enabled =>
                                    updateManualMutation.mutate({ id: manualSettings.id, data: { enabled } })
                                }
                            />
                        </div>
                        {manualSettings.enabled ? (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="humanize-sheet-manual-intensity">Intensity</Label>
                                    <Select
                                        value={manualSettings.intensity}
                                        onValueChange={intensity =>
                                            updateManualMutation.mutate({
                                                id: manualSettings.id,
                                                data: { intensity: intensity as HumanizerIntensity }
                                            })
                                        }
                                    >
                                        <SelectTrigger id="humanize-sheet-manual-intensity">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {HUMANIZER_INTENSITIES.map(level => (
                                                <SelectItem key={level.id} value={level.id}>
                                                    {level.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button
                                    size="sm"
                                    disabled={!hasSelection || humanizeMutation.isPending}
                                    onClick={handleHumanizeSelection}
                                >
                                    {humanizeMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4 mr-1" />
                                    )}
                                    Humanize selection
                                </Button>
                                {!hasSelection && (
                                    <p className="text-xs text-muted-foreground">
                                        Select some text in the chapter to enable this.
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Or use Humanize on the floating toolbar when text is selected.
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Enable Humanizer to rewrite selected text on demand.
                            </p>
                        )}
                    </>
                ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                )}
            </section>

            <section className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold">Auto Humanizer</h3>
                {autoSettings ? (
                    <AutoHumanizerFields
                        settings={autoSettings}
                        idPrefix="humanize-sheet-auto"
                        onChange={patch => updateAutoMutation.mutate({ id: autoSettings.id, data: patch })}
                    />
                ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                )}
            </section>
        </div>
    );
}
