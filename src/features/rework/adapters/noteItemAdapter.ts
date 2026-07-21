import type { FocusPacket, FocusTarget } from "@/types/rework";

// Notes counterpart to outlineItemAdapter.ts — whole-note target only (title + content
// together), not a sub-span (P0.4 K2: react-simple-wysiwyg's contentEditable body has neither
// Lexical's node-key selection nor a plain <textarea>'s character offsets, so precise span
// capture was deliberately scoped out this pass). No neighbor context — unlike outline items,
// notes have no natural "adjacent" concept to surface as before/after. No "apply" function here
// either — Accept for a note-item rework is ChatInterface.tsx's existing note-proposal Accept
// path (handleAcceptNote), branching to update instead of create when activeRework is set.
export const captureNoteItemTarget = (note: { id: string; title: string; content: string }): { target: FocusTarget; packet: FocusPacket } => {
    const selection = `${note.title}\n\n${note.content}`;
    return {
        target: { kind: "note-item", noteId: note.id, text: selection },
        packet: { before: "", after: "", selection, beforeTruncated: false, afterTruncated: false }
    };
};
