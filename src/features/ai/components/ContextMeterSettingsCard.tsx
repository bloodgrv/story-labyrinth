import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAISettingsQuery, useUpdateContextMeterSettingsMutation } from "@/features/ai/hooks/useAISettingsQuery";

// Context/Token Meter (T4, docs/Context_Token_Meter_Design.md) — M0. contextWindowOverride wins
// over whatever AIModel.contextLength was fetched/guessed for the current default local model
// (design decision #5); soft-warn is off by default and only ever confirms before send, never a
// hard block (decision #7 / non-goal #2).
export function ContextMeterSettingsCard() {
    const { data: settings } = useAISettingsQuery();
    const updateMutation = useUpdateContextMeterSettingsMutation();

    const resolvedDefault = settings?.availableModels.find(m => m.id === settings?.defaultLocalModel)?.contextLength;

    const [overrideInput, setOverrideInput] = useState<string>(settings?.contextWindowOverride?.toString() ?? "");
    const [softWarnNearLimit, setSoftWarnNearLimit] = useState(settings?.softWarnNearLimit ?? false);
    const [thresholdPercent, setThresholdPercent] = useState(Math.round((settings?.softWarnThreshold ?? 0.9) * 100));

    const handleSaveOverride = () => {
        const parsed = overrideInput.trim() ? Number(overrideInput) : null;
        updateMutation.mutate({ contextWindowOverride: parsed && parsed > 0 ? parsed : null });
    };

    const handleToggleSoftWarn = (checked: boolean) => {
        setSoftWarnNearLimit(checked);
        updateMutation.mutate({ softWarnNearLimit: checked });
    };

    const handleSaveThreshold = () => {
        updateMutation.mutate({ softWarnThreshold: Math.min(0.99, Math.max(0.1, thresholdPercent / 100)) });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Context / Token Meter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="context-window-override">Context window override (tokens)</Label>
                    <div className="flex gap-2">
                        <Input
                            id="context-window-override"
                            type="number"
                            min={1}
                            placeholder={resolvedDefault ? String(resolvedDefault) : "e.g. 32768"}
                            value={overrideInput}
                            onChange={e => setOverrideInput(e.target.value)}
                        />
                        <Button onClick={handleSaveOverride} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {resolvedDefault
                            ? `Overrides the default local model's detected window (${resolvedDefault.toLocaleString()} tokens). Leave blank to use that value.`
                            : "Sets the window size used for the context meter on local chats. Leave blank to use the model's own reported value, when known."}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Switch id="soft-warn-near-limit" checked={softWarnNearLimit} onCheckedChange={handleToggleSoftWarn} />
                    <Label htmlFor="soft-warn-near-limit" className="font-normal">
                        Confirm before sending near the context limit
                    </Label>
                </div>

                {softWarnNearLimit && (
                    <div className="grid gap-2 pl-1">
                        <Label htmlFor="soft-warn-threshold">Warn at (% of window used)</Label>
                        <div className="flex gap-2 max-w-40">
                            <Input
                                id="soft-warn-threshold"
                                type="number"
                                min={10}
                                max={99}
                                value={thresholdPercent}
                                onChange={e => setThresholdPercent(Number(e.target.value))}
                                onBlur={handleSaveThreshold}
                            />
                            <span className="flex items-center text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This only asks for confirmation before sending — it never blocks the send outright.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
