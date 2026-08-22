import { Send, Square } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Prompt } from "@/types/story";

interface MessageInputAreaProps {
    input: string;
    isGenerating: boolean;
    selectedPrompt: Prompt | null;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    /** Chat id the composer is currently attached to — refocuses the textarea when this changes. */
    chatId?: string;
    // B19 fix: no model resolving (e.g. a chat's persisted lastUsedModelId naming a model no
    // longer in the catalogue) used to leave Send enabled with no visible sign anything was
    // wrong — every click silently no-op'd in the generate() guard. Mirror that guard here so
    // the button reflects reality instead of the underlying failure being invisible.
    hasModel: boolean;
}

export function MessageInputArea({
    input,
    isGenerating,
    selectedPrompt,
    onInputChange,
    onSend,
    onStop,
    chatId,
    hasModel
}: MessageInputAreaProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const INITIAL_TEXTAREA_HEIGHT = 80;
    const MAX_TEXTAREA_HEIGHT = 600;

    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) 
            if (!input) {
                ta.style.height = `${INITIAL_TEXTAREA_HEIGHT}px`;
                ta.style.overflowY = "hidden";
            } else {
                const contentHeight = ta.scrollHeight;
                const newHeight = Math.min(Math.max(contentHeight, INITIAL_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
                ta.style.height = "auto";
                ta.style.height = `${newHeight}px`;
                ta.style.overflowY = contentHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
            }
        
    }, [input]);

    const canSend = !isGenerating && !!input.trim() && !!selectedPrompt && hasModel;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSend();
        }
    };

    // B15: when a generating send disables (and thus browser-blurs) this textarea, focus was
    // never restored afterward — leaving DOM focus ambiguous (often falling to <body>) right
    // when a background editor.update() elsewhere in the app could steal it into the chapter's
    // Lexical editor, so the user's next keystrokes landed in the manuscript instead of here.
    // Re-focus once generation completes so the composer reliably owns the caret again.
    const wasGeneratingRef = useRef(isGenerating);
    useEffect(() => {
        if (wasGeneratingRef.current && !isGenerating) textareaRef.current?.focus();
        wasGeneratingRef.current = isGenerating;
    }, [isGenerating]);

    // Also claim focus whenever the user switches to a different chat (existing or freshly
    // created) — part of the same B15 fix, so the composer reliably owns the caret right after
    // a chat switch instead of leaving focus wherever it last happened to be.
    useEffect(() => {
        if (chatId) textareaRef.current?.focus();
    }, [chatId]);

    return (
        <div className="border-t border-border p-4">
            {/* First-Start Tour (T11, OT5) — Brainstorm micro-step 2c (composer + send together). */}
            <div className="flex gap-2" data-tour="chat-composer">
                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => onInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything about your story..."
                    className="min-h-[80px] resize-none"
                    readOnly={isGenerating}
                    aria-busy={isGenerating}
                />
                {isGenerating ? (
                    <Button onClick={onStop} variant="destructive">
                        <Square className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        variant="gradient"
                        onClick={onSend}
                        disabled={!input.trim() || !selectedPrompt || !hasModel}
                        title={!hasModel ? "No AI model selected for this chat — pick one above" : undefined}
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
