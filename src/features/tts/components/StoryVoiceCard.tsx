import { Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { VoiceCombobox } from "@/features/tts/components/VoiceCombobox";
import {
    useClearStoryTtsVoiceMutation,
    useSetStoryTtsVoiceMutation,
    useStoryTtsVoiceQuery
} from "@/features/tts/hooks/useStoryTtsVoiceQuery";
import { useTtsSettingsQuery } from "@/features/tts/hooks/useTtsSettingsQuery";
import { useTtsPlayback } from "@/features/tts/hooks/useTtsPlayback";
import { TTS_PROVIDER_MAP } from "@/types/ttsSettings";

const PREVIEW_TEXT = "This is a preview of the selected voice.";

interface StoryVoiceCardProps {
    storyId: string;
}

export function StoryVoiceCard({ storyId }: StoryVoiceCardProps) {
    const { data: settings, isLoading: isLoadingSettings } = useTtsSettingsQuery();
    const { data: storyVoice, isLoading: isLoadingStoryVoice } = useStoryTtsVoiceQuery(storyId);
    const setMutation = useSetStoryTtsVoiceMutation(storyId);
    const clearMutation = useClearStoryTtsVoiceMutation(storyId);
    const { isGenerating: isPreviewGenerating, isPlaying: isPreviewPlaying, speak, stop } = useTtsPlayback();

    if (isLoadingSettings || isLoadingStoryVoice || !settings)
        return (
            <Card>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold">TTS Voice</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                </CardContent>
            </Card>
        );

    const activeProvider = settings.activeProvider;
    const voices = settings.availableVoices[activeProvider] ?? [];
    const globalDefaultVoiceId = settings.providers[activeProvider]?.defaultVoiceId;
    const globalDefaultVoice = voices.find(v => v.id === globalDefaultVoiceId);
    const noneLabel = globalDefaultVoice
        ? `Use global default (${globalDefaultVoice.name})`
        : "Use global default (none set)";

    const handleChange = (voiceId: string | undefined) => {
        if (!voiceId) {
            clearMutation.mutate();
            return;
        }
        setMutation.mutate({ provider: activeProvider, voiceId });
    };

    const effectiveVoiceId = storyVoice?.voiceId ?? globalDefaultVoiceId;

    const handlePreview = () => {
        if (isPreviewPlaying) {
            stop();
            return;
        }
        if (effectiveVoiceId) speak(PREVIEW_TEXT, { provider: activeProvider, voiceId: effectiveVoiceId });
    };

    return (
        <Card>
            <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">TTS Voice</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
                <Label className="text-xs">Voice for this project</Label>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <VoiceCombobox
                            voices={voices}
                            value={storyVoice?.voiceId}
                            onValueChange={handleChange}
                            placeholder="Select a voice"
                            noneLabel={noneLabel}
                            emptyText={
                                voices.length === 0 ? "No voices loaded — refresh voices in Settings" : "No voices found"
                            }
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handlePreview}
                        disabled={isPreviewGenerating || (!effectiveVoiceId && !isPreviewPlaying)}
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
                    Overrides the global default voice ({TTS_PROVIDER_MAP[activeProvider].label}) for this project only.
                </p>
            </CardContent>
        </Card>
    );
}
