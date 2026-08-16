import { Copy, Edit, GitBranch, Loader2, RefreshCw, Send, StickyNote, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { formatTokenCount } from "@/features/context-meter/lib/estimateTokens";
import { TtsPlayButton } from "@/features/tts/components/TtsPlayButton";
import type { ChatMessage } from "@/types/story";
import { parseThinkingContent } from "@/utils/parseThinking";
import { AssistantMessageContent } from "./AssistantMessageContent";
import MarkdownRenderer from "./MarkdownRenderer";

// 2026-08-15 QA-pass B21 — a static "Generating…" with no elapsed time could reasonably read as
// hung during a multi-minute generation (a first-time user has no way to tell "slow" from
// "stuck"). Own tiny component (not inline state in the list) so its 1s interval only exists
// while an actual streaming bubble is mounted, not for the whole message list's lifetime.
function GeneratingIndicator() {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Generating{elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : "..."}</span>
        </div>
    );
}

interface ChatMessageListProps {
    messages: ChatMessage[];
    editingMessageId: string | null;
    editingContent: string;
    streamingMessageId: string | null;
    storyId: string;
    // Editing is optional — omitted (button hidden) wherever a host doesn't wire it up.
    onStartEdit?: (message: ChatMessage) => void;
    onSaveEdit: (messageId: string) => void;
    onCancelEdit: () => void;
    onEditContentChange: (content: string) => void;
    editingTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
    // P1.5 MB2 — delete a single message (either role). Omitted (button hidden) wherever a host
    // doesn't wire it up. Confirmation is the host's responsibility (ChatInterface.tsx uses
    // ConfirmDialog), not this list's.
    onDeleteMessage?: (message: ChatMessage) => void;
    // P1.5 MB4 — regenerate an assistant reply (deletes it + everything after, re-sends the prior
    // user message). Assistant messages only.
    onRegenerateMessage?: (message: ChatMessage) => void;
    // Resend a user message (deletes it + everything after, re-sends its own text). User messages
    // only — the mirror of onRegenerateMessage above.
    onResendMessage?: (message: ChatMessage) => void;
    // Renders below an assistant message's content when that message produced Codex
    // proposals — see ChatInterface in features/chat for the chats.ts-backed usage.
    renderProposalsForMessage?: (messageId: string) => ReactNode;
    // Manual "Save as note" (N5, Notes_Outline_Chat_Bridges_Design.md §4) — omitted entirely
    // (button hidden) for chats where saving a note doesn't make sense, e.g. Editor chats
    // (stay canon-only) or global chats with no storyId (Research). Available on both
    // user and assistant messages since either might be worth capturing as working material.
    onSaveAsNote?: (message: ChatMessage) => void;
    // Chat Shuttle H6 (docs/Chat_Shuttle_Design.md) — "chat bubble selection" span-level highlight
    // → Note, complementing onSaveAsNote's whole-message capture (N5). Both gated the same way
    // onSaveAsNote already is (hidden for Editor chats / storyId-less global chats) — see
    // ChatInterface.tsx.
    onSaveSelectionAsNote?: (text: string) => void;
    onSendSelectionToNotesChat?: (text: string) => void;
    // Fork the conversation into a new sibling chat containing everything up to and including
    // this message — omitted (button hidden) for global chats with no chat list to branch into
    // (see ChatInterface.tsx's storyId gate).
    onBranchMessage?: (message: ChatMessage) => void;
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
    onSaveSelectionAsNote,
    onSendSelectionToNotesChat,
    onDeleteMessage,
    onRegenerateMessage,
    onResendMessage,
    onBranchMessage
}: ChatMessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    // Chat Shuttle H6 — captures a plain-text window.getSelection() span made within a message
    // bubble (no Lexical node-key capture needed here, unlike the chapter editor's rework
    // selection — this only ever READS the selection out to create a note, never writes back into
    // the rendered markdown). Cleared on any click elsewhere or once an action is taken.
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const handleMouseUp = () => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() ?? "";
        if (!text || !messagesContainerRef.current?.contains(selection?.anchorNode ?? null)) {
            setSelectedText(null);
            return;
        }
        setSelectedText(text);
    };

    // Scroll to the latest message on load, and again on every new message/streaming update —
    // deliberately NOT messagesEndRef.scrollIntoView(). scrollIntoView({block: "start"}, the
    // default) walks every scrollable ancestor it needs to, not just this list's own ScrollArea
    // viewport — with this panel nested inside the workspace's own scrollable page chrome, that
    // made the whole page jump on every chat load, shifting the header controls above the fold.
    // Scrolling only this list's own Radix viewport element never touches an ancestor's scroll
    // position. The dependency array previously only ran this once on mount (an empty array), so
    // it scrolled to the bottom when a chat was first opened but never again — not when a new
    // message was sent, not while a reply streamed in, not once generation finished. `messages`
    // is exactly the right dependency: useChatMessages.ts's memo already gives it a new reference
    // on every relevant change (a message appended, streamingContent growing chunk by chunk), so
    // this now follows the conversation the whole time a chat stays open, not just at open time.
    useEffect(() => {
        const viewport = messagesContainerRef.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }, [messages]);

    useEffect(() => {
        const ta = editingTextareaRef.current;
        if (ta && editingMessageId) {
            const contentHeight = ta.scrollHeight;
            ta.style.height = "auto";
            ta.style.height = `${contentHeight}px`;
        }
    }, [/* effect dep */ editingMessageId, editingTextareaRef]);

    const showSelectionBar = selectedText && (onSaveSelectionAsNote || onSendSelectionToNotesChat);

    return (
        <ScrollArea className="flex-1 px-4">
            <div ref={messagesContainerRef} className="space-y-4 py-4" onMouseUp={handleMouseUp}>
                {messages.map(message => (
                    <div
                        key={message.id}
                        className={`group flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-lg px-4 py-3 ${
                                message.role === "user"
                                    ? "bg-primary text-primary-foreground raycast-user-bubble"
                                    : "bg-muted"
                            }`}
                        >
                            {editingMessageId === message.id ? (
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
                                <div>
                                    {message.role === "assistant" && streamingMessageId === message.id ? (
                                        // The streaming placeholder's content (useChatMessages.ts)
                                        // already carries live streamed text — show it as it
                                        // arrives instead of masking it behind a spinner for the
                                        // whole generation (QA-pass B21: "no progress signal").
                                        // Still falls back to the spinner+timer while nothing has
                                        // streamed in yet (e.g. a reasoning model's silent think
                                        // phase before its first visible token).
                                        message.content ? (
                                            <div>
                                                <AssistantMessageContent content={message.content} />
                                                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    <span>Generating…</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <GeneratingIndicator />
                                        )
                                    ) : message.role === "assistant" ? (
                                        <>
                                            <AssistantMessageContent content={message.content} />
                                            {message.usage && (
                                                // Context/Token Meter (T4, M3) — real provider usage for this turn
                                                // (Local only this pass, see streamUtils.ts).
                                                <p className="mt-1 text-[10px] text-muted-foreground">
                                                    in {formatTokenCount(message.usage.promptTokens)} · out{" "}
                                                    {formatTokenCount(message.usage.completionTokens)} · total{" "}
                                                    {formatTokenCount(message.usage.totalTokens)}
                                                </p>
                                            )}
                                            {renderProposalsForMessage && (
                                                <div className="mt-3 space-y-2">{renderProposalsForMessage(message.id)}</div>
                                            )}
                                        </>
                                    ) : (
                                        <MarkdownRenderer content={message.content} />
                                    )}
                                </div>
                            )}
                        </div>
                        {editingMessageId !== message.id && message.role === "assistant" && !streamingMessageId && (
                            <div className="mt-1 flex items-center gap-0 opacity-0 transition-opacity group-hover:opacity-100">
                                <TtsPlayButton
                                    text={parseThinkingContent(message.content).response}
                                    storyId={storyId}
                                    className="h-6 w-6"
                                    iconClassName="h-3.5 w-3.5"
                                />
                                {onRegenerateMessage && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Regenerate" onClick={() => onRegenerateMessage(message)}>
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {onStartEdit && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit" onClick={() => onStartEdit(message)}>
                                        <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {onSaveAsNote && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Save as note" onClick={() => onSaveAsNote(message)}>
                                        <StickyNote className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {onBranchMessage && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Branch from here" onClick={() => onBranchMessage(message)}>
                                        <GitBranch className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    title="Copy"
                                    onClick={() => {
                                        navigator.clipboard.writeText(message.content);
                                        toast.success("Copied to clipboard");
                                    }}
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                                {onDeleteMessage && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Delete" onClick={() => onDeleteMessage(message)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        )}
                        {editingMessageId !== message.id && message.role === "user" && !streamingMessageId && (
                            <div className="mt-1 flex items-center gap-0 opacity-0 transition-opacity group-hover:opacity-100">
                                {onResendMessage && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Resend" onClick={() => onResendMessage(message)}>
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {onStartEdit && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit" onClick={() => onStartEdit(message)}>
                                        <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {onSaveAsNote && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Save as note" onClick={() => onSaveAsNote(message)}>
                                        <StickyNote className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {onBranchMessage && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Branch from here" onClick={() => onBranchMessage(message)}>
                                        <GitBranch className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    title="Copy"
                                    onClick={() => {
                                        navigator.clipboard.writeText(message.content);
                                        toast.success("Copied to clipboard");
                                    }}
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                                {onDeleteMessage && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Delete" onClick={() => onDeleteMessage(message)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            {showSelectionBar && (
                <div className="sticky bottom-2 z-10 mx-4 flex items-center justify-between gap-2 rounded-lg border border-border bg-popover p-2 shadow-md">
                    <p className="truncate text-xs text-muted-foreground">"{selectedText}"</p>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            title="Copy selection"
                            onClick={() => {
                                navigator.clipboard.writeText(selectedText);
                                toast.success("Copied to clipboard");
                                setSelectedText(null);
                            }}
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                        {onSaveSelectionAsNote && (
                            <Button
                                size="sm"
                                variant="ghost"
                                title="Save selection as note"
                                onClick={() => {
                                    onSaveSelectionAsNote(selectedText);
                                    setSelectedText(null);
                                }}
                            >
                                <StickyNote className="h-4 w-4" />
                            </Button>
                        )}
                        {onSendSelectionToNotesChat && (
                            <Button
                                size="sm"
                                variant="ghost"
                                title="Send selection to Notes chat"
                                onClick={() => {
                                    onSendSelectionToNotesChat(selectedText);
                                    setSelectedText(null);
                                }}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" title="Dismiss" onClick={() => setSelectedText(null)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </ScrollArea>
    );
}
