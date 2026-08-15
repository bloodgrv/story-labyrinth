import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    useAutoHumanizerSettingsQuery,
    useUpdateAutoHumanizerSettingsMutation
} from "@/features/auto-humanizer/hooks/useAutoHumanizerSettingsQuery";
import { AutoHumanizerFields } from "./AutoHumanizerFields";

export function AutoHumanizerSettingsCard() {
    const { data: settings, isLoading } = useAutoHumanizerSettingsQuery();
    const updateMutation = useUpdateAutoHumanizerSettingsMutation();

    if (isLoading || !settings)
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Auto Humanizer</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="h-4 w-4 animate-spin" />
                </CardContent>
            </Card>
        );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Auto Humanizer</CardTitle>
            </CardHeader>
            <CardContent>
                <AutoHumanizerFields
                    settings={settings}
                    idPrefix="auto-humanizer-settings"
                    onChange={patch => updateMutation.mutate({ id: settings.id, data: patch })}
                />
                <p className="text-xs text-muted-foreground mt-4">
                    Runs automatically when AI prose is accepted into a chapter — a separate pipeline from the
                    on-demand Humanizer above. Uses the default AI connection unless a dedicated endpoint is set
                    for it in Feature Endpoints.
                </p>
            </CardContent>
        </Card>
    );
}
