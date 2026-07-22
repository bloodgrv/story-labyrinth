import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateMemoryNoteMutation } from "@/features/agent-memory/hooks/useProjectMemoryQuery";
import { AGENT_MEMORY_CATEGORIES, AGENT_MEMORY_CATEGORY_LABELS } from "@/types/agentMemory";
import type { AgentMemoryCategory } from "@/types/agentMemory";

interface NewMemoryNoteDialogProps {
    // null = cross-project / writer_pref (P1.1) — the global memory browser passes this.
    storyId: string | null;
    defaultCategory?: AgentMemoryCategory;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Shared by ProjectMemoryPanel.tsx (story-scoped) and WriterPrefsCard.tsx (global, storyId: null)
// — same dialog, only the target scope and default category differ.
export function NewMemoryNoteDialog({ storyId, defaultCategory = "project_note", open, onOpenChange }: NewMemoryNoteDialogProps) {
    const [memoryKey, setMemoryKey] = useState("");
    const [category, setCategory] = useState<AgentMemoryCategory>(defaultCategory);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const createMutation = useCreateMemoryNoteMutation();

    const reset = () => {
        setMemoryKey("");
        setCategory(defaultCategory);
        setTitle("");
        setBody("");
    };

    const handleCreate = () => {
        createMutation.mutate(
            { storyId, memoryKey: memoryKey.trim() || undefined, category, title, body },
            { onSuccess: () => { onOpenChange(false); reset(); } }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Memory Note</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Title</Label>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Short title" />
                    </div>
                    <div className="space-y-1">
                        <Label>Body</Label>
                        <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="The fact/note itself" rows={4} />
                    </div>
                    <div className="space-y-1">
                        <Label>Category</Label>
                        <Select value={category} onValueChange={value => setCategory(value as AgentMemoryCategory)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {AGENT_MEMORY_CATEGORIES.map(c => (
                                    <SelectItem key={c} value={c}>
                                        {AGENT_MEMORY_CATEGORY_LABELS[c]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Memory Key (optional)</Label>
                        <Input
                            value={memoryKey}
                            onChange={e => setMemoryKey(e.target.value)}
                            placeholder="e.g. fact:back-room-no-cameras — leave blank for a fresh one"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={handleCreate}
                        disabled={createMutation.isPending || !title.trim() || !body.trim()}
                    >
                        {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Note"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
