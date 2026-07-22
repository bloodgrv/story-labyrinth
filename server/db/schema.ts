import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Series table
export const series = sqliteTable(
    "series",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        description: text("description"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        isDemo: integer("isDemo", { mode: "boolean" })
    },
    table => ({
        nameIdx: index("series_name_idx").on(table.name),
        createdAtIdx: index("series_created_at_idx").on(table.createdAt)
    })
);

// Stories table
export const stories = sqliteTable(
    "stories",
    {
        id: text("id").primaryKey(),
        title: text("title").notNull(),
        author: text("author").notNull(),
        language: text("language").notNull(),
        synopsis: text("synopsis"),
        seriesId: text("seriesId").references(() => series.id, { onDelete: "set null" }),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        isDemo: integer("isDemo", { mode: "boolean" }),
        // C4 (docs/CURRENT_BACKLOG.md P0.3) — per-story opt-in for an unattended rag_scan_story on
        // a fixed daily cadence (jobRunner.ts's runScheduleTick). Default false: the design doc's
        // "unattended scan policy: default OFF" applies per-story now, not just "no setting yet".
        // No separate interval column — a single fixed daily cadence (matching prune_history's own
        // cadence) avoids a config surface for a feature this narrow; revisit only if requested.
        unattendedScanEnabled: integer("unattendedScanEnabled", { mode: "boolean" }).notNull().default(false)
    },
    table => ({
        titleIdx: index("title_idx").on(table.title),
        createdAtIdx: index("created_at_idx").on(table.createdAt),
        seriesIdIdx: index("story_series_id_idx").on(table.seriesId)
    })
);

// Chapters table
export const chapters = sqliteTable(
    "chapters",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        summary: text("summary"),
        order: integer("order").notNull(),
        content: text("content").notNull(),
        outline: text("outline", { mode: "json" }), // JSON: { content: string, lastUpdated: Date }
        wordCount: integer("wordCount").notNull().default(0),
        povCharacter: text("povCharacter"),
        povType: text("povType"), // 'First Person' | 'Third Person Limited' | 'Third Person Omniscient'
        notes: text("notes", { mode: "json" }), // JSON: { content: string, lastUpdated: Date }
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        isDemo: integer("isDemo", { mode: "boolean" })
    },
    table => ({
        storyIdIdx: index("chapter_story_id_idx").on(table.storyId),
        orderIdx: index("chapter_order_idx").on(table.order)
    })
);

// Chapter Versions — alternate drafts of a chapter (AI-regenerated or manually duplicated),
// shown as tabs next to the main chapter in the editor. Flat, not a branching tree: every
// version is a direct sibling, independently editable via its own autosave. The main chapter's
// `content` stays authoritative the whole time — a version only ever affects it via an explicit
// "compile" action (copies the version's content into chapters.content); nothing here rewires
// what the editor, RAG index, or export treat as "the chapter." See DECISIONS.md's "Story-Layer
// Chapter Versioning" entry for the scoping decisions (flat list, main-is-king, no auto-history).
export const chapterVersions = sqliteTable(
    "chapterVersions",
    {
        id: text("id").primaryKey(),
        chapterId: text("chapterId")
            .notNull()
            .references(() => chapters.id, { onDelete: "cascade" }),
        content: text("content").notNull(),
        sourceType: text("sourceType").notNull(), // 'ai' | 'manual'
        // User-set name (e.g. "Darker ending"); null shows a fallback like "Version 2" in the UI.
        label: text("label"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        chapterIdIdx: index("chapter_version_chapter_id_idx").on(table.chapterId),
        createdAtIdx: index("chapter_version_created_at_idx").on(table.createdAt)
    })
);

// Chapter Snapshots — linear undo history for the main chapter's own content (P0.2b, the
// original "Project Saves — Story layer" problem; a different, unrelated feature from
// chapterVersions above — see DECISIONS.md's "Story-Layer Chapter Versioning (P0.2)" entry for
// why those two must not be conflated). Mirrors codexSnapshots' shape and restore-chain pattern
// (sourceRef points back at what a 'restore' snapshot restored from). Unlike codexSnapshots,
// which snapshots on every discrete mutation, chapters autosave continuously while typing, so
// 'auto' snapshots are throttled server-side (see chapterSnapshotsRepository.ts's
// maybeAutoSnapshot) rather than taken on every save.
export const chapterSnapshots = sqliteTable(
    "chapterSnapshots",
    {
        id: text("id").primaryKey(),
        chapterId: text("chapterId")
            .notNull()
            .references(() => chapters.id, { onDelete: "cascade" }),
        content: text("content").notNull(),
        sourceType: text("sourceType").notNull(), // 'auto' | 'manual' | 'restore'
        sourceRef: text("sourceRef"), // snapshotId restored from ('restore'), or the compiled versionId ('auto' safety snapshot before a Compile)
        // User-set name (e.g. "Before the Prague rewrite"); null shows a fallback in the UI.
        label: text("label"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        chapterIdIdx: index("chapter_snapshot_chapter_id_idx").on(table.chapterId),
        createdAtIdx: index("chapter_snapshot_created_at_idx").on(table.createdAt)
    })
);

