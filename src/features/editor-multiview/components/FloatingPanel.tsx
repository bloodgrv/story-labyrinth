import { Dock, GripHorizontal, MoveDiagonal2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useEditorLayout } from "../context/EditorLayoutContext";
import { useFloatingPanels } from "../context/FloatingPanelsContext";
import { useTabMeta } from "../hooks/useTabMeta";
import type { FloatingPanelState } from "../types";
import { PaneTabContentView } from "./PaneTabContentView";

const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;

interface FloatingPanelProps {
    panel: FloatingPanelState;
    storyId: string;
    isFrontmost: boolean;
}

interface DragAnchor {
    startX: number;
    startY: number;
    panelX: number;
    panelY: number;
}

interface ResizeAnchor {
    startX: number;
    startY: number;
    width: number;
    height: number;
}

// A floating panel is docking's counterpart — see FloatingPanelsContext. Position/size are
// plain pixel state updated via pointer events (no drag/resize dependency needed for something
// this small: one draggable title bar, one resize handle).
export function FloatingPanel({ panel, storyId, isFrontmost }: FloatingPanelProps) {
    const { icon: Icon, label } = useTabMeta(panel.content);
    const { activePaneId, addTab } = useEditorLayout();
    const { closePanel, updatePanel, bringToFront } = useFloatingPanels();
    const [dragAnchor, setDragAnchor] = useState<DragAnchor | null>(null);
    const [resizeAnchor, setResizeAnchor] = useState<ResizeAnchor | null>(null);

    const dock = () => {
        closePanel(panel.id);
        addTab(activePaneId, panel.content);
    };

    const startDrag = (event: React.PointerEvent) => {
        bringToFront(panel.id);
        setDragAnchor({ startX: event.clientX, startY: event.clientY, panelX: panel.x, panelY: panel.y });
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onDrag = (event: React.PointerEvent) => {
        if (!dragAnchor) return;
        const { startX, startY, panelX, panelY } = dragAnchor;
        updatePanel(panel.id, {
            x: Math.max(0, panelX + (event.clientX - startX)),
            y: Math.max(0, panelY + (event.clientY - startY))
        });
    };

    const startResize = (event: React.PointerEvent) => {
        bringToFront(panel.id);
        setResizeAnchor({ startX: event.clientX, startY: event.clientY, width: panel.width, height: panel.height });
        event.currentTarget.setPointerCapture(event.pointerId);
        event.stopPropagation();
    };

    const onResize = (event: React.PointerEvent) => {
        if (!resizeAnchor) return;
        const { startX, startY, width, height } = resizeAnchor;
        updatePanel(panel.id, {
            width: Math.max(MIN_WIDTH, width + (event.clientX - startX)),
            height: Math.max(MIN_HEIGHT, height + (event.clientY - startY))
        });
    };

    const isBeingMoved = dragAnchor !== null || resizeAnchor !== null;

    return (
        <div
            className={cn(
                "pointer-events-auto absolute flex flex-col rounded-md border bg-background shadow-xl transition-shadow",
                isFrontmost ? "ring-1 ring-primary/30" : "ring-0",
                isBeingMoved && "shadow-2xl opacity-95"
            )}
            style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height }}
            onPointerDown={() => bringToFront(panel.id)}
        >
            <div
                className="flex cursor-move items-center gap-1.5 rounded-t-md border-b bg-muted/40 px-2 py-1.5 text-xs font-medium"
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={() => setDragAnchor(null)}
            >
                <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                <button type="button" className="rounded p-0.5 hover:bg-muted" title="Dock" onClick={dock}>
                    <Dock className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    className="rounded p-0.5 hover:bg-muted"
                    title="Close"
                    onClick={() => closePanel(panel.id)}
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                <PaneTabContentView content={panel.content} storyId={storyId} />
            </div>
            <div
                className="absolute bottom-0 right-0 flex h-4 w-4 cursor-se-resize items-end justify-end text-muted-foreground/50 hover:text-muted-foreground"
                onPointerDown={startResize}
                onPointerMove={onResize}
                onPointerUp={() => setResizeAnchor(null)}
            >
                <MoveDiagonal2 className="h-3 w-3" />
            </div>
        </div>
    );
}
