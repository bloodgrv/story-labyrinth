// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — mirrors
// server/lib/trash.ts's TrashEntityType/TrashListRow.
export type TrashEntityType =
    | "story"
    | "series"
    | "chapter"
    | "folder"
    | "note"
    | "lorebook_entry"
    | "outline_item"
    | "prompt"
    | "playbook_pack"
    | "ai_chat"
    | "story_map"
    | "story_timeline"
    | "timeline_pin";

export interface TrashItem {
    id: string;
    type: TrashEntityType;
    title: string;
    storyId: string | null;
    storyTitle: string | null;
    deletedAt: string;
    purgeAt: string;
}
