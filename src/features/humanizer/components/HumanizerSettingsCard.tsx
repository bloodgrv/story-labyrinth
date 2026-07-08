import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    useHumanizerSettingsQuery,
    useUpdateHumanizerSettingsMutation
} from "@/features/humanizer/hooks/useHumanizerSettingsQuery";
import { HUMANIZER_INTENSITIES, HUMANIZER_INTENSITY_MAP } from "@/types/humanizerSettings";
import type { HumanizerIntensity } from "@/types/humanizerSettings";

export function HumanizerSettingsCard() {
    const { data: settings, isLoading } = useHumanizerSettingsQuery();
    const updateMutation = useUpdateHumanizerSettingsMutation();

    if (isLoading || !settings)
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Humanizer</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="h-4 w-4 animate-spin" />
                </CardContent>
            </Card>
        );

    const handleIntensityChange = (intensity: string) => {
        updateMutation.mutate({ id: settings.id, data: { intensity: intensity as HumanizerIntensity } });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    Humanizer
                    <div className="flex items-center gap-2">
                        <Label htmlFor="humanizer-enabled" className="text-sm font-normal text-muted-foreground">
                            Enable Humanizer
                        </Label>
                        <Switch
                            id="humanizer-enabled"
                            checked={settings.enabled}
                            onCheckedChange={enabled => updateMutation.mutate({ id: settings.id, data: { enabled } })}
                        />
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="humanizer-intensity">Intensity</Label>
                    <Select value={settings.intensity} onValueChange={handleIntensityChange}>
                        <SelectTrigger id="humanizer-intensity">
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
                    <p className="text-xs text-muted-foreground">
                        {HUMANIZER_INTENSITY_MAP[settings.intensity].description}
                    </p>
                </div>

                <p className="text-xs text-muted-foreground">
                    When enabled, select any text in the Main Editor and click <strong>Humanize</strong> in the
                    floating toolbar to rewrite it. Uses the default AI connection unless a dedicated endpoint is
                    set for it in Feature Endpoints.
                </p>
            </CardContent>
        </Card>
    );
}
