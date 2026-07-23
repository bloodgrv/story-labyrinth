import "@xyflow/react/dist/style.css";
import {
    Background,
    Controls,
    type Connection,
    MiniMap,
    type NodeMouseHandler,
    type OnNodeDrag,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesState
} from "@xyflow/react";
import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { StoryMapEdge } from "@/types/storyMap";
import {
    useMapLayoutQuery,
    useResetMapLayoutMutation,
    useSaveMapLayoutPositionMutation,
    useStoryMapQuery
} from "../hooks/useStoryMapQuery";
import { layoutGrid } from "../lib/layout";
import { MapEdgeEditDialog } from "./MapEdgeEditDialog";
import { MapNodeSidePanel } from "./MapNodeSidePanel";
import { MapSearchBox } from "./MapSearchBox";
import { StoryMapEdgeLabelComponent, type StoryMapFlowEdge } from "./StoryMapEdgeLabel";
import { StoryMapNodeComponent, type StoryMapFlowNode } from "./StoryMapNode";

const nodeTypes = { storyMapNode: StoryMapNodeComponent };
const edgeTypes = { storyMapEdge: StoryMapEdgeLabelComponent };

interface StoryMapCanvasProps {
    storyId: string;
}

type ConnectDraft = { from: string; to?: string };

// Descendants of `rootId` reached by walking "contains" edges outward (root's own contents,
// transitively) — the "Focus on region" filter's scope. Undirected-BFS-style but only follows
// `contains` edges in their fromId->toId direction (a location "contains" its children), matching
// the design doc's "filter by region/parent" ask without a second full layout engine.
const descendantsOf = (rootId: string, edges: StoryMapEdge[]): Set<string> => {
    const containsChildren = new Map<string, string[]>();
    for (const e of edges) {
        if (e.edgeType !== "contains") continue;
        if (!containsChildren.has(e.fromId)) containsChildren.set(e.fromId, []);
        containsChildren.get(e.fromId)?.push(e.toId);
    }
    const visited = new Set<string>([rootId]);
    let frontier = [rootId];
    while (frontier.length > 0) {
        const next: string[] = [];
        for (const id of frontier)
            for (const child of containsChildren.get(id) ?? []) {
                if (visited.has(child)) continue;
                visited.add(child);
                next.push(child);
            }
        frontier = next;
    }
    return visited;
};

