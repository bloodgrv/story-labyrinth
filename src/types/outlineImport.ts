// Outline Import types (docs/Outline_Import_Design.md) — shared between server (extraction,
// routes) and client (draft edit UI, tray). Mirrors documentImportService.ts's draft-shape
// convention: a plain, freely-editable JSON tree, not the real outlineItems row shape, since
// nothing here is a real row until Accept (OI4).

export type DraftScene = {
    tempId: string;
    title: string;
    summary: string | null;
    wordCountTarget: number | null;
};

export type DraftChapter = {
    tempId: string;
    title: string;
    summary: string | null;
    wordCountTarget: number | null;
    scenes: DraftScene[];
};

export type OutlineImportBatchStatus = "extracting" | "ready" | "accepted" | "discarded";
export type OutlineImportMode = "append" | "replace";

// A real outlineItems row this batch wrote — populated only after Accept (OI4), used by OI7's
// post-Accept "Link to outline item" picker.
export type AcceptedOutlineItemRef = { id: string; title: string; type: "chapter" | "scene" };

export type OutlineImportBatch = {
    id: string;
    storyId: string;
    status: OutlineImportBatchStatus;
    sourceFilename: string;
    mode: OutlineImportMode;
    includeInAiArm: boolean;
    structureDraft: DraftChapter[];
    acceptedItemIds: AcceptedOutlineItemRef[] | null;
    chatId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ImportCastPayload = { name: string; context: string };
export type ImportArcNotePayload = { subject: string; text: string };
export type ImportHandoffPayload = { target: "wb" | "notes" | "research"; text: string };

export type OutlineImportChecklistKind = "import_cast" | "import_arc_note" | "import_handoff";
export type OutlineImportChecklistStatus = "pending" | "opened" | "done" | "dismissed";

export type OutlineImportChecklistItem = {
    id: string;
    batchId: string;
    storyId: string;
    kind: OutlineImportChecklistKind;
    status: OutlineImportChecklistStatus;
    payload: ImportCastPayload | ImportArcNotePayload | ImportHandoffPayload;
    createdAt: string;
    updatedAt: string;
};

// Returned by POST .../accept — the batch (now status "accepted") plus the ids of the real
// outlineItems rows it wrote, so post-Accept tray actions (OI7's cast-link) can target them.
export type OutlineImportAcceptResult = {
    batch: OutlineImportBatch;
    createdItemIds: { chapterId: string; tempId: string; sceneIds: { id: string; tempId: string }[] }[];
};
