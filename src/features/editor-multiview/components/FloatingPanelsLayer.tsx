import { useFloatingPanels } from "../context/FloatingPanelsContext";
import { FloatingPanel } from "./FloatingPanel";

interface FloatingPanelsLayerProps {
    storyId: string;
}

// Mounted once above the resizable pane grid (see EditorMultiView) so floating panels can be
// dragged anywhere within the editor area without being clipped by any individual pane.
export function FloatingPanelsLayer({ storyId }: FloatingPanelsLayerProps) {
    const { panels } = useFloatingPanels();

    if (panels.length === 0) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-20">
            {panels.map((panel, index) => (
                <FloatingPanel
                    key={panel.id}
                    panel={panel}
                    storyId={storyId}
                    isFrontmost={index === panels.length - 1}
                />
            ))}
        </div>
    );
}
