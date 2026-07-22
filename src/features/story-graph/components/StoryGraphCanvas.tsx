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
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { StoryGraphEdge, StoryGraphNode } from "@/types/storyGraph";
import {
    useGraphLayoutQuery,
    useNeighborhoodQuery,
    usePendingEdgesQuery,
    useResetLayoutMutation,
    useSaveLayoutPositionMutation,
    useStoryGraphQuery,
    useSuggestGraphEdgesMutation
} from "../hooks/useStoryGraphQuery";
import { layoutEgo, layoutGrid } from "../lib/layout";
import { EdgeEditDialog } from "./EdgeEditDialog";
import { GraphMigrationBanner } from "./GraphMigrationBanner";
import { GraphNodeSidePanel } from "./GraphNodeSidePanel";
import { GraphSearchBox } from "./GraphSearchBox";
import { PendingEdgesPanel } from "./PendingEdgesPanel";
import { StoryGraphEdgeLabelComponent, type StoryGraphFlowEdge } from "./StoryGraphEdgeLabel";
import { StoryGraphNodeComponent, type StoryGraphFlowNode } from "./StoryGraphNode";

const nodeTypes = { storyGraphNode: StoryGraphNodeComponent };
const edgeTypes = { storyGraphEdge: StoryGraphEdgeLabelComponent };

interface StoryGraphCanvasProps {
    storyId: string;
}

type ConnectDraft = { from: string; to?: string };

