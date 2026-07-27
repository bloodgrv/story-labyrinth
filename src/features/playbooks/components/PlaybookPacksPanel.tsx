import { Copy, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    useCopyPlaybookPackMutation,
    useDeletePlaybookPackMutation,
    usePlaybookPacksQuery
} from "@/features/playbooks/hooks/usePlaybookPacksQuery";
import type { PlaybookPack, PlaybookScope } from "@/types/playbookPack";
import { ImportPlaybookPackDialog } from "./ImportPlaybookPackDialog";
import { PlaybookPackEditorDialog } from "./PlaybookPackEditorDialog";

const SCOPE_LABELS: Record<PlaybookScope, string> = { shipped: "Shipped", global: "Global", story: "This story" };
const SCOPE_VARIANTS: Record<PlaybookScope, "outline" | "secondary" | "default"> = {
    shipped: "outline",
    global: "secondary",
    story: "default"
};

interface PlaybookPacksPanelProps {
    // null = Settings' global-scope view (shipped+global only, new packs default to global scope).
    // Set = in-story Playbooks tool (shipped+global+story, new packs default to story scope).
    storyId: string | null;
}

// Character Guided Playbook Packs (Hybrid D) — shared list/manage UI. The design doc's "Playbooks
// folder" is realized here as a dedicated panel, not a folder inside the Notes desk (confirmed
// with the user before implementation: packs aren't notes, they're a distinct object).
export function PlaybookPacksPanel({ storyId }: PlaybookPacksPanelProps) {
    const { data, isLoading } = usePlaybookPacksQuery(storyId);
    const copyMutation = useCopyPlaybookPackMutation();
    const deleteMutation = useDeletePlaybookPackMutation();
    const [editingPack, setEditingPack] = useState<PlaybookPack | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);

    const packs = data?.packs ?? [];
    const shipped = packs.filter(p => p.packScope === "shipped");
    const global = packs.filter(p => p.packScope === "global");
    const story = packs.filter(p => p.packScope === "story");

    const createScope: "global" | "story" = storyId ? "story" : "global";

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                    <CardTitle>Playbook Packs</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Interview curriculum documents you can arm onto a Character chat — coverage targets and sample
                        question angles, never story canon.
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import
                    </Button>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Pack
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {isLoading ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {storyId && (
                            <PackSection
                                title="This story"
                                packs={story}
                                onEdit={setEditingPack}
                                onDelete={id => deleteMutation.mutate(id)}
                                emptyHint="No story-specific overrides — falls back to global/shipped."
                            />
                        )}
                        <PackSection
                            title="Global"
                            packs={global}
                            onEdit={setEditingPack}
                            onDelete={id => deleteMutation.mutate(id)}
                            emptyHint="No global packs yet — falls back to the shipped shells below."
                        />
                        <PackSection
                            title="Shipped"
                            packs={shipped}
                            onCopy={(id, targetScope) =>
                                copyMutation.mutate({ id, targetScope, targetStoryId: targetScope === "story" ? storyId : null })
                            }
                            copyTargets={storyId ? (["global", "story"] as const) : (["global"] as const)}
                            emptyHint="Shipped shells failed to seed — check the server log."
                        />
                    </>
                )}
            </CardContent>

            <PlaybookPackEditorDialog
                pack={null}
                createScope={createScope}
                createStoryId={storyId}
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
            <PlaybookPackEditorDialog
                pack={editingPack}
                createScope={createScope}
                createStoryId={storyId}
                open={editingPack !== null}
                onOpenChange={open => !open && setEditingPack(null)}
            />
            <ImportPlaybookPackDialog open={importOpen} onOpenChange={setImportOpen} storyId={storyId} />
        </Card>
    );
}

interface PackSectionProps {
    title: string;
    packs: PlaybookPack[];
    emptyHint: string;
    onEdit?: (pack: PlaybookPack) => void;
    onDelete?: (id: string) => void;
    onCopy?: (id: string, targetScope: "global" | "story") => void;
    copyTargets?: readonly ("global" | "story")[];
}

function PackSection({ title, packs, emptyHint, onEdit, onDelete, onCopy, copyTargets }: PackSectionProps) {
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
            {packs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{emptyHint}</p>
            ) : (
                <div className="divide-y rounded-md border">
                    {packs.map(pack => (
                        <div key={pack.id} className="flex items-start justify-between gap-3 p-3">
                            <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{pack.title}</span>
                                    <Badge variant={SCOPE_VARIANTS[pack.packScope]} className="text-[10px]">
                                        {SCOPE_LABELS[pack.packScope]}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">
                                        {pack.playbookKey}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">
                                        {pack.style}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{pack.body}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                                {onCopy &&
                                    copyTargets?.map(target => (
                                        <Button
                                            key={target}
                                            variant="ghost"
                                            size="sm"
                                            title={`Copy to ${target === "global" ? "global" : "this story"} to edit`}
                                            onClick={() => onCopy(pack.id, target)}
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                        </Button>
                                    ))}
                                {onEdit && (
                                    <Button variant="ghost" size="sm" onClick={() => onEdit(pack)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {onDelete && (
                                    <Button variant="ghost" size="sm" onClick={() => onDelete(pack.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
