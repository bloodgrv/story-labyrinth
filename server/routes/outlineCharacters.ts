import { schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";

// Plain CRUD over the outlineItems <-> lorebookEntries (character) link table — creating a link
// is "attach this character to this outline item", updating one edits its arcNote, deleting one
// unlinks. See outlineArcService.ts for how these links are read back as a per-character arc
// overview (GET /api/outline/story/:storyId/arc/:characterId).
export default createCrudRouter({
    table: schema.outlineItemCharacters,
    name: "Outline item character link",
    parentKey: "outlineItemId"
});
