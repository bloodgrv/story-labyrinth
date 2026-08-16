import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useGrammarSettingsQuery, useUpdateGrammarSettingsMutation } from "@/features/grammar/hooks/useGrammarSettingsQuery";
import type { GrammarDialect } from "@/types/grammarSettings";
import { GrammarMarkLegend } from "./GrammarMarkLegend";

const DIALECT_LABELS: Record<GrammarDialect, string> = {
    american: "American English",
    british: "British English",
    canadian: "Canadian English",
    australian: "Australian English",
    indian: "Indian English"
};

export function GrammarSettingsCard() {
    const { data: settings, isLoading } = useGrammarSettingsQuery();
    const updateMutation = useUpdateGrammarSettingsMutation();

    if (isLoading || !settings)
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Grammar Checker</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="h-4 w-4 animate-spin" />
                </CardContent>
            </Card>
        );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                        Grammar Checker
                        <GrammarMarkLegend />
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="grammar-enabled" className="text-sm font-normal text-muted-foreground">
                            Enable Grammar Checker
                        </Label>
                        <Switch
                            id="grammar-enabled"
                            checked={settings.enabled}
                            onCheckedChange={enabled => updateMutation.mutate({ id: settings.id, data: { enabled } })}
                        />
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="grammar-dialect">Dialect</Label>
                    <Select
                        value={settings.dialect}
                        onValueChange={dialect =>
                            updateMutation.mutate({ id: settings.id, data: { dialect: dialect as GrammarDialect } })
                        }
                    >
                        <SelectTrigger id="grammar-dialect" className="max-w-[220px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(DIALECT_LABELS) as GrammarDialect[]).map(dialect => (
                                <SelectItem key={dialect} value={dialect}>
                                    {DIALECT_LABELS[dialect]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Runs fully offline, in-process — no server, Docker container, or network connection needed.
                    </p>
                </div>

                <p className="text-xs text-muted-foreground">
                    When enabled, spelling, grammar, and style issues are underlined directly in the Main Editor as
                    you write — click an underlined word for suggestions.
                </p>
            </CardContent>
        </Card>
    );
}
