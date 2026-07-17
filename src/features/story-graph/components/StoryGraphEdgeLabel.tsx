import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import { STORY_GRAPH_EDGE_TYPE_LABELS } from "@/types/storyGraph";
import type { StoryGraphEdge } from "@/types/storyGraph";

export type StoryGraphFlowEdgeData = {
    edge: StoryGraphEdge;
    onEdit: (edge: StoryGraphEdge) => void;
};

export type StoryGraphFlowEdge = Edge<StoryGraphFlowEdgeData & Record<string, unknown>, "storyGraphEdge">;

export function StoryGraphEdgeLabelComponent({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
    selected
}: EdgeProps<StoryGraphFlowEdge>) {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const edge = data?.edge;
    const text = edge ? edge.label || STORY_GRAPH_EDGE_TYPE_LABELS[edge.edgeType] : "";

    return (
        <>
            <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={selected ? { stroke: "var(--primary)" } : undefined} />
            <EdgeLabelRenderer>
                <button
                    type="button"
                    style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                    className="nodrag nopan absolute pointer-events-auto cursor-pointer rounded border bg-background px-1.5 py-0.5 text-[10px] hover:border-primary"
                    onClick={() => edge && data?.onEdit(edge)}
                >
                    {text}
                </button>
            </EdgeLabelRenderer>
        </>
    );
}
