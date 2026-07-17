import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCreateMemoryNoteMutation, useProjectMemoriesQuery } from "@/features/agent-memory/hooks/useProjectMemoryQuery";
import { AGENT_MEMORY_CATEGORIES, AGENT_MEMORY_CATEGORY_LABELS } from "@/types/agentMemory";
import type { AgentMemoryCategory, AgentMemoryStatus } from "@/types/agentMemory";
import { ProjectMemoryList } from "./ProjectMemoryList";

interface ProjectMemoryPanelProps {
    storyId: string;
}

// Pending | Active | Rejected only — Superseded rows are deliberately not a top-level tab in v1.
// They're history, not something to action; a flat list to review is Phase C polish, not a
// Phase B requirement (design doc §4.7's minimal-UI wording lists only these three).
const TABS: { value: AgentMemoryStatus; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "rejected", label: "Rejected" }
];

function NewMemoryNoteDialog({ storyId, open, onOpenChange }: { storyId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const [memoryKey, setMemoryKey] = useState("");
    const [category, setCategory] = useState<AgentMemoryCategory>("project_note");
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const createMutation = useCreateMemoryNoteMutation();

    const reset = () => {
        setMemoryKey("");
        setCategory("project_note");
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

// Outer shell, mirrors LorebookBrowsePanel.tsx's header+tabs+list layout. Page-scroll (not
// bounded height) — a simple filterable list with no docked chat rail or open-tabs strip.
export function ProjectMemoryPanel({ storyId }: ProjectMemoryPanelProps) {
    const [status, setStatus] = useState<AgentMemoryStatus>("pending");
    const [newNoteOpen, setNewNoteOpen] = useState(false);
    const { data, isLoading } = useProjectMemoriesQuery({ storyId, status });

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-bold">Project Memory</h1>
                    <p className="text-sm text-muted-foreground">
                        Factual, concrete facts about this project — proposed by scans or added by you, reviewed here before they're retrievable.
                    </p>
                </div>
                <Button onClick={() => setNewNoteOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Note
                </Button>
            </div>

            <Tabs value={status} onValueChange={value => setStatus(value as AgentMemoryStatus)}>
                <TabsList>
                    {TABS.map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <ProjectMemoryList memories={data?.memories ?? []} />
            )}

            <NewMemoryNoteDialog storyId={storyId} open={newNoteOpen} onOpenChange={setNewNoteOpen} />
        </div>
    );
}
