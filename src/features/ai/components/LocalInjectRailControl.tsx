import { Link } from "react-router";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    useAISettingsQuery,
    useApplyLocalInjectPresetMutation,
    useUpdateLocalInjectEnabledMutation
} from "@/features/ai/hooks/useAISettingsQuery";

const NONE_VALUE = "__none__";

// Local System Inject (T12) — LI3. Compact rail twin of LocalSystemInjectCard.tsx: toggle + preset
// dropdown only, no body editor or preset CRUD (design §4.2). Same global aiSettings mutations as
// Settings, so flipping either updates every surface. Visible on every desk chat regardless of the
// chat's own model — the toggle/preset are global state, not gated on the current provider (the
// inject itself only ever fires on local generations, per useGenerateWithPrompt.ts).
export function LocalInjectRailControl({ idPrefix }: { idPrefix: string }) {
    const { data: settings } = useAISettingsQuery();
    const updateEnabledMutation = useUpdateLocalInjectEnabledMutation();
    const applyPresetMutation = useApplyLocalInjectPresetMutation();

    if (!settings) return null;

    // Defensive fallback — see server/routes/ai.ts's fresh-row fix note; guards against any
    // future path that echoes back a partial settings object.
    const presets = settings.localInjectPresets ?? [];
    const activePresetId = settings.localInjectActivePresetId ?? null;

    return (
        <div className="flex items-center gap-2">
            <Switch
                id={`${idPrefix}-local-inject-enabled`}
                checked={settings.localInjectEnabled ?? false}
                onCheckedChange={checked => updateEnabledMutation.mutate(checked)}
            />
            <Label htmlFor={`${idPrefix}-local-inject-enabled`} className="text-sm font-normal">
                Local system inject
            </Label>
            <Select
                value={activePresetId ?? NONE_VALUE}
                onValueChange={value => applyPresetMutation.mutate(value === NONE_VALUE ? null : value)}
                disabled={presets.length === 0}
            >
                <SelectTrigger className="h-7 w-40 text-xs" title={presets.length === 0 ? "Add presets in Settings → Local" : undefined}>
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
            {presets.length === 0 && (
                <Link to="/settings?section=local" className="text-xs text-muted-foreground hover:text-foreground">
                    Add presets in Settings →
                </Link>
            )}
        </div>
    );
}