// AI Chats table
export const aiChats = sqliteTable(
    "aiChats",
    {
        id: text("id").primaryKey(),
        // Nullable — global chats (chatType='research') have no story; see getGlobalChat.
        storyId: text("storyId").references(() => stories.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        messages: text("messages", { mode: "json" }).notNull(), // JSON: ChatMessage[]
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }),
        lastUsedPromptId: text("lastUsedPromptId"),
        lastUsedModelId: text("lastUsedModelId"),
        isDemo: integer("isDemo", { mode: "boolean" }),
        chatType: text("chatType"), // 'worldbuilding' | 'research' | 'editor' | 'outline' | 'brainstorm' | 'general' — null treated as 'general'
        templateSlug: text("templateSlug"), // identifies the worldbuilding template; only meaningful when chatType='worldbuilding'
        // Lorebook entry this chat was opened from (WorldBuildingChatPanel) — lets getChatContext
        // ground the AI in it directly instead of RAG search luck. Null otherwise. Plain column,
        // not a real FK: SQLite's ALTER TABLE ADD COLUMN doesn't support ON DELETE clauses at all
        // (confirmed - drizzle-kit silently drops it for every column added this way in this
        // repo's own migration history), and foreign_keys enforcement IS actually on for this
        // connection (better-sqlite3 defaults it on - confirmed live; the "off database-wide"
        // claim on concreteBeats.characterId below is stale/wrong), so a real inline FK here would
        // block deleting any entry ever used as an anchor. Same call outlineItems.parentId already
        // makes below for the same reason: cleaned up in application code instead (see
        // chatContextService.ts's resolveAnchorAndRelated, which already degrades gracefully on a
        // stale/missing anchor id).
        anchorEntryId: text("anchorEntryId"),
        // Chapter this chat was opened while focused on (EditorChatRail via StoryEditor's
        // currentChapterId) — lets getChatContext ground the AI in the chapter's actual current
        // content via its own ragChunks, not RAG search luck. Null otherwise. A chat only ever has
        // one of anchorEntryId/anchorChapterId set, never both — each is written only by its own
        // creation path (createWorldBuildingChat vs createGenericChat). Plain column, not a real
        // FK — same reasoning as anchorEntryId above.
        anchorChapterId: text("anchorChapterId"),
        // Per-chat opt-in gates for the Notes/Outline ↔ chat bridge
        // (docs/Notes_Outline_Chat_Bridges_Design.md) — the other half of the double gate, paired
        // with each note/outline item's own includeInAi flag. Both default false; Editor chats
        // never expose these toggles in the UI (stay canon-only).
        includeNotes: integer("includeNotes", { mode: "boolean" }).notNull().default(false),
        includeOutline: integer("includeOutline", { mode: "boolean" }).notNull().default(false),
        // Opt-in gate for surfacing active Project Memory (agentMemories, Agent Framework Phase B)
        // in this chat's context — Agent_Framework_And_Project_Memory_Design.md §4.5's "Include
        // project memory" toggle (C1). Unlike includeNotes/includeOutline, there's no per-item
        // flag on the other side of this gate — every `status: "active"` memory for the story is
        // already index-eligible (Phase B's own approve step is the gate), so this chat-level flag
        // is the only opt-in needed.
        includeMemory: integer("includeMemory", { mode: "boolean" }).notNull().default(false),
        // Brainstorm-only opt-in gates (P0.4 B0-B4, docs/Chat_Panel_Integrations_Design.md §5) —
        // unlike every other chat type, lorebook search is OFF by default for Brainstorm (it's an
        // intake hub, not grounded in established Codex state the way WB/Editor/Outline are); see
        // chatContextService.ts's entityTypes computation. Chapter summaries mirror the Outline
        // chat's own always-on resolveWrittenChapterSummaries read, just toggle-gated here instead.
        // Both default false and are ignored (never read) for any other chatType.
        includeLorebook: integer("includeLorebook", { mode: "boolean" }).notNull().default(false),
        includeChapterSummaries: integer("includeChapterSummaries", { mode: "boolean" }).notNull().default(false),
        // Light | Standard | Grill-me — shapes how deeply the model interviews the user in a
        // Brainstorm chat (docs/Chat_Panel_Integrations_Design.md §5 "Style dropdown"). Confirmed
        // with user as prompt-shaping only, not a tracked interview state machine — see
        // chatContextService.ts's BRAINSTORM_STYLE_HINTS. Ignored for any other chatType.
        brainstormStyle: text("brainstormStyle").notNull().default("standard"), // 'light' | 'standard' | 'grill'
        // Same guided-start style concept as brainstormStyle, extended to WB and Outline chats
        // (P0.4 B5, docs/Chat_Panel_Integrations_Design.md §1's "same guided-start UX model").
        // Kept as separate columns rather than one shared "style" column so each chatType's own
        // read stays a simple, ungated column access in chatContextService.ts's getChatContext —
        // matches the existing convention of per-purpose typed columns over a generic shared one.
        wbStyle: text("wbStyle").notNull().default("standard"), // 'light' | 'standard' | 'grill' — worldbuilding chats only
        outlineStyle: text("outlineStyle").notNull().default("standard"), // 'light' | 'standard' | 'grill' — outline chats only
        // Cosmetic org folder this chat is filed under (B9, docs/Folders_Org_Design.md) — null =
        // Unfiled. No FK — same reasoning as anchorEntryId above (fresh ALTER TABLE ADD COLUMN,
        // FK enforcement is on, folders can be deleted independently of chats). Cleaned up in
        // application code by folderService.deleteFolder (reparents leaves, never cascades).
        folderId: text("folderId"),
        // Opt-in for the Character template's psych module (MBTI + Enneagram + freeform blurb,
        // docs/Chat_Panel_Integrations_Design.md §1's "Character playbook — psych module").
        // Explicitly NOT Codex state — never read by codexService.ts, stored instead on the
        // anchor entry's own metadata.psychProfile (see chatContextService.ts's PSYCH_MODULE_
        // INSTRUCTIONS and ChatInterface.tsx's handleAcceptPsych). Default false; only ever
        // offered to the model when the chat's own templateSlug is "character_codex" AND it has
        // an anchorEntryId (nowhere to attach a proposal otherwise) — see getChatContext.
        includePsychModule: integer("includePsychModule", { mode: "boolean" }).notNull().default(false),
        // P0.4 R6 — auto-insert/auto-accept toggles (docs/Chat_Panel_Integrations_Design.md doctrine
        // line 15: "No silent canon unless an explicit auto-accept/auto-insert toggle is ON"). All
        // default false, per-chat, mirror includePsychModule's pattern exactly.
        autoInsertProse: integer("autoInsertProse", { mode: "boolean" }).notNull().default(false), // Editor chats only
        autoAcceptCodex: integer("autoAcceptCodex", { mode: "boolean" }).notNull().default(false), // Editor/WB/Outline
        autoAcceptOutline: integer("autoAcceptOutline", { mode: "boolean" }).notNull().default(false), // Outline create/edit/reorder only, never delete
        // P0.4 S1 — Research-only. Live web search + page fetch is the desk's core job (design doc
        // §6: "Web search + page fetch | ON (core)"), so this defaults true, unlike every other
        // opt-in toggle on this table — it's an off-switch, not an opt-in. Ignored for every other
        // chatType (see chatContextService.ts's getChatContext).
        webSearchEnabled: integer("webSearchEnabled", { mode: "boolean" }).notNull().default(true),
        // Chat Shuttle H7 (docs/Chat_Shuttle_Design.md) — Editor/Outline/WB-only "always-shuttle"
        // pref for high-confidence external-fact lookups. Default false, mirrors autoAcceptCodex's
        // posture exactly. Even when on, this only skips the tray's manual "Open" click (the
        // ```shuttle-proposal row is created already "opened" instead of "pending" and the
        // question+crumb is pre-seeded into Research) — it never auto-sends/auto-generates a
        // Research answer and never force-switches the user's current tool, per the design doc's
        // decision #1 ("No silent full auto-shuttle of answers in v1").
        autoShuttle: integer("autoShuttle", { mode: "boolean" }).notNull().default(false)
    },
    table => ({
        storyIdIdx: index("chat_story_id_idx").on(table.storyId),
        typeIdx: index("chat_type_idx").on(table.chatType),
        anchorEntryIdIdx: index("chat_anchor_entry_id_idx").on(table.anchorEntryId),
        anchorChapterIdIdx: index("chat_anchor_chapter_id_idx").on(table.anchorChapterId)
    })
);