function StoryGraphCanvasInner({ storyId }: StoryGraphCanvasProps) {
    const { setPendingLorebookEntryId, setCurrentTool } = useStoryContext();
    const isOwner = useIsOwner();
    const suggestEdgesMutation = useSuggestGraphEdgesMutation();
    const layoutQuery = useGraphLayoutQuery(storyId);
    const saveLayoutPositionMutation = useSaveLayoutPositionMutation(storyId);
    const resetLayoutMutation = useResetLayoutMutation();
    const savedPositions = useMemo(
        () => new Map((layoutQuery.data?.positions ?? []).map(p => [p.nodeId, { x: p.x, y: p.y }])),
        [layoutQuery.data]
    );
    const fullGraphQuery = useStoryGraphQuery(storyId);
    const allNodes = useMemo(() => fullGraphQuery.data?.nodes ?? [], [fullGraphQuery.data]);
    // Alphabetical — matches LorebookEntryList.tsx's own default sort, so ego-view's default
    // center and the search box's ordering aren't a surprise relative to the Lorebook tool.
    const sortedNodes = useMemo(() => [...allNodes].sort((a, b) => a.name.localeCompare(b.name)), [allNodes]);
    const allNodesById = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes]);

    const [viewMode, setViewMode] = useState<"ego" | "full" | "pending">("ego");
    const pendingQuery = usePendingEdgesQuery(storyId);
    const pendingCount = pendingQuery.data?.pending.length ?? 0;
    const [centerEntryId, setCenterEntryId] = useState<string | null>(null);
    const [depth, setDepth] = useState<1 | 2>(1);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEdge, setEditingEdge] = useState<StoryGraphEdge | null>(null);
    const [connectDraft, setConnectDraft] = useState<ConnectDraft | null>(null);

    useEffect(() => {
        if (centerEntryId || sortedNodes.length === 0) return;
        setCenterEntryId(sortedNodes[0].id);
    }, [sortedNodes, centerEntryId]);

    const neighborhoodQuery = useNeighborhoodQuery(storyId, viewMode === "ego" ? centerEntryId : null, depth);

    const displayedNodes: StoryGraphNode[] = viewMode === "ego" ? (neighborhoodQuery.data?.nodes ?? []) : allNodes;
    const displayedEdges: StoryGraphEdge[] = viewMode === "ego" ? (neighborhoodQuery.data?.edges ?? []) : (fullGraphQuery.data?.edges ?? []);

    const handleOpenEntry = (id: string) => {
        setPendingLorebookEntryId(id);
        setCurrentTool("lorebook");
    };

    const openEditDialog = (edge: StoryGraphEdge) => {
        setEditingEdge(edge);
        setConnectDraft(null);
        setDialogOpen(true);
    };

    const openAddEdgeDialog = (fromId: string) => {
        setEditingEdge(null);
        setConnectDraft({ from: fromId });
        setDialogOpen(true);
    };

    const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<StoryGraphFlowNode>([]);
    const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<StoryGraphFlowEdge>([]);

    // Recompute layout + rebuild flow nodes/edges whenever the underlying data or view params
    // change. Ego view's BFS-ring layout is relative to whichever entry is centered (not a stable
    // absolute position across different centers), so it's never persisted — any refetch there
    // still resets to the deterministic layout, nodes only draggable within that session via
    // onNodesChange. Full-graph view instead merges each node's saved position (P1.2 G1.5+) over
    // layoutGrid's computed fallback, so only nodes that were never dragged fall back to the grid.
    useEffect(() => {
        const computedPositions =
            viewMode === "ego" && centerEntryId ? layoutEgo(displayedNodes, displayedEdges, centerEntryId) : layoutGrid(displayedNodes);
        const positions = viewMode === "full" ? savedPositions : null;

        setFlowNodes(
            displayedNodes.map(n => ({
                id: n.id,
                type: "storyGraphNode",
                position: positions?.get(n.id) ?? computedPositions.get(n.id) ?? { x: 0, y: 0 },
                data: { node: n, isCenter: n.id === centerEntryId, onOpenEntry: handleOpenEntry },
                selected: n.id === selectedNodeId
            }))
        );
        setFlowEdges(
            displayedEdges.map(e => ({
                id: e.id,
                source: e.fromId,
                target: e.toId,
                type: "storyGraphEdge",
                data: { edge: e, onEdit: openEditDialog }
            }))
        );
        // Deliberately keyed on the data/view params only — handleOpenEntry/openEditDialog are
        // recreated every render but are stable in effect (StoryContext setters are stable,
        // dialog-open setState calls don't need to retrigger a layout recompute).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayedNodes, displayedEdges, centerEntryId, viewMode, selectedNodeId, savedPositions, setFlowNodes, setFlowEdges]);

    const onNodeDragStop: OnNodeDrag<StoryGraphFlowNode> = (_, node) => {
        // Only Full-graph view persists — see the layout effect's own comment above.
        if (viewMode !== "full") return;
        saveLayoutPositionMutation.mutate({ nodeId: node.id, x: node.position.x, y: node.position.y });
    };

    const onConnect = (connection: Connection) => {
        if (!connection.source || !connection.target) return;
        if (connection.source === connection.target) {
            toast.error("An edge cannot connect an entry to itself");
            return;
        }
        setEditingEdge(null);
        setConnectDraft({ from: connection.source, to: connection.target });
        setDialogOpen(true);
    };

    const onNodeClick: NodeMouseHandler<StoryGraphFlowNode> = (_, node) => setSelectedNodeId(node.id);

    const handleSearchSelect = (nodeId: string) => {
        setViewMode("ego");
        setCenterEntryId(nodeId);
        setSelectedNodeId(nodeId);
    };

    const selectedNode = selectedNodeId ? allNodesById.get(selectedNodeId) : undefined;
    const isLoading = fullGraphQuery.isLoading || (viewMode === "ego" && neighborhoodQuery.isLoading);
    const hasLegacyRelationships = fullGraphQuery.data?.hasLegacyRelationships ?? false;
    const totalEdgeCount = fullGraphQuery.data?.edges.length ?? 0;

    if (isLoading && displayedNodes.length === 0)
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );

    if (allNodes.length === 0)
        return (
            <div className="flex items-center justify-center h-full p-6">
                <div className="max-w-sm text-center space-y-2 text-muted-foreground">
                    <p>No lorebook entries yet in this story.</p>
                    <p className="text-sm">Add some entries in the Lorebook tool, then come back to link them here.</p>
                </div>
            </div>
        );

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between gap-3 p-2 border-b bg-background/80 backdrop-blur">
                <div className="flex items-center gap-2">
                    <Tabs value={viewMode} onValueChange={v => setViewMode(v as "ego" | "full" | "pending")}>
                        <TabsList>
                            <TabsTrigger value="ego">Ego view</TabsTrigger>
                            <TabsTrigger value="full">Full graph</TabsTrigger>
                            <TabsTrigger value="pending">Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {viewMode === "ego" && (
                        <Tabs value={String(depth)} onValueChange={v => setDepth(v === "2" ? 2 : 1)}>
                            <TabsList>
                                <TabsTrigger value="1">1 hop</TabsTrigger>
                                <TabsTrigger value="2">2 hops</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {viewMode !== "pending" && <GraphSearchBox nodes={sortedNodes} onSelect={handleSearchSelect} />}
                    {isOwner && viewMode === "full" && savedPositions.size > 0 && (
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
                    {isOwner && (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={suggestEdgesMutation.isPending}
                            onClick={() => suggestEdgesMutation.mutate(storyId)}
                            title="Propose new relationships from this story's lorebook entry descriptions — reviewed in the Pending tab"
                        >
                            {suggestEdgesMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Suggest relationships
                        </Button>
                    )}
                </div>
            </div>

            {viewMode !== "pending" &&
                (hasLegacyRelationships ? (
                    <div className="p-2 border-b">
                        <GraphMigrationBanner storyId={storyId} variant="legacy" />
                    </div>
                ) : totalEdgeCount === 0 ? (
                    <div className="p-2 border-b">
                        <GraphMigrationBanner storyId={storyId} variant="empty" />
                    </div>
                ) : null)}

            <div className="relative flex-1">
                {viewMode === "pending" ? (
                    <PendingEdgesPanel storyId={storyId} />
                ) : (
                    <>
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
                            <GraphNodeSidePanel
                                node={selectedNode}
                                edges={displayedEdges}
                                nodesById={allNodesById}
                                onOpenEntry={handleOpenEntry}
                                onAddEdgeFrom={openAddEdgeDialog}
                                onEditEdge={openEditDialog}
                                onClose={() => setSelectedNodeId(null)}
                            />
                        )}
                    </>
                )}
            </div>

            <EdgeEditDialog
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

export function StoryGraphCanvas({ storyId }: StoryGraphCanvasProps) {
    return (
        <ReactFlowProvider>
            <StoryGraphCanvasInner storyId={storyId} />
        </ReactFlowProvider>
    );
}
