import { Copy, Edit, Loader2, StickyNote } from "lucide-react";
import type { ReactNode } from "react";
import type React from "react";
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { TtsPlayButton } from "@/features/tts/components/TtsPlayButton";
import type { ChatMessage } from "@/types/story";
import { parseThinkingContent } from "@/utils/parseThinking";
import { AssistantMessageContent } from "./AssistantMessageContent";
import MarkdownRenderer from "./MarkdownRenderer";

interface ChatMessageListProps {
    messages: ChatMessage[];
    editingMessageId: string | null;
    editingContent: string;
    streamingMessageId: string | null;
    storyId: string;
    // Editing is optional — chats.ts-backed chats (World-Building/Research) don't support
    // it yet, so onStartEdit is simply omitted there and the edit affordance is hidden.
    onStartEdit?: (message: ChatMessage) => void;
    onSaveEdit: (messageId: string) => void;
    onCancelEdit: () => void;
    onEditContentChange: (content: string) => void;
    editingTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
    // Renders below an assistant message's content when that message produced Codex
    // proposals — see ChatInterface in features/chat for the chats.ts-backed usage.
    renderProposalsForMessage?: (messageId: string) => ReactNode;
    // Manual "Save as note" (N5, Notes_Outline_Chat_Bridges_Design.md §4) — omitted entirely
    // (button hidden) for chats where saving a note doesn't make sense, e.g. Editor chats
    // (stay canon-only) or global chats with no storyId (Research). Available on both
    // user and assistant messages since either might be worth capturing as working material.
    onSaveAsNote?: (message: ChatMessage) => void;
    // P0.4 S5 — Research's "copy-friendly blocks." Self-contained (no callback threaded up, unlike
    // onSaveAsNote which needs parent state) — just copies the message's raw markdown to the
    // clipboard. Assistant messages only (the useful case for a research answer + citations).
    enableCopy?: boolean;
}

export function ChatMessageList({
    messages,
    editingMessageId,
    editingContent,
    streamingMessageId,
    storyId,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onEditContentChange,
    editingTextareaRef,
    renderProposalsForMessage,
    onSaveAsNote,
    enableCopy
}: ChatMessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(
        () => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        },
        [
            /* effect dep */
        ]
    );

    useEffect(() => {
        const ta = editingTextareaRef.current;
        if (ta && editingMessageId) {
            const contentHeight = ta.scrollHeight;
            ta.style.height = "auto";
            ta.style.height = `${contentHeight}px`;
        }
    }, [/* effect dep */ editingMessageId, editingTextareaRef]);

    return (
        <ScrollArea className="flex-1 px-4">
            <div className="space-y-4 py-4">
                {messages.map(message => (
                    <div
                        key={message.id}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-lg px-4 py-3 ${
                                message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                            }`}
                        >
                            {message.role === "assistant" && editingMessageId === message.id ? (
                                <div className="space-y-2">
                                    <Textarea
                                        ref={editingTextareaRef}
                                        value={editingContent}
                                        onChange={e => onEditContentChange(e.target.value)}
                                        className="min-h-[100px] w-full resize-none overflow-hidden"
                                    />
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => onSaveEdit(message.id)}>
                                            Save
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={onCancelEdit}>
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="relative group">
                                    {message.role === "assistant" && streamingMessageId === message.id ? (
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span className="text-sm">Generating...</span>
                                        </div>
                                    ) : message.role === "assistant" ? (
                                        <>
                                            <AssistantMessageContent content={message.content} />
                                            {renderProposalsForMessage && (
                                                <div className="mt-3 space-y-2">{renderProposalsForMessage(message.id)}</div>
                                            )}
                                        </>
                                    ) : (
                                        <MarkdownRenderer content={message.content} />
                                    )}
                                    {message.role === "assistant" && !streamingMessageId && (
                                        <div className="absolute top-0 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <TtsPlayButton
                                                text={parseThinkingContent(message.content).response}
                                                storyId={storyId}
                                            />
                                            {onStartEdit && (
                                                <Button size="sm" variant="ghost" onClick={() => onStartEdit(message)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {onSaveAsNote && (
                                                <Button size="sm" variant="ghost" title="Save as note" onClick={() => onSaveAsNote(message)}>
                                                    <StickyNote className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {enableCopy && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title="Copy"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(message.content);
                                                        toast.success("Copied to clipboard");
                                                    }}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                    {message.role === "user" && !streamingMessageId && onSaveAsNote && (
                                        <div className="absolute top-0 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button size="sm" variant="ghost" title="Save as note" onClick={() => onSaveAsNote(message)}>
                                                <StickyNote className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
        </ScrollArea>
    );
}
