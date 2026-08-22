import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    useAISettingsQuery,
    useApplyLocalInjectPresetMutation,
    useDeleteLocalInjectPresetMutation,
    useRenameLocalInjectPresetMutation,
    useSaveLocalInjectPresetAsNewMutation,
    useUpdateActiveLocalInjectPresetMutation,
    useUpdateLocalInjectBodyMutation,
    useUpdateLocalInjectEnabledMutation
} from "@/features/ai/hooks/useAISettingsQuery";

const NONE_VALUE = "__none__";

// Local System Inject (T12, docs/Local_System_Inject_Design.md) — LI1. Settings is the only full
// editor (toggle + preset library CRUD + body textarea); every desk chat's rail control only gets
// a toggle + preset dropdown (LI3), reading/writing these same global aiSettings fields.
export function LocalSystemInjectCard() {
    const { data: settings } = useAISettingsQuery();
    const updateEnabledMutation = useUpdateLocalInjectEnabledMutation();
    const updateBodyMutation = useUpdateLocalInjectBodyMutation();
    const applyPresetMutation = useApplyLocalInjectPresetMutation();
    const saveAsNewMutation = useSaveLocalInjectPresetAsNewMutation();
    const updateActiveMutation = useUpdateActiveLocalInjectPresetMutation();
    const renameMutation = useRenameLocalInjectPresetMutation();
    const deleteMutation = useDeleteLocalInjectPresetMutation();

    const [bodyInput, setBodyInput] = useState(settings?.localInjectBody ?? "");
    const [bodyDirty, setBodyDirty] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const [renameInput, setRenameInput] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);

    if (!settings) return null;

    const enabled = settings.localInjectEnabled;
    const presets = settings.localInjectPresets;
    const activePresetId = settings.localInjectActivePresetId ?? null;
    const activePreset = presets.find(p => p.id === activePresetId) ?? null;
    const body = bodyDirty ? bodyInput : settings.localInjectBody;

    const handleBodyChange = (value: string) => {
        setBodyInput(value);
        setBodyDirty(true);
    };

    const handleSaveBody = () => {
        updateBodyMutation.mutate(bodyInput, { onSuccess: () => setBodyDirty(false) });
    };

    const handleSelectPreset = (value: string) => {
        setBodyDirty(false);
        applyPresetMutation.mutate(value === NONE_VALUE ? null : value);
    };

    const handleSaveAsNew = () => {
        if (!newPresetName.trim()) return;
        // Save-as snapshots the currently active body — flush any unsaved edit first so the new
        // preset doesn't silently drop it.
        const bodyToSave = bodyDirty ? bodyInput : settings.localInjectBody;
        const run = () => {
            saveAsNewMutation.mutate(newPresetName, {
                onSuccess: () => {
                    setNewPresetName("");
                    setBodyDirty(false);
                }
            });
        };
        if (bodyDirty && bodyToSave !== settings.localInjectBody) {
            updateBodyMutation.mutate(bodyToSave, { onSuccess: run });
        } else run();
    };

    const handleStartRename = () => {
        if (!activePreset) return;
        setRenameInput(activePreset.name);
        setIsRenaming(true);
    };

    const handleConfirmRename = () => {
        if (!activePreset || !renameInput.trim()) return;
        renameMutation.mutate({ presetId: activePreset.id, name: renameInput }, { onSuccess: () => setIsRenaming(false) });
    };

    const handleDelete = () => {
        if (!activePreset) return;
        deleteMutation.mutate(activePreset.id);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Local system inject</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                    Global house rules (style, content policy, formatting quirks) prepended ahead of Story Labyrinth's normal
                    system context — only when generating with a <strong>local</strong> model. Cloud chats never see this.
                    Doesn't replace the app's own framing or proposal fences. See the Guide's{" "}
                    <strong>Local System Inject</strong> topic for the full recipe.
                </p>

                <div className="flex items-center gap-2">
                    <Switch
                        id="local-inject-enabled"
                        checked={enabled}
                        onCheckedChange={checked => updateEnabledMutation.mutate(checked)}
                    />
                    <Label htmlFor="local-inject-enabled" className="font-normal">
                        Enable for local models
                    </Label>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="local-inject-preset">Preset</Label>
                    <div className="flex gap-2">
                        <Select value={activePresetId ?? NONE_VALUE} onValueChange={handleSelectPreset}>
                            <SelectTrigger id="local-inject-preset" className="max-w-xs">
                                <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_VALUE}>None</SelectItem>
                                {presets.map(preset => (
                                    <SelectItem key={preset.id} value={preset.id}>
                                        {preset.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            onClick={() => updateActiveMutation.mutate()}
                            disabled={!activePreset || updateActiveMutation.isPending}
                        >
                            {updateActiveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update preset"}
                        </Button>
                        <Button variant="outline" onClick={handleStartRename} disabled={!activePreset}>
                            Rename
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleDelete}
                            disabled={!activePreset || deleteMutation.isPending}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    {isRenaming && activePreset && (
                        <div className="flex gap-2 max-w-sm">
                            <Input value={renameInput} onChange={e => setRenameInput(e.target.value)} placeholder="Preset name" />
                            <Button onClick={handleConfirmRename} disabled={renameMutation.isPending}>
                                Save
                            </Button>
                            <Button variant="ghost" onClick={() => setIsRenaming(false)}>
                                Cancel
                            </Button>
                        </div>
                    )}
                    <div className="flex gap-2 max-w-sm">
                        <Input
                            value={newPresetName}
                            onChange={e => setNewPresetName(e.target.value)}
                            placeholder="Save current body as a new preset…"
                        />
                        <Button onClick={handleSaveAsNew} disabled={!newPresetName.trim() || saveAsNewMutation.isPending}>
                            Save as…
                        </Button>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="local-inject-body">Body</Label>
                    <Textarea
                        id="local-inject-body"
                        rows={8}
                        value={body}
                        onChange={e => handleBodyChange(e.target.value)}
                        placeholder="e.g. Avoid em dashes. Keep dialogue terse. …"
                    />
                    <div className="flex items-center gap-2">
                        <Button onClick={handleSaveBody} disabled={!bodyDirty || updateBodyMutation.isPending}>
                            {updateBodyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        {bodyDirty && activePreset && (
                            <p className="text-xs text-muted-foreground">
                                Editing doesn't overwrite "{activePreset.name}" — use Update preset for that.
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
