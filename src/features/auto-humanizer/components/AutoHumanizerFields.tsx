import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HUMANIZER_INTENSITIES, HUMANIZER_INTENSITY_MAP } from "@/types/humanizerSettings";
import type { HumanizerIntensity } from "@/types/humanizerSettings";
import { AUTO_HUMANIZER_MODES, AUTO_HUMANIZER_TONES } from "@/types/autoHumanizerSettings";
import type { AutoHumanizerMode, AutoHumanizerSettings, AutoHumanizerTone } from "@/types/autoHumanizerSettings";

interface AutoHumanizerFieldsProps {
    settings: AutoHumanizerSettings;
    onChange: (patch: Partial<AutoHumanizerSettings>) => void;
    idPrefix: string;
}

// Pure form — no data fetching/mutation of its own. Rendered by both AutoHumanizerSettingsCard
// (Settings > Writing tools) and EditorHumanizeSheet's Section B, both bound to the exact same
// query/mutation hooks so the two surfaces can never desync (design's "no duplicate persistence").
export function AutoHumanizerFields({ settings, onChange, idPrefix }: AutoHumanizerFieldsProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label htmlFor={`${idPrefix}-enabled`} className="text-sm font-medium">
                    Enable Auto Humanizer
                </Label>
                <Switch
                    id={`${idPrefix}-enabled`}
                    checked={settings.enabled}
                    onCheckedChange={enabled => onChange({ enabled })}
                />
            </div>

            <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-mode`}>Mode</Label>
                <Select value={settings.mode} onValueChange={mode => onChange({ mode: mode as AutoHumanizerMode })}>
                    <SelectTrigger id={`${idPrefix}-mode`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {AUTO_HUMANIZER_MODES.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {AUTO_HUMANIZER_MODES.find(m => m.id === settings.mode)?.description}
                </p>
            </div>

            <div className="grid gap-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor={`${idPrefix}-threshold`}>AI score threshold</Label>
                    <span className="text-sm text-muted-foreground">{settings.aiScoreThreshold}</span>
                </div>
                <Slider
                    id={`${idPrefix}-threshold`}
                    min={0}
                    max={100}
                    step={5}
                    disabled={settings.mode === "always"}
                    value={[settings.aiScoreThreshold]}
                    onValueChange={([value]) => onChange({ aiScoreThreshold: value })}
                />
                <p className="text-xs text-muted-foreground">
                    Only rewrite text scoring at or above this. Ignored in "Always rewrite" mode.
                </p>
            </div>

            <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-intensity`}>Intensity</Label>
                <Select
                    value={settings.intensity}
                    onValueChange={intensity => onChange({ intensity: intensity as HumanizerIntensity })}
                >
                    <SelectTrigger id={`${idPrefix}-intensity`}>
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
                <p className="text-xs text-muted-foreground">{HUMANIZER_INTENSITY_MAP[settings.intensity].description}</p>
            </div>

            <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-tone`}>Tone</Label>
                <Select value={settings.tone} onValueChange={tone => onChange({ tone: tone as AutoHumanizerTone })}>
                    <SelectTrigger id={`${idPrefix}-tone`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {AUTO_HUMANIZER_TONES.map(t => (
                            <SelectItem key={t.id} value={t.id}>
                                {t.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {settings.tone === "custom" && (
                    <Textarea
                        id={`${idPrefix}-custom-tone`}
                        placeholder={"Describe the register you want (e.g. \"terse, hard-boiled noir narration\")"}
                        value={settings.customToneDescription}
                        onChange={e => onChange({ customToneDescription: e.target.value })}
                        rows={2}
                    />
                )}
            </div>

            <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-min-chars`}>Minimum characters</Label>
                <Input
                    id={`${idPrefix}-min-chars`}
                    type="number"
                    min={0}
                    value={settings.minChars}
                    onChange={e => onChange({ minChars: Number(e.target.value) || 0 })}
                    className="w-32"
                />
                <p className="text-xs text-muted-foreground">Text shorter than this skips the pipeline entirely.</p>
            </div>

            <p className="text-xs text-muted-foreground">
                When on, accepted AI prose is filtered before it hits the chapter.
            </p>
        </div>
    );
}
