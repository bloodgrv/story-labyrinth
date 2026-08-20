import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { lorebookApi } from "@/services/api/client";
import { cn } from "@/lib/utils";
import type { StoryGraphNode as StoryGraphNodeData } from "@/types/storyGraph";
import { categoryColor } from "../lib/categoryColors";

export type StoryGraphFlowNodeData = {
    node: StoryGraphNodeData;
    isCenter: boolean;
    onOpenEntry: (id: string) => void;
};

export type StoryGraphFlowNode = Node<StoryGraphFlowNodeData & Record<string, unknown>, "storyGraphNode">;

const SIZE_BY_IMPORTANCE: Record<string, number> = { major: 76, minor: 60, background: 48 };

// B8 — the default xyflow handle is only `min-width/height: 5px` and, being a normal DOM
// descendant of the zoom-transformed `.react-flow__nodes` pane, shrinks in actual screen pixels
// right along with the canvas zoom. At 100% that's already a tight target; zoomed out (the
// reported repro was ~58px nodes) it becomes small enough that a drag started "on" the handle
// routinely lands on the node body instead, silently repositioning the node instead of starting a
// connection — with zero visual cue, since the handles were also permanently invisible
// (`opacity-0`), so the miss looks like intended behavior rather than a failure. Two independent
// fixes: a much larger explicit hit-size (well above the 5px default, so it survives typical
// zoom-out levels) and `group-hover:opacity-100` so the handle is actually visible — and
// discoverable — right when a user is about to try dragging from it, instead of never at all.
const HANDLE_HIT_SIZE = 14;
const handleStyle = { width: HANDLE_HIT_SIZE, height: HANDLE_HIT_SIZE };

export function StoryGraphNodeComponent({ data, selected }: NodeProps<StoryGraphFlowNode>) {
    const { node, isCenter, onOpenEntry } = data;
    const size = SIZE_BY_IMPORTANCE[node.importance ?? ""] ?? 56;

    return (
        <div
            className={cn(
                "group rounded-full border-[3px] bg-background shadow-sm flex items-center justify-center overflow-hidden select-none cursor-pointer",
                node.isDisabled && "opacity-50",
                selected && "ring-2 ring-primary ring-offset-2",
                isCenter && "ring-2 ring-offset-2 ring-foreground/60"
            )}
            style={{ width: size, height: size, borderColor: categoryColor(node.category) }}
            title={node.name}
            onDoubleClick={() => onOpenEntry(node.id)}
        >
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                style={handleStyle}
            />
            {node.imageFilename ? (
                <img src={lorebookApi.imageUrl(node.id)} alt={node.name} className="w-full h-full object-cover rounded-full" />
            ) : (
                <span className="text-[10px] font-medium px-1 text-center leading-tight break-words line-clamp-3">
                    {node.name}
                </span>
            )}
            <Handle
                type="source"
                position={Position.Right}
                className="!bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                style={handleStyle}
            />
        </div>
    );
}
