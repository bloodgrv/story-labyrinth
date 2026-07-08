import { ChevronLeft, Loader2, MessageSquare, ScrollText, Sparkles } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/constants/urls";
import { TtsPlayButton } from "@/features/tts/components/TtsPlayButton";
import { getTemplate } from "@/types/worldbuilding";
import { parseThinkingContent } from "@/utils/parseThinking";
import { useChatData } from "../hooks/useChatData";

export default function ChatPage() {
    const { storyId, chatId } = useParams<{ storyId: string; chatId: string }>();
    const navigate = useNavigate();

    const { chat, isLoadingChat, isChatError, chatError, proposals, isLoadingProposals } = useChatData(chatId ?? "");

    const backToDashboard = () => navigate(storyId ? ROUTES.DASHBOARD.ROOT(storyId) : ROUTES.HOME);

    if (isLoadingChat) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isChatError || !chat) {
        return (
            <div className="container mx-auto p-6 max-w-3xl">
                <p className="text-destructive text-sm">
                    {chatError?.message ?? "Chat not found."}
                </p>
                <Button variant="ghost" onClick={backToDashboard} className="mt-2">
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back to Dashboard
                </Button>
            </div>
        );
    }

    const template = chat.templateSlug ? getTemplate(chat.templateSlug) : undefined;

    return (
        <div className="container mx-auto p-6 max-w-3xl">
            {/* Header */}
            <Button
                variant="ghost"
                size="sm"
                onClick={backToDashboard}
                className="text-muted-foreground hover:text-foreground -ml-2 mb-3"
            >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Dashboard
            </Button>

            <div className="flex items-start justify-between gap-3 mb-6">
                <div className="min-w-0">
                    <h1 className="text-xl font-bold leading-tight truncate">{chat.title}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {template?.name ?? "World-Building"} · Created{" "}
                        {new Date(chat.createdAt).toLocaleDateString()}
                    </p>
                </div>
                {template && (
                    <Badge variant="secondary" className="shrink-0">
                        {template.name}
                    </Badge>
                )}
            </div>

            {/* Message history */}
            <Card className="mb-4">
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        Conversation
                    </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                    {chat.messages.length === 0 ? (
                        <div className="text-center py-8 space-y-2">
                            <ScrollText className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                            <p className="text-sm text-muted-foreground">No messages yet.</p>
                            <p className="text-xs text-muted-foreground/70">
                                Composing and sending messages from this view is coming soon.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {chat.messages.map(message => (
                                <div
                                    key={message.id}
                                    className={
                                        message.role === "user"
                                            ? "ml-8 rounded-lg bg-primary/10 px-3 py-2 text-sm"
                                            : "mr-8 rounded-lg bg-muted px-3 py-2 text-sm"
                                    }
                                >
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <p className="text-xs font-medium text-muted-foreground capitalize">
                                            {message.role}
                                        </p>
                                        {message.role === "assistant" && (
                                            <TtsPlayButton
                                                text={parseThinkingContent(message.content).response}
                                                storyId={storyId}
                                                className="h-5 -mt-1"
                                            />
                                        )}
                                    </div>
                                    <p className="whitespace-pre-wrap">{message.content}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pending Codex proposals from this chat */}
            <Card>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        Codex Proposals
                    </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                    {isLoadingProposals ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : proposals.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No Codex proposals from this chat yet.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {proposals.map(p => (
                                <div key={p.id} className="rounded-md border p-3 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <Badge
                                            variant={
                                                p.status === "pending"
                                                    ? "outline"
                                                    : p.status === "approved"
                                                    ? "secondary"
                                                    : "outline"
                                            }
                                            className="text-xs font-normal capitalize"
                                        >
                                            {p.status}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(p.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {p.proposedDescription && (
                                        <p className="text-sm leading-relaxed">{p.proposedDescription}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-3">
                        Approving, rejecting, and editing proposals will be available once the Codex view is built.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
