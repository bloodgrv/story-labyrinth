import { Loader2, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useArchivedChatsQuery, useDeleteChatMutation, useUnarchiveChatMutation } from "@/features/chat/hooks/useChatQuery";
import type { AIChat } from "@/types/story";
import type { ChatType } from "@/types/worldbuilding";

const CHAT_TYPE_LABELS: Record<ChatType, string> = {
    worldbuilding: "World-Building",
    research: "Research",
    editor: "Editor",
    outline: "Outline",
    brainstorm: "Brainstorm",
    notes: "Notes",
    general: "General"
};

interface ArchivedChatRowProps {
    chat: AIChat & { storyTitle: string | null };
    onRestore: (id: string) => void;
    onDeleteClick: (id: string) => void;
    isRestoring: boolean;
}

function ArchivedChatRow({ chat, onRestore, onDeleteClick, isRestoring }: ArchivedChatRowProps) {
    return (
        <div className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{chat.title}</span>
                    <Badge variant="outline">{CHAT_TYPE_LABELS[(chat.chatType as ChatType) ?? "general"]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {chat.storyTitle ?? "Global"} · Archived {new Date(chat.archivedAt ?? chat.updatedAt ?? chat.createdAt).toLocaleString()}
                </p>
            </div>
            <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => onRestore(chat.id)} disabled={isRestoring}>
                    {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                    Restore
                </Button>
                <Button size="sm" variant="outline" className="hover:text-destructive" onClick={() => onDeleteClick(chat.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                </Button>
            </div>
        </div>
    );
}

// Review/restore surface for the app-wide chat archive (ChatListItem's Archive action across
// WB/Outline/Notes/Editor/Research). Deletion here is the only place a chat can still be
// permanently removed — the normal rails only archive now.
export function ArchivedChatsCard() {
    const { data: chats = [], isLoading } = useArchivedChatsQuery();
    const unarchiveMutation = useUnarchiveChatMutation();
    const deleteMutation = useDeleteChatMutation();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Archived Chats</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                    Chats you've archived from any chat list (World-Building, Outline, Notes, Editor, Research). Restore
                    one back to its list, or delete it — deleted chats move to Trash and can be restored there within 14 days.
                </p>
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : chats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No archived chats.</p>
                ) : (
                    <div className="divide-y">
                        {chats.map(chat => (
                            <ArchivedChatRow
                                key={chat.id}
                                chat={chat}
                                onRestore={id => unarchiveMutation.mutate(id)}
                                onDeleteClick={setDeletingId}
                                isRestoring={unarchiveMutation.isPending && unarchiveMutation.variables === chat.id}
                            />
                        ))}
                    </div>
                )}
            </CardContent>

            <ConfirmDialog
                open={deletingId !== null}
                onOpenChange={open => !open && setDeletingId(null)}
                title="Delete chat"
                description="This chat will be moved to Trash (Settings → Trash), where you can restore it within 14 days."
                onConfirm={() => {
                    if (deletingId) deleteMutation.mutate(deletingId);
                    setDeletingId(null);
                }}
                confirmLabel="Delete"
            />
        </Card>
    );
}