// Prompts table
export const prompts = sqliteTable(
    "prompts",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        description: text("description"),
        // 'scene_beat' | 'gen_summary' | 'selection_specific' | 'continue_writing' | 'other' | 'brainstorm' | 'worldbuilding' | 'research' | 'editor'
        promptType: text("promptType").notNull(),
        messages: text("messages", { mode: "json" }).notNull(), // JSON: PromptMessage[]
        allowedModels: text("allowedModels", { mode: "json" }).notNull(), // JSON: AllowedModel[]
        storyId: text("storyId").references(() => stories.id, { onDelete: "cascade" }),
        isSystem: integer("isSystem", { mode: "boolean" }),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        nameIdx: index("prompt_name_idx").on(table.name),
        promptTypeIdx: index("prompt_type_idx").on(table.promptType),
        storyIdIdx: index("prompt_story_id_idx").on(table.storyId)
    })
);

// AI Settings table
export const aiSettings = sqliteTable("aiSettings", {
    id: text("id").primaryKey(),
    openaiKey: text("openaiKey"),
    openrouterKey: text("openrouterKey"),
    geminiKey: text("geminiKey"),
    grokKey: text("grokKey"),
    grokSessionCookie: text("grokSessionCookie"),
    grokOAuthAccessToken: text("grokOAuthAccessToken"),
    grokOAuthRefreshToken: text("grokOAuthRefreshToken"),
    grokOAuthExpiresAt: integer("grokOAuthExpiresAt"),
    availableModels: text("availableModels", { mode: "json" }).notNull(), // JSON: AIModel[]
    lastModelsFetch: integer("lastModelsFetch", { mode: "timestamp" }),
    localApiUrl: text("localApiUrl"),
    defaultLocalModel: text("defaultLocalModel"),
    defaultOpenAIModel: text("defaultOpenAIModel"),
    defaultOpenRouterModel: text("defaultOpenRouterModel"),
    defaultGeminiModel: text("defaultGeminiModel"),
    defaultGrokModel: text("defaultGrokModel"),
    defaultGrokSessionModel: text("defaultGrokSessionModel"),
    defaultGrokOAuthModel: text("defaultGrokOAuthModel"),
    featureEndpoints: text("featureEndpoints"), // JSON: FeatureEndpoints — per-feature model/endpoint overrides
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
});

