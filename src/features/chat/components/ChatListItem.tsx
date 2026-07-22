import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Edit2, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AIChat } from "@/types/story";

interface ChatListItemProps {
    chat: AIChat;
    isSelected: boolean;
    onSelect: (chat: AIChat) => void;
    onEditClick: (chat: AIChat, e: MouseEvent) => void;
    onDeleteClick: (chatId: string) => void;
}

// Short, muted timestamp (CL0, docs/Chat_Model_Routing_And_Chrome_Design.md L2) — time-of-day for
// today, "Mon D" for this year, "Mon D, YYYY" otherwise. Deliberately not a full date+time stack
// (that's what made the old row tall) and not a relative "3h ago" ticker (no live re-render loop
// to keep it fresh).
function formatShortTimestamp(date: Date): string {
    const now = new Date();
    const isToday =
        date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const dateOptions: Intl.DateTimeFormatOptions =
        date.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" };
    return date.toLocaleDateString([], dateOptions);
}

// Single chat row — extracted out of ChatList.tsx (B9, docs/Folders_Org_Design.md F3) so the same
// row renders identically whether a chat is Unfiled or nested inside a ChatFolderNode. Draggable
// so it can be filed by dropping onto a folder row — drag props apply directly to the <li> (not a
// DraggableLeaf wrapper div, which would be invalid HTML nested directly under this list's <ul>).
export function ChatListItem({ chat, isSelected, onSelect, onEditClick, onDeleteClick }: ChatListItemProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `leaf:${chat.id}`,
        data: { type: "chat", leafId: chat.id }
    });

    return (
        <li
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
            className={cn(
                "border-b border-input hover:bg-muted cursor-pointer relative group",
                isSelected && "bg-muted/50"
            )}
        >
            <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(chat)}
                onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(chat);
                    }
                }}
                className="flex items-center gap-2 w-full text-left py-1.5 px-2"
            >
                <TooltipProvider delayDuration={100}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-sm truncate text-foreground flex-1 min-w-0">{chat.title}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs break-words">{chat.title}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <span className="text-xs text-muted-foreground shrink-0">
                    {formatShortTimestamp(new Date(chat.updatedAt || chat.createdAt))}
                </span>

                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => {
                            e.stopPropagation();
                            onEditClick(chat, e);
                        }}
                        className="h-6 w-6"
                    >
                        <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => {
                            e.stopPropagation();
                            onDeleteClick(chat.id);
                        }}
                        className="h-6 w-6 hover:text-destructive"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </li>
    );
}