function StoryMapCanvasInner({ storyId }: StoryMapCanvasProps) {
    const { setPendingLorebookEntryId, setCurrentTool } = useStoryContext();
    const isOwner = useIsOwner();
    const mapQuery = useStoryMapQuery(storyId);
    const layoutQuery = useMapLayoutQuery(storyId);
    const saveLayoutPositionMutation = useSaveMapLayoutPositionMutation(storyId);
    const resetLayoutMutation = useResetMapLayoutMutation();
    const savedPositions = useMemo(
        () => new Map((layoutQuery.data?.positions ?? []).map(p => [p.nodeId, { x: p.x, y: p.y }])),
        [layoutQuery.data]
    );

    const allNodes = useMemo(() => mapQuery.data?.nodes ?? [], [mapQuery.data]);
    const allEdges = useMemo(() => mapQuery.data?.edges ?? [], [mapQuery.data]);
    const sortedNodes = useMemo(() => [...allNodes].sort((a, b) => a.name.localeCompare(b.name)), [allNodes]);
    const allNodesById = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes]);

    const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEdge, setEditingEdge] = useState<StoryMapEdge | null>(null);
    const [connectDraft, setConnectDraft] = useState<ConnectDraft | null>(null);

    const focusedIds = useMemo(() => (focusNodeId ? descendantsOf(focusNodeId, allEdges) : null), [focusNodeId, allEdges]);
    const displayedNodes = focusedIds ? allNodes.filter(n => focusedIds.has(n.id)) : allNodes;
    const displayedEdges = focusedIds ? allEdges.filter(e => focusedIds.has(e.fromId) && focusedIds.has(e.toId)) : allEdges;

    const handleOpenEntry = (id: string) => {
        setPendingLorebookEntryId(id);
        setCurrentTool("lorebook");
    };

    const openEditDialog = (edge: StoryMapEdge) => {
        setEditingEdge(edge);
        setConnectDraft(null);
        setDialogOpen(true);
    };

    const openAddEdgeDialog = (fromId: string) => {
        setEditingEdge(null);
        setConnectDraft({ from: fromId });
        setDialogOpen(true);
    };

    const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<StoryMapFlowNode>([]);
    const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<StoryMapFlowEdge>([]);

    useEffect(() => {
        const computedPositions = layoutGrid(displayedNodes);

        setFlowNodes(
            displayedNodes.map(n => ({
                id: n.id,
                type: "storyMapNode",
                position: savedPositions.get(n.id) ?? computedPositions.get(n.id) ?? { x: 0, y: 0 },
                data: { node: n, isFocused: n.id === focusNodeId, onOpenEntry: handleOpenEntry },
                selected: n.id === selectedNodeId
            }))
        );
        setFlowEdges(
            displayedEdges.map(e => ({
                id: e.id,
                source: e.fromId,
                target: e.toId,
                type: "storyMapEdge",
                data: { edge: e, onEdit: openEditDialog }
            }))
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayedNodes, displayedEdges, focusNodeId, selectedNodeId, savedPositions, setFlowNodes, setFlowEdges]);

    const onNodeDragStop: OnNodeDrag<StoryMapFlowNode> = (_, node) => {
        saveLayoutPositionMutation.mutate({ nodeId: node.id, x: node.position.x, y: node.position.y });
    };

    const onConnect = (connection: Connection) => {
        if (!connection.source || !connection.target) return;
        if (connection.source === connection.target) {
            toast.error("An edge cannot connect a location to itself");
            return;
        }
        setEditingEdge(null);
        setConnectDraft({ from: connection.source, to: connection.target });
        setDialogOpen(true);
    };

    const onNodeClick: NodeMouseHandler<StoryMapFlowNode> = (_, node) => setSelectedNodeId(node.id);

    const handleSearchSelect = (nodeId: string) => setSelectedNodeId(nodeId);

    const selectedNode = selectedNodeId ? allNodesById.get(selectedNodeId) : undefined;
    const isLoading = mapQuery.isLoading;

    if (isLoading && allNodes.length === 0)
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );

    if (allNodes.length === 0)
        return (
            <div className="flex items-center justify-center h-full p-6">
                <div className="max-w-sm text-center space-y-2 text-muted-foreground">
                    <p>No location entries yet in this story.</p>
                    <p className="text-sm">Add some location entries in the Lorebook tool, then come back to place them here.</p>
                </div>
            </div>
        );

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between gap-3 p-2 border-b bg-background/80 backdrop-blur">
                <Select value={focusNodeId ?? "__all"} onValueChange={v => setFocusNodeId(v === "__all" ? null : v)}>
                    <SelectTrigger className="w-56 h-8 text-sm">
                        <SelectValue placeholder="Focus on region" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all">All locations</SelectItem>
                        {sortedNodes.map(n => (
                            <SelectItem key={n.id} value={n.id}>
                                {n.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                    <MapSearchBox nodes={sortedNodes} onSelect={handleSearchSelect} />
                    {isOwner && savedPositions.size > 0 && (
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={resetLayoutMutation.isPending}
                            onClick={() => resetLayoutMutation.mutate(storyId)}
                            title="Clear saved node positions and go back to the automatic grid layout"
                        >
                            {resetLayoutMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Reset layout
                        </Button>
                    )}
                </div>
            </div>

            <div className="relative flex-1">
                <ReactFlow
                    nodes={flowNodes}
                    edges={flowEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    onNodeDragStop={onNodeDragStop}
                    onPaneClick={() => setSelectedNodeId(null)}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    proOptions={{ hideAttribution: true }}
                >
                    <Background />
                    <Controls />
                    <MiniMap pannable zoomable className="!bg-background" />
                </ReactFlow>

                {selectedNode && (
                    <MapNodeSidePanel
                        node={selectedNode}
                        edges={displayedEdges}
                        nodesById={allNodesById}
                        onOpenEntry={handleOpenEntry}
                        onAddEdgeFrom={openAddEdgeDialog}
                        onEditEdge={openEditDialog}
                        onFocusHere={id => setFocusNodeId(id)}
                        onClose={() => setSelectedNodeId(null)}
                    />
                )}
            </div>

            <MapEdgeEditDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                storyId={storyId}
                nodes={sortedNodes}
                edge={editingEdge}
                initialFromId={connectDraft?.from}
                initialToId={connectDraft?.to}
            />
        </div>
    );
}

export function StoryMapCanvas({ storyId }: StoryMapCanvasProps) {
    return (
        <ReactFlowProvider>
            <StoryMapCanvasInner storyId={storyId} />
        </ReactFlowProvider>
    );
}