// TTS Settings table — provider-agnostic: `providers` holds a JSON blob keyed by provider id
// (TtsProviderConfigs), so adding a new TTS provider later is just a new key in that object,
// no schema migration required. Mirrors the extensibility of aiSettings.featureEndpoints.
// `availableVoices` caches each provider's voice catalog (also keyed by provider id) so the
// settings UI doesn't need to hit the provider's API on every page load.
export const ttsSettings = sqliteTable("ttsSettings", {
    id: text("id").primaryKey(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    activeProvider: text("activeProvider").notNull().default("speechify"),
    providers: text("providers", { mode: "json" }).notNull(), // JSON: TtsProviderConfigs
    availableVoices: text("availableVoices", { mode: "json" }).notNull().default("{}"), // JSON: TtsAvailableVoices
    lastVoicesFetch: integer("lastVoicesFetch", { mode: "timestamp" }),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
});

// Per-story TTS voice override — absent means "use the global default voice" for whichever
// provider is active (see ttsSettings.providers[provider].defaultVoiceId). One row per story;
// the unique constraint on storyId is what makes the upsert in routes/tts.ts safe.
export const storyTtsPreferences = sqliteTable("storyTtsPreferences", {
    id: text("id").primaryKey(),
    storyId: text("storyId")
        .notNull()
        .unique()
        .references(() => stories.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // TtsProvider
    voiceId: text("voiceId").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
});

// Humanizer Settings table — single global row (no per-story override, unlike TTS voices).
// `intensity` selects which canned system prompt/temperature is used for the rewrite pass —
// see server/services/humanizerService.ts. The actual AI connection is resolved through the
// existing per-feature endpoint system (aiSettings.featureEndpoints.humanizer), not stored here.
export const humanizerSettings = sqliteTable("humanizerSettings", {
    id: text("id").primaryKey(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    intensity: text("intensity").notNull().default("medium"), // HumanizerIntensity: 'light' | 'medium' | 'strong'
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
});

// Grammar Checker Settings table — single global row. Unlike the AI features (humanizer, beat
// detection, etc.), LanguageTool isn't an OpenAI-compatible chat endpoint, so it doesn't go
// through aiClientFactory/featureEndpoints — it gets its own server URL here, the same shape as
// TTS's provider config but for a single fixed "provider" (a self-hosted or externally pointed
// LanguageTool instance) rather than a set of swappable ones.
export const grammarSettings = sqliteTable("grammarSettings", {
    id: text("id").primaryKey(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    serverUrl: text("serverUrl").notNull().default("http://localhost:8010"),
    language: text("language").notNull().default("auto"), // LanguageTool language code, or "auto" to auto-detect
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
});

// Lorebook Entries table
export const lorebookEntries = sqliteTable(
    "lorebookEntries",
    {
        id: text("id").primaryKey(),
        level: text("level").notNull().default("story"),
        scopeId: text("scopeId"),
        name: text("name").notNull(),
        description: text("description").notNull(),
        category: text("category").notNull(), // 'character' | 'location' | 'item' | 'event' | 'note' | 'synopsis' | 'starting scenario' | 'timeline'
        tags: text("tags", { mode: "json" }).notNull(), // JSON: string[]
        metadata: text("metadata", { mode: "json" }), // JSON: metadata object
        isDisabled: integer("isDisabled", { mode: "boolean" }),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        isDemo: integer("isDemo", { mode: "boolean" }),
        codexEnabled: integer("codexEnabled", { mode: "boolean" }),
        needsFleshingOut: integer("needsFleshingOut", { mode: "boolean" }),
        codexState: text("codexState", { mode: "json" }), // JSON: { wardrobe: [], appearance: [], wounds: [], items: [], customFields: [{ key, label, value }] }
        updatedAt: integer("updatedAt", { mode: "timestamp" }),
        imageFilename: text("imageFilename"), // Generated filename on disk under UPLOADS_DIR/lorebook/ - see server/routes/lorebook.ts's /:id/image routes
        // Cosmetic org folder this entry is filed under (B9, docs/Folders_Org_Design.md) — null =
        // Unfiled. No FK — same reasoning as scopeId above. Must match the folder's own
        // level/scopeId/category (enforced in folderService.assignLorebookFolder, called from
        // lorebook.ts's PUT). Cleaned up in application code on folder delete (reparented, not
        // cascaded).
        folderId: text("folderId")
    },
    table => ({
        levelIdx: index("lorebook_level_idx").on(table.level),
        scopeIdIdx: index("lorebook_scope_id_idx").on(table.scopeId),
        levelScopeIdx: index("lorebook_level_scope_idx").on(table.level, table.scopeId),
        categoryIdx: index("lorebook_category_idx").on(table.category),
        nameIdx: index("lorebook_name_idx").on(table.name)
    })
);

// Story Graph Edges table — directed, typed links between lorebook entries (the "thin story
// graph", docs/Thin_Story_Graph_And_Lorebook_Visualization.md). Nodes are NOT duplicated here —
// a node is just a lorebookEntries row referenced by fromId/toId. Source of truth for lorebook
// relationships going forward; metadata.relationships is migrated once (server/services/
// storyGraphService.ts's migrateStoryRelationships) and left read-only/legacy afterward.
export const storyGraphEdges = sqliteTable(
    "storyGraphEdges",
    {
        id: text("id").primaryKey(),
        // Graph is always opened in a story context, even when an endpoint is series/global
        // scoped. Real FK — this is a fresh CREATE TABLE (not an ALTER TABLE ADD COLUMN), so the
        // ON DELETE clause is preserved correctly (unlike aiChats.anchorEntryId's known limitation).
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        // Lorebook entry ids. NO real FK — entries can be level='global'|'series'|'story', so an
        // edge endpoint may legitimately point outside this story's own rows. Same loose-column
        // convention as aiChats.anchorEntryId/agentJobs.entityId. Cleaned up in application code
        // on entry delete — see storyGraphService.deleteEdgesForEntity, called from
        // server/routes/lorebook.ts's DELETE /:id.
        fromId: text("fromId").notNull(),
        toId: text("toId").notNull(),
        // Allowlisted, server-validated against STORY_GRAPH_EDGE_TYPES (src/types/storyGraph.ts).
        // Concrete/factual types only — no psych/power-dynamic types.
        edgeType: text("edgeType").notNull(),
        label: text("label"), // optional short display override, e.g. "step-sister" for edgeType 'related_to'
        description: text("description"),
        // 'active' | 'pending' | 'rejected'. Every edge created by CRUD or migration this pass is
        // 'active' — nothing in this pass produces 'pending' (AI suggestions are out of scope).
        // Column exists now so a future AI-suggestion pass needs no schema migration.
        status: text("status").notNull().default("active"),
        // Optional chapter grounding. No FK — same reasoning as fromId/toId.
        asOfChapterId: text("asOfChapterId"),
        // 'user' | 'import' | 'ai_suggested' | 'migrated'. 'ai_suggested' is reserved for a future
        // pass, unused this pass.
        source: text("source").notNull(),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" })
    },
    table => ({
        storyIdIdx: index("storygraphedge_story_id_idx").on(table.storyId),
        fromIdIdx: index("storygraphedge_from_id_idx").on(table.fromId),
        toIdIdx: index("storygraphedge_to_id_idx").on(table.toId),
        storyEdgeTypeIdx: index("storygraphedge_story_edge_type_idx").on(table.storyId, table.edgeType),
        statusIdx: index("storygraphedge_status_idx").on(table.status),
        // Partial unique index — only one active edge per (storyId, fromId, toId, edgeType).
        // Defense-in-depth alongside the application-level check in storyGraphService.createEdge
        // (the primary enforcement — see DECISIONS.md for whether drizzle-kit actually emitted
        // this as a genuine partial index or silently dropped/widened the WHERE clause).
        uniqueActiveEdgeIdx: uniqueIndex("storygraphedge_unique_active_idx")
            .on(table.storyId, table.fromId, table.toId, table.edgeType)
            .where(sql`status = 'active'`)
    })
);

// Org Folders table — cosmetic-only user filing for lorebook entries and chat sessions (B9,
// docs/Folders_Org_Design.md). One shared "folder engine" table for both leaf kinds rather than
// two near-identical tables — `kind` selects which of the scope columns below are meaningful.
// Explicitly UI-only: never read by RAG, Codex, or agent context assembly.
//
// Lorebook folders: scoped by (level, scopeId, category) — the same level/scopeId convention
// lorebookEntries itself uses (no real storyId/seriesId split at the entry level, so folders
// can't use one either). Global-level entries have no folder tree in v1 (design doc: "unfiled
// only"), so `level` is only ever 'series' | 'story' here.
// Chat folders: scoped by (scopeId=storyId, chatType) — aiChats does have a real storyId.
//
// `parentId` is a self-reference with NO real FK, same convention as outlineItems.parentId
// (schema.ts) — SQLite ALTER TABLE ADD COLUMN can't carry ON DELETE, and FK enforcement is
// genuinely on in this app, so a real FK here would block deleting any non-leaf folder. Depth
// (max 3) is enforced in application code (folderService.ts), not at the DB level.
export const orgFolders = sqliteTable(
    "orgFolders",
    {
        id: text("id").primaryKey(),
        kind: text("kind").notNull(), // 'lorebook' | 'chat'
        level: text("level"), // lorebook only: 'series' | 'story'
        scopeId: text("scopeId"), // lorebook: seriesId/storyId per level; chat: storyId
        category: text("category"), // lorebook only
        chatType: text("chatType"), // chat only
        parentId: text("parentId"), // null = root folder; no FK, see above
        name: text("name").notNull(),
        order: integer("order").notNull().default(0), // position among siblings sharing the same parentId
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        kindIdx: index("orgfolder_kind_idx").on(table.kind),
        scopeIdx: index("orgfolder_scope_idx").on(table.kind, table.scopeId),
        parentIdIdx: index("orgfolder_parent_id_idx").on(table.parentId)
    })
);

// Codex Snapshots table — append-only history per lorebook entry
export const codexSnapshots = sqliteTable(
    "codexSnapshots",
    {
        id: text("id").primaryKey(),
        entryId: text("entryId")
            .notNull()
            .references(() => lorebookEntries.id, { onDelete: "cascade" }),
        description: text("description").notNull(),
        codexState: text("codexState", { mode: "json" }),
        sourceType: text("sourceType").notNull(), // 'user' | 'chat' | 'ai_suggestion' | 'restore'
        sourceRef: text("sourceRef"),
        // User-set name for this snapshot (e.g. "Before the Prague rewrite") — null until named.
        // Set retroactively via the History panel, not threaded through snapshot creation itself;
        // see Project Saves Phase 1 in DECISIONS.md.
        label: text("label"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        entryIdIdx: index("snapshot_entry_id_idx").on(table.entryId),
        createdAtIdx: index("snapshot_created_at_idx").on(table.createdAt)
    })
);

// Codex Pending Changes table — AI-proposed edits awaiting user approval
export const codexPendingChanges = sqliteTable(
    "codexPendingChanges",
    {
        id: text("id").primaryKey(),
        entryId: text("entryId")
            .notNull()
            .references(() => lorebookEntries.id, { onDelete: "cascade" }),
        proposedDescription: text("proposedDescription"),
        proposedState: text("proposedState", { mode: "json" }),
        proposedTags: text("proposedTags", { mode: "json" }),
        proposedNeedsFleshingOut: integer("proposedNeedsFleshingOut", { mode: "boolean" }),
        sourceType: text("sourceType").notNull(), // 'chat' | 'ai'
        sourceRef: text("sourceRef"),
        status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        resolvedAt: integer("resolvedAt", { mode: "timestamp" })
    },
    table => ({
        entryIdIdx: index("pending_entry_id_idx").on(table.entryId),
        statusIdx: index("pending_status_idx").on(table.status),
        entryStatusIdx: index("pending_entry_status_idx").on(table.entryId, table.status)
    })
);

// Scene Beats table
export const sceneBeats = sqliteTable(
    "sceneBeats",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        chapterId: text("chapterId")
            .notNull()
            .references(() => chapters.id, { onDelete: "cascade" }),
        command: text("command").notNull(),
        povType: text("povType"), // 'First Person' | 'Third Person Limited' | 'Third Person Omniscient'
        povCharacter: text("povCharacter"),
        generatedContent: text("generatedContent"),
        accepted: integer("accepted", { mode: "boolean" }),
        metadata: text("metadata", { mode: "json" }), // JSON: metadata object
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        storyIdIdx: index("scenebeat_story_id_idx").on(table.storyId),
        chapterIdIdx: index("scenebeat_chapter_id_idx").on(table.chapterId)
    })
);

// Concrete Beats table — small, observable narrative beats (physical actions, wardrobe/item
// changes, environmental/sensory detail, movement, dialogue, time/setting shifts) tagged on
// spans of chapter prose. NOT the same as sceneBeats above (that's an AI-generation command
// node) — see src/types/beats.ts for the fixed taxonomy and the naming-collision note.
// `id` doubles as the id stored in the Lexical BeatMarkNode's mark ids array (see
// src/components/story-editor/nodes/BeatMarkNode.ts), so this row is the single source of
// truth for a mark — no separate anchor-id column needed.
export const concreteBeats = sqliteTable(
    "concreteBeats",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        chapterId: text("chapterId")
            .notNull()
            .references(() => chapters.id, { onDelete: "cascade" }),
        beatType: text("beatType").notNull(), // ConcreteBeatType
        text: text("text").notNull(), // snippet of the marked prose, captured at creation time
        // The character this beat's concrete state change/observation applies to (Task 2).
        // Unlike chapters.povCharacter/sceneBeats.povCharacter (which store a display name for
        // prompt-templating), this is a real FK — a beat needs to reliably re-fetch the
        // character's codexState, not just display a name. `onDelete: "set null"` rather than
        // cascade: the beat itself (and its text snippet) stays meaningful even if the character
        // entry is later deleted.
        characterId: text("characterId").references(() => lorebookEntries.id, { onDelete: "set null" }),
        source: text("source").notNull().default("manual"), // 'manual' | 'ai_suggested'
        status: text("status").notNull().default("confirmed"), // 'confirmed' | 'pending' | 'rejected'
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        storyIdIdx: index("concretebeat_story_id_idx").on(table.storyId),
        chapterIdIdx: index("concretebeat_chapter_id_idx").on(table.chapterId),
        characterIdIdx: index("concretebeat_character_id_idx").on(table.characterId)
    })
);

