import type { ConcreteBeatType } from "@/types/beats";

// The Concrete Beats panel (a drawer in StoryEditor.tsx) lives outside the LexicalComposer
// tree, so it has no direct access to the editor instance to unwrap/insert a BeatMarkNode when
// its backing record is deleted or an AI suggestion is accepted. A DOM CustomEvent bridges the
// two: the panel's mutations dispatch these, and BeatMarkSyncPlugin (registered inside the
// composer, see Editor.tsx) listens and updates the document accordingly. Simpler than lifting
// editor state up or prop-drilling a ref through several unrelated layers just for this.
export const BEAT_DELETED_EVENT = "concrete-beat-deleted";
export const BEAT_ACCEPTED_EVENT = "concrete-beat-accepted";

export interface BeatDeletedEventDetail {
    beatId: string;
}

export interface BeatAcceptedEventDetail {
    beatId: string;
    text: string;
    beatType: ConcreteBeatType;
}
