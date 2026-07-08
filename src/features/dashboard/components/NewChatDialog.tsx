import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AIChat } from "@/types/story";
import { WORLD_BUILDING_TEMPLATES } from "@/types/worldbuilding";
import type { WorldBuildingTemplateSlug } from "@/types/worldbuilding";
import { useCreateWbChatMutation, useWbChatTemplates } from "../hooks/useDashboardData";
import { cn } from "@/lib/utils";

interface NewChatDialogProps {
    storyId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: (chat: AIChat) => void;
}

export function NewChatDialog({ storyId, open, onOpenChange, onCreated }: NewChatDialogProps) {
    const [selectedSlug, setSelectedSlug] = useState<WorldBuildingTemplateSlug>("freeform");
    const [title, setTitle] = useState("");

    const { data: templates } = useWbChatTemplates();
    const displayTemplates = templates ?? WORLD_BUILDING_TEMPLATES;

    const createMutation = useCreateWbChatMutation(storyId);

    const handleCreate = async () => {
        const chat = await createMutation.mutateAsync({
            templateSlug: selectedSlug,
            title: title.trim() || undefined
        });
        onOpenChange(false);
        setTitle("");
        setSelectedSlug("freeform");
        onCreated?.(chat);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New World-Building Chat</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Template
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                            {displayTemplates.map(t => (
                                <button
                                    key={t.slug}
                                    type="button"
                                    onClick={() => setSelectedSlug(t.slug)}
                                    className={cn(
                                        "text-left px-3 py-2 rounded-md border text-sm transition-colors",
                                        selectedSlug === t.slug
                                            ? "border-primary bg-primary/5 text-primary"
                                            : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                                    )}
                                >
                                    <div className="font-medium leading-tight">{t.name}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                        {t.description}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="chat-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Title (optional)
                        </Label>
                        <Input
                            id="chat-title"
                            placeholder={displayTemplates.find(t => t.slug === selectedSlug)?.defaultTitle ?? ""}
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && !createMutation.isPending && handleCreate()}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Creating…" : "Create Chat"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