// RAG Chunks table — metadata for chunked, embeddable text extracted from lorebook entries and chapters.
// The actual vectors live in the `vec_chunks` virtual table (sqlite-vec) and the keyword index in
// `fts_chunks` (FTS5), both created via raw SQL in migration 0009 and joined back here via `chunkId`.
export const ragChunks = sqliteTable(
    "ragChunks",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        entityType: text("entityType").notNull(), // 'lorebook_entry' | 'chapter'
        entityId: text("entityId").notNull(),
        chunkIndex: integer("chunkIndex").notNull(),
        content: text("content").notNull(),
        contentHash: text("contentHash").notNull(),
        embeddingModel: text("embeddingModel"),
        embeddedAt: integer("embeddedAt", { mode: "timestamp" }),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        storyIdIdx: index("ragchunk_story_id_idx").on(table.storyId),
        entityIdx: index("ragchunk_entity_idx").on(table.entityType, table.entityId),
        contentHashIdx: index("ragchunk_content_hash_idx").on(table.contentHash)
    })
);

// RAG Scans table — one row per scan run (a single chapter, or a whole story scanned
// chapter-by-chapter in the background). `processedChapters`/`totalChapters` support
// polling for progress while a story-scope scan runs.
export const ragScans = sqliteTable(
    "ragScans",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        scope: text("scope").notNull(), // 'chapter' | 'story'
        chapterId: text("chapterId").references(() => chapters.id, { onDelete: "cascade" }), // set only when scope = 'chapter'
        status: text("status").notNull().default("running"), // 'running' | 'completed' | 'failed'
        totalChapters: integer("totalChapters").notNull().default(0),
        processedChapters: integer("processedChapters").notNull().default(0),
        model: text("model"),
        error: text("error"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        startedAt: integer("startedAt", { mode: "timestamp" }),
        completedAt: integer("completedAt", { mode: "timestamp" })
    },
    table => ({
        storyIdIdx: index("ragscan_story_id_idx").on(table.storyId),
        statusIdx: index("ragscan_status_idx").on(table.status)
    })
);

