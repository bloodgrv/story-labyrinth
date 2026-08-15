import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePlaybookPackMutation, useUpdatePlaybookPackMutation } from "@/features/playbooks/hooks/usePlaybookPacksQuery";
import { PLAYBOOK_KEYS, PLAYBOOK_STYLES } from "@/types/playbookPack";
import type { PlaybookKey, PlaybookPack, PlaybookStyle } from "@/types/playbookPack";

const KEY_LABELS: Record<PlaybookKey, string> = {
    character_codex: "Character — Concrete Coverage",
    character_psych: "Character — Psych Module",
    character_sexuality: "Character — Sexuality Module"
};

interface PlaybookPackEditorDialogProps {
    // null = create new. Set = edit existing (must not be a shipped-scope pack — the panel routes
    // shipped edits through copy-on-edit instead of opening this in edit mode).
    pack: PlaybookPack | null;
    // Only used when creating: which scope/story the new pack lands in.
    createScope: "global" | "story";
    createStoryId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PlaybookPackEditorDialog({ pack, createScope, createStoryId, open, onOpenChange }: PlaybookPackEditorDialogProps) {
    const [playbookKey, setPlaybookKey] = useState<PlaybookKey>(pack?.playbookKey ?? "character_codex");
    const [style, setStyle] = useState<PlaybookStyle>(pack?.style ?? "standard");
    const [title, setTitle] = useState(pack?.title ?? "");
    const [body, setBody] = useState(pack?.body ?? "");
    const createMutation = useCreatePlaybookPackMutation();
    const updateMutation = useUpdatePlaybookPackMutation();

    useEffect(() => {
        if (!open) return;
        setPlaybookKey(pack?.playbookKey ?? "character_codex");
        setStyle(pack?.style ?? "standard");
        setTitle(pack?.title ?? "");
        setBody(pack?.body ?? "");
    }, [open, pack]);

    const isPending = createMutation.isPending || updateMutation.isPending;

    const handleSave = () => {
        if (pack) {
            updateMutation.mutate({ id: pack.id, data: { title, body } }, { onSuccess: () => onOpenChange(false) });
            return;
        }
        createMutation.mutate(
            { playbookKey, style, packScope: createScope, storyId: createScope === "story" ? createStoryId : null, title, body },
            { onSuccess: () => onOpenChange(false) }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{pack ? "Edit Playbook Pack" : "New Playbook Pack"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Title</Label>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Short title" />
                    </div>
                    {!pack && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Playbook</Label>
                                <Select value={playbookKey} onValueChange={value => setPlaybookKey(value as PlaybookKey)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PLAYBOOK_KEYS.map(key => (
                                            <SelectItem key={key} value={key}>
                                                {KEY_LABELS[key]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label>Style</Label>
                                <Select value={style} onValueChange={value => setStyle(value as PlaybookStyle)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PLAYBOOK_STYLES.map(s => (
                                            <SelectItem key={s} value={s}>
                                                {s}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label>Body (markdown)</Label>
                        <Textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder="Coverage targets, sample interview questions..."
                            rows={14}
                            className="font-mono text-sm"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isPending || !title.trim() || !body.trim()}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
