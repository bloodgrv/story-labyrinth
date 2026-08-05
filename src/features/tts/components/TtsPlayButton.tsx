import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoryTtsVoiceQuery } from "@/features/tts/hooks/useStoryTtsVoiceQuery";
import { useTtsPlayback } from "@/features/tts/hooks/useTtsPlayback";
import { useTtsSettingsQuery } from "@/features/tts/hooks/useTtsSettingsQuery";
import { cn } from "@/lib/utils";

interface TtsPlayButtonProps {
    text: string;
    // When given, prefers this project's voice override (see StoryVoiceCard) over the
    // global default voice for whichever provider is active.
    storyId?: string;
    className?: string;
    iconClassName?: string;
}

/**
 * Provider-agnostic play/pause control for any block of generated text. This is the one place
 * a new TTS provider's playback surfaces — it only ever talks to useTtsPlayback/POST
 * /api/tts/generate, so adding a provider server-side never touches this component.
 * Renders nothing when TTS is disabled in global settings.
 */
export function TtsPlayButton({ text, storyId, className, iconClassName = "h-4 w-4" }: TtsPlayButtonProps) {
    const { data: settings } = useTtsSettingsQuery();
    const { data: storyVoice } = useStoryTtsVoiceQuery(storyId ?? "");
    const { isGenerating, isPlaying, isPaused, speak, pause, resume } = useTtsPlayback();

    if (!settings?.enabled) return null;

    const voiceId = storyVoice?.voiceId ?? settings.providers[settings.activeProvider]?.defaultVoiceId;

    const handleClick = () => {
        if (isGenerating) return;
        if (isPlaying) {
            pause();
            return;
        }
        if (isPaused) {
            resume();
            return;
        }
        speak(text, { provider: settings.activeProvider, voiceId });
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn(className)}
            onClick={handleClick}
            disabled={isGenerating}
            title={isPlaying ? "Pause" : isPaused ? "Resume" : "Read aloud"}
        >
            {isGenerating ? (
                <Loader2 className={cn(iconClassName, "animate-spin")} />
            ) : isPlaying ? (
                <Pause className={iconClassName} />
            ) : (
                <Play className={iconClassName} />
            )}
        </Button>
    );
}