// RAG Scan Issues table — individual detected inconsistencies from a scan.
export const ragScanIssues = sqliteTable(
    "ragScanIssues",
    {
        id: text("id").primaryKey(),
        scanId: text("scanId")
            .notNull()
            .references(() => ragScans.id, { onDelete: "cascade" }),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        chapterId: text("chapterId")
            .notNull()
            .references(() => chapters.id, { onDelete: "cascade" }),
        issueType: text("issueType").notNull(), // 'contradiction' | 'state_mismatch' | 'timeline' | 'other'
        severity: text("severity").notNull(), // 'low' | 'medium' | 'high'
        description: text("description").notNull(),
        evidence: text("evidence", { mode: "json" }).notNull(), // JSON: RagScanEvidence[]
        suggestedFix: text("suggestedFix"),
        relatedEntityId: text("relatedEntityId"), // resolved lorebookEntries.id, when the LLM named a matching entity
        status: text("status").notNull().default("open"), // 'open' | 'dismissed' | 'resolved'
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        scanIdIdx: index("ragscanissue_scan_id_idx").on(table.scanId),
        storyIdIdx: index("ragscanissue_story_id_idx").on(table.storyId),
        chapterIdIdx: index("ragscanissue_chapter_id_idx").on(table.chapterId),
        statusIdx: index("ragscanissue_status_idx").on(table.status)
    })
);

