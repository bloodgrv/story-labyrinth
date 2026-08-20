import { Loader2, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectMemoriesQuery, useSuggestWriterPrefsMutation } from "@/features/agent-memory/hooks/useProjectMemoryQuery";
import {
    useUpdateWriterPrefsSettingsMutation,
    useWriterPrefsSettingsQuery
} from "@/features/agent-memory/hooks/useWriterPrefsSettingsQuery";
import type { AgentMemoryStatus } from "@/types/agentMemory";
import { NewMemoryNoteDialog } from "./NewMemoryNoteDialog";
import { ProjectMemoryList } from "./ProjectMemoryList";

// Pending/Active only here — a global writer_pref note is either awaiting review or live;
// Rejected/Superseded stay empty in practice (distill_writer_prefs only ever proposes) and aren't
// worth a tab.
const TABS: { value: AgentMemoryStatus; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" }
];

// Cross-project memory browser (P1.1) — lists storyId: null rows via the `global` list filter
// (agentMemoriesRepository.ts). Settings-page home since these aren't tied to any one story;
// same list/card UI as the story-scoped ProjectMemoryPanel, just scoped to global rows and
// defaulting new notes to category "writer_pref" (the intended use: craft preferences that
// should apply across every project, e.g. "prefer sparse stage direction").
//
// Auto-distill (distill_writer_prefs, server/services/jobs/distillWriterPrefsJob.ts) — the toggle
// below gates jobRunner.ts's daily schedule tick; "Check now" fires the same job on demand
// regardless of the toggle, same "auto cadence + manual trigger both work" posture as the
// unattended-scan / "Scan now" pair. Everything it proposes still lands in the Pending tab above
// for approval — this never writes an active memory on its own.
export function WriterPrefsCard() {
    const [status, setStatus] = useState<AgentMemoryStatus>("active");
    const [newNoteOpen, setNewNoteOpen] = useState(false);
    const { data, isLoading } = useProjectMemoriesQuery({ global: true, status });
    const { data: settings } = useWriterPrefsSettingsQuery();
    const updateSettingsMutation = useUpdateWriterPrefsSettingsMutation();
    const suggestMutation = useSuggestWriterPrefsMutation();

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="min-w-0 flex-1">
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
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="writer-prefs-auto-distill" className="text-sm font-medium">
                                Auto-learn from chat activity
                            </Label>
                            <Switch
                                id="writer-prefs-auto-distill"
                                checked={settings?.autoDistillEnabled ?? false}
                                disabled={!settings}
                                onCheckedChange={autoDistillEnabled =>
                                    settings && updateSettingsMutation.mutate({ id: settings.id, data: { autoDistillEnabled } })
                                }
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            When on, a daily background pass reviews your recent chat messages across all stories for
                            durable craft/workflow preferences and proposes them here for review — nothing is added
                            without your approval.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => suggestMutation.mutate()}
                        disabled={suggestMutation.isPending}
                        className="shrink-0"
                    >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Check now
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
