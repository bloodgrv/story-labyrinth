import { ArrowRight, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STORY_GRAPH_EDGE_TYPE_LABELS } from "@/types/storyGraph";
import type { StoryGraphEdge, StoryGraphNode } from "@/types/storyGraph";
import { categoryColor } from "../lib/categoryColors";

interface GraphNodeSidePanelProps {
    node: StoryGraphNode;
    edges: StoryGraphEdge[];
    nodesById: Map<string, StoryGraphNode>;
    onOpenEntry: (id: string) => void;
    onAddEdgeFrom: (id: string) => void;
    onEditEdge: (edge: StoryGraphEdge) => void;
    onClose: () => void;
}

export function GraphNodeSidePanel({ node, edges, nodesById, onOpenEntry, onAddEdgeFrom, onEditEdge, onClose }: GraphNodeSidePanelProps) {
    const outgoing = edges.filter(e => e.fromId === node.id);
    const incoming = edges.filter(e => e.toId === node.id);

    return (
        <div className="absolute right-3 top-3 bottom-3 w-72 rounded-lg border bg-background shadow-lg flex flex-col overflow-hidden z-10">
            <div className="flex items-start justify-between gap-2 p-3 border-b">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: categoryColor(node.category) }} />
                        <h3 className="font-semibold truncate">{node.name}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{node.category}</p>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="p-3 space-y-2 border-b">
                <Button size="sm" className="w-full" onClick={() => onOpenEntry(node.id)}>
                    Open entry
                </Button>
                <Button size="sm" variant="outline" className="w-full" onClick={() => onAddEdgeFrom(node.id)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add relationship
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1.5">Outgoing ({outgoing.length})</h4>
                    {outgoing.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                    <div className="space-y-1">
                        {outgoing.map(edge => (
                            <button
                                key={edge.id}
                                type="button"
                                onClick={() => onEditEdge(edge)}
                                className="w-full text-left text-xs rounded border px-2 py-1.5 hover:border-primary flex items-center gap-1 min-w-0"
                            >
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {edge.label || STORY_GRAPH_EDGE_TYPE_LABELS[edge.edgeType]}
                                </Badge>
                                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{nodesById.get(edge.toId)?.name ?? edge.toId}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1.5">Incoming ({incoming.length})</h4>
                    {incoming.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                    <div className="space-y-1">
                        {incoming.map(edge => (
                            <button
                                key={edge.id}
                                type="button"
                                onClick={() => onEditEdge(edge)}
                                className="w-full text-left text-xs rounded border px-2 py-1.5 hover:border-primary flex items-center gap-1 min-w-0"
                            >
                                <span className="truncate">{nodesById.get(edge.fromId)?.name ?? edge.fromId}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {edge.label || STORY_GRAPH_EDGE_TYPE_LABELS[edge.edgeType]}
                                </Badge>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
