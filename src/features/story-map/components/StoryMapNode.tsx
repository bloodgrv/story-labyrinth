import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { lorebookApi } from "@/services/api/client";
import { cn } from "@/lib/utils";
import type { StoryMapNode as StoryMapNodeData } from "@/types/storyMap";

export type StoryMapFlowNodeData = {
    node: StoryMapNodeData;
    isFocused: boolean;
    onOpenEntry: (id: string) => void;
};

export type StoryMapFlowNode = Node<StoryMapFlowNodeData & Record<string, unknown>, "storyMapNode">;

// Locations don't have the Relationship Graph's importance-tiered sizing (no equivalent concept
// here) — fixed size, square-ish (map-marker shaped, not the graph's circular avatar) to read as
// visually distinct from the Relationships tool.
export function StoryMapNodeComponent({ data, selected }: NodeProps<StoryMapFlowNode>) {
    const { node, isFocused, onOpenEntry } = data;

    return (
        <div className="relative" style={{ width: 64, height: 64 }}>
            <div
                className={cn(
                    "rounded-md border-[3px] bg-background shadow-sm flex items-center justify-center overflow-hidden select-none cursor-pointer w-full h-full",
                    node.isDisabled && "opacity-50",
                    selected && "ring-2 ring-primary ring-offset-2",
                    isFocused && "ring-2 ring-offset-2 ring-foreground/60"
                )}
                style={{ borderColor: "var(--primary)" }}
                title={node.name}
                onDoubleClick={() => onOpenEntry(node.id)}
            >
                <Handle type="target" position={Position.Left} className="opacity-0" />
                {node.imageFilename ? (
                    <img src={lorebookApi.imageUrl(node.id)} alt={node.name} className="w-full h-full object-cover" />
                ) : (
                    <span className="text-[10px] font-medium px-1 text-center leading-tight break-words line-clamp-3">{node.name}</span>
                )}
                <Handle type="source" position={Position.Right} className="opacity-0" />
            </div>
            {/* L5a — floor badge, only shown for locations nested under another via "contains" */}
            {node.floorLabel && (
                <span className="absolute -top-2 -right-2 rounded-full bg-secondary text-secondary-foreground text-[9px] px-1.5 py-0.5 border shadow-sm whitespace-nowrap">
                    {node.floorLabel}
                </span>
            )}
        </div>
    );
}
