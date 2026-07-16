import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
        isDemo: integer("isDemo", { mode: "boolean" })
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
        chatType: text("chatType"), // 'worldbuilding' | 'research' | 'editor' | 'general' — null treated as 'general'
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
        anchorChapterId: text("anchorChapterId")
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
        imageFilename: text("imageFilename") // Generated filename on disk under UPLOADS_DIR/lorebook/ - see server/routes/lorebook.ts's /:id/image routes
    },
    table => ({
        levelIdx: index("lorebook_level_idx").on(table.level),
        scopeIdIdx: index("lorebook_scope_id_idx").on(table.scopeId),
        levelScopeIdx: index("lorebook_level_scope_idx").on(table.level, table.scopeId),
        categoryIdx: index("lorebook_category_idx").on(table.category),
        nameIdx: index("lorebook_name_idx").on(table.name)
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
        sourceType: text("sourceType").notNull(), // 'user' | 'chat' | 'ai_suggestion'
        sourceRef: text("sourceRef"),
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
// convention exactly, for the AI-assisted outlining pass (outlineGenerator.ts).
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
        createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
        isDemo: integer("isDemo", { mode: "boolean" })
    },
    table => ({
        storyIdIdx: index("note_story_id_idx").on(table.storyId),
        typeIdx: index("note_type_idx").on(table.type)
    })
);
