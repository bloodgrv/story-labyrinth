import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectMemoriesQuery } from "@/features/agent-memory/hooks/useProjectMemoryQuery";
import type { AgentMemoryStatus } from "@/types/agentMemory";
import { NewMemoryNoteDialog } from "./NewMemoryNoteDialog";
import { ProjectMemoryList } from "./ProjectMemoryList";

interface ProjectMemoryPanelProps {
    storyId: string;
}

// Superseded added as a fourth tab (P1.1 Phase C polish, design doc §5's "superseded history
// tab") — a flat read-only list of prior versions of a memoryKey, not something to action.
const TABS: { value: AgentMemoryStatus; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "rejected", label: "Rejected" },
    { value: "superseded", label: "Superseded" }
];

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
                <Button variant="gradient" onClick={() => setNewNoteOpen(true)}>
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
