import { attemptPromise } from "@jfdi/attempt";
import { Check, Loader2, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchFilter } from "@/components/ui/SearchFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    useApproveMemoryMutation,
    useDeleteMemoryMutation,
    useRejectMemoryMutation,
    useReviseMemoryMutation,
    useSetMemoryPinnedMutation
} from "@/features/agent-memory/hooks/useProjectMemoryQuery";
import { AGENT_MEMORY_CATEGORIES, AGENT_MEMORY_CATEGORY_LABELS } from "@/types/agentMemory";
import type { AgentMemory, AgentMemoryCategory } from "@/types/agentMemory";
import { logger } from "@/utils/logger";

interface ProjectMemoryListProps {
    memories: AgentMemory[];
}

const memoryMatchesSearch = (memory: AgentMemory, term: string) =>
    [memory.title, memory.body, memory.category].some(field => field?.toLowerCase().includes(term));

interface MemoryCardProps {
    memory: AgentMemory;
}

// Edit-before-approve UI — no existing precedent in this codebase to copy (Codex's own backend
// support for this, revisePendingChange, has zero UI wired to it). Save is a pure content edit
// that never changes status: for a pending row, Save and Approve stay two separate clicks
// (matching the design doc's literal "Approve / Reject / Edit" three-verb phrasing rather than
// merging them); for an active row, Save re-indexes in place — the branching between a draft
// edit and an in-place edit happens server-side in patchMemory based on the row's current
// status, transparent to this component.
function MemoryCard({ memory }: MemoryCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(memory.title);
    const [body, setBody] = useState(memory.body);
    const [category, setCategory] = useState<AgentMemoryCategory>(memory.category);
    const [deleting, setDeleting] = useState(false);

    const approveMutation = useApproveMemoryMutation();
    const rejectMutation = useRejectMemoryMutation();
    const reviseMutation = useReviseMemoryMutation();
    const deleteMutation = useDeleteMemoryMutation();
    const pinMutation = useSetMemoryPinnedMutation();

    const anyPending =
        approveMutation.isPending || rejectMutation.isPending || reviseMutation.isPending || deleteMutation.isPending;

    const startEdit = () => {
        setTitle(memory.title);
        setBody(memory.body);
        setCategory(memory.category);
        setIsEditing(true);
    };

    const cancelEdit = () => setIsEditing(false);

    const handleSave = () => {
        reviseMutation.mutate(
            { id: memory.id, data: { title, body, category } },
            { onSuccess: () => setIsEditing(false) }
        );
    };

    const handleDelete = async () => {
        const [error] = await attemptPromise(() => deleteMutation.mutateAsync(memory.id));
        if (error) {
            logger.error("Failed to delete memory:", error);
            return;
        }
        setDeleting(false);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Badge variant="secondary">{AGENT_MEMORY_CATEGORY_LABELS[memory.category]}</Badge>
                    {(memory.sourceJobId || memory.sourceScanId) && (
                        <span className="text-xs text-muted-foreground">via scan</span>
                    )}
                </div>
                <div className="flex gap-1 shrink-0">
                    {memory.status === "active" && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => pinMutation.mutate({ id: memory.id, pinned: !memory.pinned })}
                            disabled={pinMutation.isPending}
                            title={memory.pinned ? "Unpin" : "Pin — always included in chat context when Project Memory is on"}
                        >
                            {memory.pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
                        </Button>
                    )}
                    {(memory.status === "pending" || memory.status === "active") && !isEditing && (
                        <Button variant="ghost" size="icon" onClick={startEdit} disabled={anyPending} title="Edit">
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                    {memory.status !== "pending" && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(true)} disabled={anyPending} title="Delete">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {isEditing ? (
                    <>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
                        <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Body" rows={4} />
                        <Select value={category} onValueChange={value => setCategory(value as AgentMemoryCategory)}>
                            <SelectTrigger className="w-56">
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
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleSave} disabled={reviseMutation.isPending || !title.trim() || !body.trim()}>
                                {reviseMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={reviseMutation.isPending}>
                                Cancel
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3 className="font-semibold">{memory.title}</h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{memory.body}</p>
                    </>
                )}

                {memory.status === "pending" && !isEditing && (
                    <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => approveMutation.mutate(memory.id)} disabled={anyPending}>
                            {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => rejectMutation.mutate(memory.id)} disabled={anyPending}>
                            {rejectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            Reject
                        </Button>
                    </div>
                )}
            </CardContent>

            <AlertDialog open={deleting} onOpenChange={setDeleting}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the memory "{memory.title}".
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

// Stable sort, pinned first — the query already orders by createdAt desc, so this only reorders
// across the pinned/unpinned boundary, never within either group (prioritization UX, P1.1).
const byPinnedFirst = (a: AgentMemory, b: AgentMemory): number => Number(b.pinned) - Number(a.pinned);

export function ProjectMemoryList({ memories }: ProjectMemoryListProps) {
    return (
        <SearchFilter items={memories} predicate={memoryMatchesSearch} placeholder="Search memories...">
            {({ filteredItems, searchInput }) => (
                <div className="space-y-4">
                    {searchInput}

                    {filteredItems.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            {memories.length === 0 ? "No memories in this status yet." : "No memories match your search."}
                        </div>
                    )}

                    <div className="space-y-3">
                        {[...filteredItems].sort(byPinnedFirst).map(memory => (
                            <MemoryCard key={memory.id} memory={memory} />
                        ))}
                    </div>
                </div>
            )}
        </SearchFilter>
    );
}
