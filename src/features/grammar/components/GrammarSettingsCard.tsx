import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    useGrammarSettingsQuery,
    useTestGrammarConnectionMutation,
    useUpdateGrammarSettingsMutation
} from "@/features/grammar/hooks/useGrammarSettingsQuery";

export function GrammarSettingsCard() {
    const { data: settings, isLoading } = useGrammarSettingsQuery();
    const updateMutation = useUpdateGrammarSettingsMutation();
    const testMutation = useTestGrammarConnectionMutation();
    const [serverUrlInput, setServerUrlInput] = useState<string | null>(null);
    const [languageInput, setLanguageInput] = useState<string | null>(null);

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

    const serverUrl = serverUrlInput ?? settings.serverUrl;
    const language = languageInput ?? settings.language;
    const isDirty = serverUrl !== settings.serverUrl || language !== settings.language;

    const handleSave = () => {
        updateMutation.mutate(
            { id: settings.id, data: { serverUrl, language } },
            {
                onSuccess: () => {
                    setServerUrlInput(null);
                    setLanguageInput(null);
                }
            }
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    Grammar Checker
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
                    <Label htmlFor="grammar-server-url">LanguageTool Server URL</Label>
                    <div className="flex gap-2">
                        <Input
                            id="grammar-server-url"
                            value={serverUrl}
                            onChange={event => setServerUrlInput(event.target.value)}
                            placeholder="http://localhost:8010"
                        />
                        <Button
                            variant="outline"
                            onClick={() => testMutation.mutate(serverUrl)}
                            disabled={testMutation.isPending || !serverUrl.trim()}
                        >
                            {testMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Test Connection
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Points at a self-hosted LanguageTool instance — the Docker Compose setup for this project
                        includes one by default at this address.
                    </p>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="grammar-language">Language</Label>
                    <Input
                        id="grammar-language"
                        value={language}
                        onChange={event => setLanguageInput(event.target.value)}
                        placeholder="auto"
                        className="max-w-[200px]"
                    />
                    <p className="text-xs text-muted-foreground">
                        A LanguageTool language code (e.g. <code>en-US</code>, <code>en-GB</code>) or{" "}
                        <code>auto</code> to detect it from each chapter's text.
                    </p>
                </div>

                <Button onClick={handleSave} disabled={!isDirty || updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Changes
                </Button>

                <p className="text-xs text-muted-foreground">
                    When enabled, spelling, grammar, and style issues are underlined directly in the Main Editor as
                    you write — click an underlined word for suggestions.
                </p>
            </CardContent>
        </Card>
    );
}