// Agent Jobs table — durable background job queue for the in-process job runner (jobRunner.ts).
// Generalizes the ragScans precedent (status/progress/story-scope/polling) into one table for
// all background job types (index reconciliation, scans, housekeeping), so this work survives a
// process restart instead of running as a fire-and-forget IIFE (see ragScanner.ts's scanStory
// before this table existed). See docs/Agent_Framework_And_Project_Memory_Design.md §3.
export const agentJobs = sqliteTable(
    "agentJobs",
    {
        id: text("id").primaryKey(),
        jobType: text("jobType").notNull(), // 'reconcile_index' | 'rag_scan_chapter' | 'rag_scan_story' | 'prune_history'
        status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'completed' | 'failed'
        // Nullable — some jobs are global/housekeeping (e.g. prune_history) and touch no single
        // story. Real FK: unlike entityId below, storyId has exactly one possible parent table.
        storyId: text("storyId").references(() => stories.id, { onDelete: "cascade" }),
        // Polymorphic (chapter id, lorebook entry id, or unused) — loose indexed column, NO real
        // FK, same convention as aiChats.anchorEntryId/outlineItems.parentId above: it could
        // point at more than one parent table, which can't be expressed as one FK constraint.
        // Cleaned up in application code (reconcile_index's own orphan detection handles it).
        entityId: text("entityId"),
        payload: text("payload", { mode: "json" }), // JSON: job-specific input, shape varies by jobType
        result: text("result", { mode: "json" }), // JSON: job-specific output summary, shape varies by jobType
        progress: text("progress", { mode: "json" }), // JSON: { processed: number, total: number, message?: string }
        attempts: integer("attempts").notNull().default(0),
        maxAttempts: integer("maxAttempts").notNull().default(3),
        error: text("error"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        queuedAt: integer("queuedAt", { mode: "timestamp" }).notNull(),
        startedAt: integer("startedAt", { mode: "timestamp" }),
        completedAt: integer("completedAt", { mode: "timestamp" }),
        lastAttemptAt: integer("lastAttemptAt", { mode: "timestamp" })
    },
    table => ({
        statusIdx: index("agentjob_status_idx").on(table.status),
        storyIdIdx: index("agentjob_story_id_idx").on(table.storyId),
        jobTypeStatusIdx: index("agentjob_job_type_status_idx").on(table.jobType, table.status),
        // Supports both the dedup check (enqueue) and the schedule tick's "no active row for this
        // key" check (jobRunner.ts) — see agentJobsRepository.hasActiveJob.
        dedupLookupIdx: index("agentjob_dedup_lookup_idx").on(table.jobType, table.storyId, table.entityId, table.status)
    })
);

// Agent Memories table — Project Persistent Memory (Phase B). Metadata/lifecycle only; the
// factual content itself is duplicated into ragChunks (entityType: "agent_memory") only once a
// row reaches status "active" — see server/services/agentMemoriesService.ts. Unlike Codex's
// codexSnapshots (a separate append-only history table), there is deliberately NO snapshot
// table here: versioning is expressed purely via memoryKey + status transition (a new approved
// row sharing a memoryKey flips the previous "active" row to "superseded" — design doc §4.2A/
// §4.4, docs/Agent_Framework_And_Project_Memory_Design.md).
export const agentMemories = sqliteTable(
    "agentMemories",
    {
        id: text("id").primaryKey(),
        // Nullable — null means writer/global memory, not tied to one story. Same convention as
        // prompts.storyId/aiChats.storyId. Real FK: single possible parent table.
        storyId: text("storyId").references(() => stories.id, { onDelete: "cascade" }),
        // Stable slug for supersession (e.g. "fact:back-room-no-cameras"), or a fresh UUID for
        // one-off notes/events with no natural stable identity. Deliberately NOT unique at the
        // DB level — pending/rejected/superseded rows for the same key coexist as history; the
        // "current" value is resolved by (memoryKey, status='active') at query time.
        memoryKey: text("memoryKey").notNull(),
        category: text("category").notNull(), // 'established_fact' | 'open_thread' | 'event' | 'voice_rule' | 'project_note' | 'writer_pref'
        title: text("title").notNull(),
        body: text("body").notNull(),
        status: text("status").notNull().default("pending"), // 'pending' | 'active' | 'rejected' | 'superseded'
        // Nullable FK — set only when a distill_memory job produced this row. Real FK: single
        // possible parent table (agentJobs).
        sourceJobId: text("sourceJobId").references(() => agentJobs.id, { onDelete: "set null" }),
        // The ragScans.id this memory was distilled from, when applicable. NOT a real FK to
        // ragScans on purpose — an approved memory must survive prune_history cleaning up old
        // scan rows; sourceEvidence below keeps a readable excerpt even after the scan is gone.
        sourceScanId: text("sourceScanId"),
        // JSON: evidence snippets captured at proposal time, denormalized for the same reason as
        // sourceScanId above. Shape: { source: string; label: string; excerpt: string }[]
        sourceEvidence: text("sourceEvidence", { mode: "json" }),
        pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
        createdBy: text("createdBy").notNull(), // 'job' | 'user' | 'chat'
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
        approvedAt: integer("approvedAt", { mode: "timestamp" })
    },
    table => ({
        storyIdIdx: index("agentmemory_story_id_idx").on(table.storyId),
        statusIdx: index("agentmemory_status_idx").on(table.status),
        memoryKeyIdx: index("agentmemory_memory_key_idx").on(table.memoryKey),
        // Supports the story+status list query the UI/reconcile job both need.
        storyStatusIdx: index("agentmemory_story_status_idx").on(table.storyId, table.status),
        // Supports the supersession lookup: "find the current active row for this memoryKey".
        memoryKeyStatusIdx: index("agentmemory_memory_key_status_idx").on(table.memoryKey, table.status)
    })
);

// Users table — local accounts. Registration via /api/auth/register is only allowed while
// this table is empty (see server/routes/auth.ts) and always creates the 'owner'; further
// users are created by an owner through /api/users.
export const users = sqliteTable(
    "users",
    {
        id: text("id").primaryKey(),
        username: text("username").notNull().unique(),
        passwordHash: text("passwordHash").notNull(), // format: scrypt$<saltHex>$<hashHex> — see passwordService.ts
        role: text("role").notNull().default("owner"), // 'owner' | 'editor' | 'viewer'
        isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        usernameIdx: index("user_username_idx").on(table.username)
    })
);

// Sessions table — server-side sessions referenced by an httpOnly cookie. The cookie holds
// the raw session token; only its SHA-256 hash is stored here, so a database dump alone
// can't be replayed as a valid session (mirrors why passwordHash isn't the raw password).
export const sessions = sqliteTable(
    "sessions",
    {
        id: text("id").primaryKey(), // sha256(rawToken) hex — see authService.ts
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        userIdIdx: index("session_user_id_idx").on(table.userId),
        expiresAtIdx: index("session_expires_at_idx").on(table.expiresAt)
    })
);

// Outline Items table — Story Outlining feature. Two fixed levels only (per CLAUDE.md's bias
// toward concrete, tractable scope over arbitrary generality): top-level rows are `type:
// "chapter"` (parentId null), each optionally containing `type: "scene"` rows (parentId = the
// chapter row's id). `parentId` is a plain column, not a self-referencing FK — this app runs
// with SQLite foreign_key enforcement off database-wide anyway (see DECISIONS.md / the
// characterId comment on concreteBeats below), and a self-ref requires an awkward forward-
// declared callback for no real benefit here; child rows are cleaned up in application code
// (see routes/outline.ts) when a chapter row is deleted.
// `chapterId` optionally links a "chapter" row to a real `chapters` row so the outline can be
// used either as pure pre-writing planning (no chapterId yet) or as a structural map over
// chapters that already exist — set null (not cascade) so the outline node survives independent
// of the chapter's own lifecycle.
// `source`/`status` mirror concreteBeats' manual/ai_suggested + confirmed/pending/rejected
// convention exactly, for AI-proposed chapters/scenes — now created via the Outline chat's
// ```outline-proposal fence (P0.4 R5, chatContextService.ts), the retired standalone
// outlineGenerator.ts service used the same convention before it was folded into that chat flow.
export const outlineItems = sqliteTable(
    "outlineItems",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        parentId: text("parentId"), // outlineItems.id of the parent chapter row, when type = "scene"
        type: text("type").notNull().default("scene"), // 'chapter' | 'scene'
        title: text("title").notNull(),
        summary: text("summary"),
        wordCountTarget: integer("wordCountTarget"),
        order: integer("order").notNull().default(0), // position among siblings sharing the same parentId
        source: text("source").notNull().default("manual"), // 'manual' | 'ai_suggested'
        status: text("status").notNull().default("confirmed"), // 'confirmed' | 'pending' | 'rejected'
        chapterId: text("chapterId").references(() => chapters.id, { onDelete: "set null" }),
        // Opt-in gate for the Notes/Outline ↔ chat bridge (docs/Notes_Outline_Chat_Bridges_Design.md)
        // — must ALSO be paired with the reading chat's own includeOutline flag (aiChats) before
        // this item is eligible for RAG indexing/retrieval. Defaults false: outline items are
        // planning intent, not canon, and never surface to a chat unless explicitly armed.
        includeInAi: integer("includeInAi", { mode: "boolean" }).notNull().default(false),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        storyIdIdx: index("outlineitem_story_id_idx").on(table.storyId),
        parentIdIdx: index("outlineitem_parent_id_idx").on(table.parentId),
        statusIdx: index("outlineitem_status_idx").on(table.status)
    })
);

