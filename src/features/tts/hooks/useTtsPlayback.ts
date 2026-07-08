import { attemptPromise } from "@jfdi/attempt";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ttsApi } from "@/services/api/client";
import type { TtsProvider } from "@/types/ttsSettings";

interface SpeakOptions {
    provider?: TtsProvider;
    voiceId?: string;
}

interface UseTtsPlaybackReturn {
    isGenerating: boolean;
    isPlaying: boolean;
    isPaused: boolean;
    error: string | null;
    speak: (text: string, options?: SpeakOptions) => Promise<void>;
    pause: () => void;
    resume: () => Promise<void>;
    stop: () => void;
}

/**
 * Reusable text-to-speech playback: generates audio via the active TTS provider and plays it
 * through a managed <audio> element. Any component can call `speak(text)` — chat messages,
 * chapter reading, voice previews in settings — without re-implementing generation, blob-URL
 * lifecycle, or playback state. Provider-agnostic: it only ever talks to POST /api/tts/generate,
 * so it never needs to change when a new provider is added server-side.
 */
export const useTtsPlayback = (): UseTtsPlaybackReturn => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);

    const cleanup = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current = null;
        }
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []);

    useEffect(() => cleanup, [cleanup]);

    const stop = useCallback(() => {
        cleanup();
        setIsPlaying(false);
        setIsPaused(false);
    }, [cleanup]);

    const pause = useCallback(() => {
        if (!audioRef.current) return;
        audioRef.current.pause();
        setIsPlaying(false);
        setIsPaused(true);
    }, []);

    const resume = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) return;
        const [playError] = await attemptPromise(() => audio.play());
        if (playError) {
            const message = "Failed to resume audio";
            setError(message);
            toast.error(message);
            return;
        }
        setIsPlaying(true);
        setIsPaused(false);
    }, []);

    const speak = useCallback(
        async (text: string, options?: SpeakOptions) => {
            if (!text.trim()) return;

            stop();
            setError(null);
            setIsGenerating(true);

            const [fetchError, blob] = await attemptPromise(() =>
                ttsApi.generateSpeech({ text, provider: options?.provider, voiceId: options?.voiceId })
            );

            setIsGenerating(false);

            if (fetchError) {
                setError(fetchError.message);
                toast.error(fetchError.message);
                return;
            }

            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;

            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => stop();
            audio.onerror = () => {
                const message = "Failed to play audio";
                setError(message);
                toast.error(message);
                stop();
            };

            const [playError] = await attemptPromise(() => audio.play());
            if (playError) {
                const message = "Failed to play audio";
                setError(message);
                toast.error(message);
                return;
            }
            setIsPlaying(true);
        },
        [stop]
    );

    return { isGenerating, isPlaying, isPaused, error, speak, pause, resume, stop };
};
