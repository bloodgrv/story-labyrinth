// Scene Beat Removal (docs/Scene_Beat_Removal_Design.md) — the feature is gone from the editor
// (no Alt+S, no SceneBeatNode registered, no `sceneBeats` table), but an old story/series/admin
// export/backup taken before this removal can still carry `scene-beat` nodes in its chapter
// content plus its own `sceneBeats` array (command text). Unregistering the node without
// rewriting that content on import would crash the editor on open ("Failure mode to avoid" in
// the design doc). This module converts every such node into a plain paragraph carrying the
// beat's own command text, never a silently-discarded blank node.
//
// The boot-time DB sweep this module used to also provide (SB1, migrating chapters/versions/
// snapshots already sitting in the live `sceneBeats`-table-backed database) was retired once SB6
// dropped that table — every row it would ever have touched was confirmed migrated first. Only
// the pure, DB-free conversion below survives, for the import paths' benefit.

type LexicalNode = {
    type?: string;
    sceneBeatId?: string;
    children?: LexicalNode[];
    [key: string]: unknown;
};

type LexicalRoot = { root?: LexicalNode };

const createParagraphFromCommand = (command: string): LexicalNode => ({
    type: "paragraph",
    version: 1,
    direction: "ltr",
    format: "",
    indent: 0,
    children: command
        ? [{ type: "text", version: 1, detail: 0, format: 0, mode: "normal", style: "", text: command }]
        : []
});

const replaceSceneBeatNodes = (node: LexicalNode, commandsById: Map<string, string>): LexicalNode => {
    if (node.type === "scene-beat")
        return createParagraphFromCommand(commandsById.get(node.sceneBeatId ?? "") ?? "");

    if (node.children) return { ...node, children: node.children.map(child => replaceSceneBeatNodes(child, commandsById)) };

    return node;
};

// Used by the story/series/admin import routes (SB5) — an old export file carries its own
// `sceneBeats` rows (command text) alongside chapter content, since there's no live DB table to
// look those commands up from once a fresh import lands.
export const migrateSceneBeatNodesInContent = (contentJson: string, commandsById: Map<string, string>): string => {
    if (!contentJson.includes('"scene-beat"')) return contentJson;

    const parsed = JSON.parse(contentJson) as LexicalRoot;
    if (!parsed.root) return contentJson;

    parsed.root = replaceSceneBeatNodes(parsed.root, commandsById);
    return JSON.stringify(parsed);
};