// Outline Item Characters table — links an outline item (chapter or scene) to a character
// (lorebookEntries, category "character") for arc tracking (Task 2). `arcNote` is a short,
// free-text description of that character's development/state at this specific point in the
// story — the ordered sequence of these notes across a character's linked items, in outline
// order, IS the "simple arc overview" (see services/outlineArcService.ts). `storyId` is
// denormalized from outlineItemId (same call as concreteBeats storing both storyId and
// chapterId) purely so the arc-overview query can filter by story+character directly without a
// join back through outlineItems.
export const outlineItemCharacters = sqliteTable(
    "outlineItemCharacters",
    {
        id: text("id").primaryKey(),
        outlineItemId: text("outlineItemId")
            .notNull()
            .references(() => outlineItems.id, { onDelete: "cascade" }),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        characterId: text("characterId")
            .notNull()
            .references(() => lorebookEntries.id, { onDelete: "cascade" }),
        arcNote: text("arcNote"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        outlineItemIdIdx: index("outlineitemchar_outline_item_id_idx").on(table.outlineItemId),
        storyIdIdx: index("outlineitemchar_story_id_idx").on(table.storyId),
        characterIdIdx: index("outlineitemchar_character_id_idx").on(table.characterId)
    })
);

// Notes table
export const notes = sqliteTable(
    "notes",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        content: text("content").notNull(),
        type: text("type").notNull(), // 'idea' | 'research' | 'todo' | 'other'
        // Opt-in gate for the Notes/Outline ↔ chat bridge (docs/Notes_Outline_Chat_Bridges_Design.md)
        // — must ALSO be paired with the reading chat's own includeNotes flag (aiChats) before this
        // note is eligible for RAG indexing/retrieval. Defaults false: notes are untrusted/working
        // material, not canon, and never surface to a chat unless explicitly armed.
        includeInAi: integer("includeInAi", { mode: "boolean" }).notNull().default(false),
        // P0.4 K0 — pin to the top of the Notes list. A plain UI convenience flag, unrelated to
        // includeInAi (a note can be pinned without being AI-armed, or vice versa).
        pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
        isDemo: integer("isDemo", { mode: "boolean" })
    },
    table => ({
        storyIdIdx: index("note_story_id_idx").on(table.storyId),
        typeIdx: index("note_type_idx").on(table.type)
    })
);

// Brainstorm Checklist table — P0.4 B4's durable tray backing store (docs/
// Chat_Panel_Integrations_Design.md §5 "Persistence: items are durable DB-backed checklist
// work"). Deliberately NOT the same status vocabulary as codexPendingChanges: Open/Send/Accept
// must NOT resolve/remove an item the way Codex approve/reject does — only an explicit "Mark
// done" leaves the active queue (status IN 'pending'/'opened' = Active tab; 'done'/'dismissed' =
// Done tab). Both tray sections that need this lifecycle — "overview proposals" (synopsis/note/
// memory writes) and "handoffs" (Outline/WB/Notes/Research) — share this one table via `kind`,
// since both need identical Open/Send/Accept-doesn't-clear semantics; the third tray section
// (slot checklist) is a genuinely different, simpler known/unknown model — see brainstormSlots
// below, not this table.
export const brainstormChecklist = sqliteTable(
    "brainstormChecklist",
    {
        id: text("id").primaryKey(),
        chatId: text("chatId")
            .notNull()
            .references(() => aiChats.id, { onDelete: "cascade" }),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(), // 'overview_proposal' | 'handoff'
        status: text("status").notNull().default("pending"), // 'pending' | 'opened' | 'done' | 'dismissed'
        // JSON: OverviewProposalPayload | HandoffPacketPayload (src/types/brainstorm.ts) — shape
        // depends on `kind`, mirrors codexPendingChanges' single-JSON-blob-per-row convention.
        payload: text("payload", { mode: "json" }).notNull(),
        sourceMessageId: text("sourceMessageId"),
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        chatIdIdx: index("brainstormchecklist_chat_id_idx").on(table.chatId),
        statusIdx: index("brainstormchecklist_status_idx").on(table.status)
    })
);

// Brainstorm Slots table — P0.4 B2/B4's known/unknown project-setup checklist (the "playbook"
// depth control, confirmed with user as prompt-driven rather than a tracked interview state
// machine: style shapes how the model interviews in normal chat, this table only tracks whether
// each of a small fixed set of setup slots — see BRAINSTORM_SLOTS, src/types/brainstorm.ts — has
// been addressed yet). Rows are lazily seeded (created on first read/write, not migrated in bulk
// for existing stories) rather than pre-populated, since the fixed slot list can grow later
// without a migration.
export const brainstormSlots = sqliteTable(
    "brainstormSlots",
    {
        id: text("id").primaryKey(),
        storyId: text("storyId")
            .notNull()
            .references(() => stories.id, { onDelete: "cascade" }),
        slotKey: text("slotKey").notNull(),
        status: text("status").notNull().default("unknown"), // 'unknown' | 'known'
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
    },
    table => ({
        storyIdIdx: index("brainstormslot_story_id_idx").on(table.storyId),
        storySlotIdx: uniqueIndex("brainstormslot_story_slot_idx").on(table.storyId, table.slotKey)
    })
);
