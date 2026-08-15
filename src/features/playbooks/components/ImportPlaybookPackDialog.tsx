import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useImportPlaybookPackMutation } from "@/features/playbooks/hooks/usePlaybookPacksQuery";
import { PLAYBOOK_KEYS, PLAYBOOK_STYLES } from "@/types/playbookPack";
import type { PlaybookKey, PlaybookScope, PlaybookStyle } from "@/types/playbookPack";

const KEY_LABELS: Record<PlaybookKey, string> = {
    character_codex: "Character — Concrete Coverage",
    character_psych: "Character — Psych Module",
    character_sexuality: "Character — Sexuality Module"
};

interface ImportPlaybookPackDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // null = Settings' global-scope view (only "global" is offered as a target). Set = in-story
    // Playbooks tool (both "global" and "story" are offered).
    storyId: string | null;
}

// .md/.txt only (design doc §4). playbookKey/style/packScope/title can come from an optional
// YAML-ish frontmatter block at the top of the file — when present, it overrides these selects
// (playbookPackService.ts's parsePackFrontmatter takes priority). The selects below are always
// sent as the fallback, so import never 400s just because a plain file has no frontmatter.
export function ImportPlaybookPackDialog({ open, onOpenChange, storyId }: ImportPlaybookPackDialogProps) {
    const [packScope, setPackScope] = useState<PlaybookScope>(storyId ? "story" : "global");
    const [playbookKey, setPlaybookKey] = useState<PlaybookKey>("character_codex");
    const [style, setStyle] = useState<PlaybookStyle>("standard");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importMutation = useImportPlaybookPackMutation();

    const handleSubmit = () => {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            toast.error("Choose a .md or .txt file first");
            return;
        }
        importMutation.mutate(
            { file, fields: { packScope, playbookKey, style, storyId: packScope === "story" && storyId ? storyId : undefined } },
            {
                onSuccess: () => {
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    onOpenChange(false);
                }
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import Playbook Pack</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        A .md or .txt file. Optionally add a frontmatter block (<code>playbookKey:</code>,{" "}
                        <code>style:</code>, <code>packScope:</code>, <code>title:</code>) at the top of the file to
                        override the selects below.
                    </p>
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">File</Label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".md,.txt,text/markdown,text/plain"
                            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Playbook</Label>
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
                            <Label className="text-xs text-muted-foreground">Style</Label>
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
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Scope</Label>
                        <Select value={packScope} onValueChange={value => setPackScope(value as PlaybookScope)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {storyId && <SelectItem value="story">This story only</SelectItem>}
                                <SelectItem value="global">Global (every story)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importMutation.isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={importMutation.isPending}>
                        {importMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        Import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
