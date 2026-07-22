import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectMemoriesQuery } from "@/features/agent-memory/hooks/useProjectMemoryQuery";
import type { AgentMemoryStatus } from "@/types/agentMemory";
import { NewMemoryNoteDialog } from "./NewMemoryNoteDialog";
import { ProjectMemoryList } from "./ProjectMemoryList";

// Pending/Active only here — a global writer_pref note is either awaiting review or live; there's
// no distill_memory job proposing these yet (job proposals are always story-scoped, see
// agentMemoriesService.ts), so Rejected/Superseded stay empty in practice and aren't worth a tab.
const TABS: { value: AgentMemoryStatus; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" }
];

// Cross-project memory browser (P1.1) — lists storyId: null rows via the `global` list filter
// (agentMemoriesRepository.ts). Settings-page home since these aren't tied to any one story;
// same list/card UI as the story-scoped ProjectMemoryPanel, just scoped to global rows and
// defaulting new notes to category "writer_pref" (the intended use: craft preferences that
// should apply across every project, e.g. "prefer sparse stage direction").
export function WriterPrefsCard() {
    const [status, setStatus] = useState<AgentMemoryStatus>("active");
    const [newNoteOpen, setNewNoteOpen] = useState(false);
    const { data, isLoading } = useProjectMemoriesQuery({ global: true, status });

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                    <CardTitle>Writer Preferences</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Cross-project memory notes — craft preferences and standing facts that apply everywhere, not
                        just one story.
                    </p>
                </div>
                <Button size="sm" onClick={() => setNewNoteOpen(true)} className="shrink-0">
                    <Plus className="h-4 w-4 mr-2" />
                    New Note
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ProjectMemoryList memories={data?.memories ?? []} />
                )}
            </CardContent>

            <NewMemoryNoteDialog storyId={null} defaultCategory="writer_pref" open={newNoteOpen} onOpenChange={setNewNoteOpen} />
        </Card>
    );
}
