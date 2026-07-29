import { CAN_USE_DOM } from "@/components/story-editor/shared/canUseDOM";

export const IS_APPLE: boolean = CAN_USE_DOM && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const IS_CHROME: boolean = CAN_USE_DOM && /^(?=.*Chrome).*/i.test(navigator.userAgent);

// The editor's own "narrow viewport" threshold (tablet and below) — drives Editor.tsx's
// isSmallWidthViewport and should match every editor-adjacent CSS media query using the same
// concept (ContentEditable.css, FloatingTextFormatToolbarPlugin/index.css), so "mobile mode"
// means the same width everywhere in the editor rather than five independently-chosen numbers.
export const EDITOR_NARROW_VIEWPORT_PX = 1025;
