import { AlertTriangle, ExternalLink, Loader2, Play, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VoiceCombobox } from "@/features/tts/components/VoiceCombobox";
import {
    useRefreshTtsVoicesMutation,
    useTestTtsConnectionMutation,
    useTtsSettingsQuery,
    useUpdateTtsSettingsMutation
} from "@/features/tts/hooks/useTtsSettingsQuery";
import { useTtsPlayback } from "@/features/tts/hooks/useTtsPlayback";
import { TTS_PROVIDER_MAP, TTS_PROVIDERS } from "@/types/ttsSettings";
import type { TtsProvider } from "@/types/ttsSettings";

const PREVIEW_TEXT = "This is a preview of the selected voice.";

export function TtsSettingsCard() {
    const { data: settings, isLoading } = useTtsSettingsQuery();
    const updateMutation = useUpdateTtsSettingsMutation();
    const testMutation = useTestTtsConnectionMutation();
    const refreshVoicesMutation = useRefreshTtsVoicesMutation();
    const { isGenerating: isPreviewGenerating, isPlaying: isPreviewPlaying, speak, stop } = useTtsPlayback();

    const activeProvider = (settings?.activeProvider ?? "speechify") as TtsProvider;
    // B31 — GET no longer echoes the raw key (owner-only route now, but redacted regardless as
    // defense in depth); `hasApiKey` is all the UI gets, so the input always starts empty rather
    // than pre-filled with a value that's no longer available.
    const hasApiKey = settings?.providers?.[activeProvider]?.hasApiKey ?? false;
    const [apiKeyInput, setApiKeyInput] = useState("");

    if (isLoading || !settings)
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Text-to-Speech (TTS)</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="h-4 w-4 animate-spin" />
                </CardContent>
            </Card>
        );


    const providerMeta = TTS_PROVIDER_MAP[activeProvider];
    const isSaving = updateMutation.isPending;
    const isTesting = testMutation.isPending;
    const isRefreshingVoices = refreshVoicesMutation.isPending;
    const voices = settings.availableVoices[activeProvider] ?? [];
    const defaultVoiceId = settings.providers[activeProvider]?.defaultVoiceId;

    const handleProviderChange = (provider: string) => {
        updateMutation.mutate({ id: settings.id, data: { activeProvider: provider as TtsProvider } });
    };

    const handleSaveKey = () => {
        updateMutation.mutate({
            id: settings.id,
            data: {
                providers: {
                    ...settings.providers,
                    [activeProvider]: { ...settings.providers[activeProvider], apiKey: apiKeyInput }
                }
            }
        });
    };

    const handleTestConnection = () => {
        // apiKeyInput may be empty (testing the already-saved key, nothing retyped) — the server
        // falls back to its own stored key in that case (B31).
        testMutation.mutate({ provider: activeProvider, apiKey: apiKeyInput });
    };

    const handleRefreshVoices = () => {
        refreshVoicesMutation.mutate(activeProvider);
    };

    const handleDefaultVoiceChange = (voiceId: string | undefined) => {
        updateMutation.mutate({
            id: settings.id,
            data: {
                providers: {
                    ...settings.providers,
                    [activeProvider]: { ...settings.providers[activeProvider], defaultVoiceId: voiceId }
                }
            }
        });
    };

    const handlePreview = () => {
        if (isPreviewPlaying) {
            stop();
            return;
        }
        if (defaultVoiceId) speak(PREVIEW_TEXT, { provider: activeProvider, voiceId: defaultVoiceId });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    Text-to-Speech (TTS)
                    <div className="flex items-center gap-2">
                        <Label htmlFor="tts-enabled" className="text-sm font-normal text-muted-foreground">
                            Enable TTS
                        </Label>
                        <Switch
                            id="tts-enabled"
                            checked={settings.enabled}
                            onCheckedChange={enabled => updateMutation.mutate({ id: settings.id, data: { enabled } })}
                        />
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {settings.enabled && (!hasApiKey || !defaultVoiceId) && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                            TTS is enabled but not fully set up —{" "}
                            {!hasApiKey ? "add and save an API key" : "choose a default voice"} below to make it work.
                        </span>
                    </div>
                )}

                <div className="grid gap-2">
                    <Label htmlFor="tts-provider">Provider</Label>
                    <Select value={activeProvider} onValueChange={handleProviderChange}>
                        <SelectTrigger id="tts-provider">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TTS_PROVIDERS.map(provider => (
                                <SelectItem key={provider.id} value={provider.id}>
                                    {provider.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="tts-api-key">{providerMeta.apiKeyLabel}</Label>
                    <div className="flex gap-2">
                        <Input
                            id="tts-api-key"
                            type="password"
                            placeholder={hasApiKey ? "•••••••• (key saved — enter a new one to replace it)" : providerMeta.apiKeyPlaceholder}
                            value={apiKeyInput}
                            onChange={e => setApiKeyInput(e.target.value)}
                        />
                        <Button onClick={handleSaveKey} disabled={isSaving || !apiKeyInput.trim()}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {providerMeta.helpText}{" "}
                        <a
                            href={providerMeta.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 underline underline-offset-2"
                        >
                            Get an API key
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </p>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={isTesting || !(apiKeyInput.trim() || hasApiKey)}
                    >
                        {isTesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Test Connection
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleRefreshVoices}
                        disabled={isRefreshingVoices || !hasApiKey}
                    >
                        {isRefreshingVoices && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Refresh Voices
                    </Button>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="tts-default-voice">Default Voice</Label>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <VoiceCombobox
                                id="tts-default-voice"
                                voices={voices}
                                value={defaultVoiceId}
                                onValueChange={handleDefaultVoiceChange}
                                placeholder="Select default voice"
                                emptyText={voices.length === 0 ? "No voices loaded yet" : "No voices found"}
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handlePreview}
                            disabled={isPreviewGenerating || (!defaultVoiceId && !isPreviewPlaying)}
                            title={isPreviewPlaying ? "Stop preview" : "Preview voice"}
                        >
                            {isPreviewGenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isPreviewPlaying ? (
                                <Square className="h-4 w-4" />
                            ) : (
                                <Play className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {voices.length === 0
                            ? "Save an API key and click Refresh Voices to load the voice catalog."
                            : `${voices.length} voices available. Used app-wide unless a project sets its own voice.`}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
