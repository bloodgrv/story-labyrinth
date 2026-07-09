import type { FeatureEndpoint, FeatureEndpoints, FeatureKey } from "@/types/aiSettings";
import type { AuthStatus, AuthUser } from "@/types/auth";
import type { CodexPendingChange, CodexPendingStatus, CodexState, DocumentImportDraft } from "@/types/codex";
import type {
    AIChat,
    AISettings,
    Chapter,
    DatabaseExport,
    GlobalLorebookExport,
    LorebookEntry,
    Note,
    Prompt,
    SceneBeat,
    Series,
    SeriesExport,
    Story,
    StoryExport
} from "@/types/story";
import type { ChatContext, WorldBuildingTemplate } from "@/types/worldbuilding";
import { fetchJSON, uploadFile } from "./apiFactory";

// Re-exported so existing `import { ttsApi } from "@/services/api/client"` call sites don't
// need to change — these live in their own files purely to keep this file under the max-lines
// lint limit as the API surface has grown.
export { beatsApi } from "./beatsClient";
export { codexApi } from "./codexClient";
export { grammarApi } from "./grammarClient";
export { humanizerApi } from "./humanizerClient";
export { outlineApi, outlineCharactersApi } from "./outlineClient";
export { ragApi } from "./ragClient";
export { ttsApi } from "./ttsClient";
export { usersApi } from "./usersClient";

// Auth API
export const authApi = {
    getStatus: () => fetchJSON<AuthStatus>("/auth/status"),
    register: (username: string, password: string) =>
        fetchJSON<{ user: AuthUser }>("/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, password })
        }),
    login: (username: string, password: string) =>
        fetchJSON<{ user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    logout: () => fetchJSON<{ success: boolean }>("/auth/logout", { method: "POST" })
};

// Stories API
export const storiesApi = {
    getAll: () => fetchJSON<Story[]>("/stories"),
    getById: (id: string) => fetchJSON<Story>(`/stories/${id}`),
    create: (data: Omit<Story, "createdAt">) =>
        fetchJSON<Story>("/stories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Story>) =>
        fetchJSON<Story>(`/stories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/stories/${id}`, { method: "DELETE" }),
    exportStory: (id: string) => fetchJSON<StoryExport>(`/stories/${id}/export`),
    importStory: (file: File) => uploadFile<Story>("/stories/import", file)
};

// Series API
export const seriesApi = {
    getAll: () => fetchJSON<Series[]>("/series"),
    getById: (id: string) => fetchJSON<Series>(`/series/${id}`),
    getStories: (seriesId: string) => fetchJSON<Story[]>(`/series/${seriesId}/stories`),
    getLorebook: (seriesId: string) => fetchJSON<LorebookEntry[]>(`/series/${seriesId}/lorebook`),
    create: (data: Omit<Series, "id" | "createdAt">) =>
        fetchJSON<Series>("/series", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Omit<Series, "id" | "createdAt">>) =>
        fetchJSON<Series>(`/series/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/series/${id}`, { method: "DELETE" }),
    exportSeries: (id: string) => fetchJSON<SeriesExport>(`/series/${id}/export`),
    importSeries: (file: File) => uploadFile<Series>("/series/import", file)
};

// Chapters API
export const chaptersApi = {
    getByStory: (storyId: string) => fetchJSON<Chapter[]>(`/chapters/story/${storyId}`),
    getById: (id: string) => fetchJSON<Chapter>(`/chapters/${id}`),
    create: (data: Omit<Chapter, "createdAt">) =>
        fetchJSON<Chapter>("/chapters", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Chapter>) =>
        fetchJSON<Chapter>(`/chapters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/chapters/${id}`, { method: "DELETE" })
};

// Lorebook API
export const lorebookApi = {
    getByStory: (storyId: string) => fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}`),
    getByCategory: (storyId: string, category: string) =>
        fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}/category/${category}`),
    getByTag: (storyId: string, tag: string) => fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}/tag/${tag}`),
    getById: (id: string) => fetchJSON<LorebookEntry>(`/lorebook/${id}`),
    create: (data: Omit<LorebookEntry, "createdAt">) =>
        fetchJSON<LorebookEntry>("/lorebook", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<LorebookEntry>) =>
        fetchJSON<LorebookEntry>(`/lorebook/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/lorebook/${id}`, { method: "DELETE" }),
    getGlobal: () => fetchJSON<LorebookEntry[]>("/lorebook/global"),
    getBySeries: (seriesId: string) => fetchJSON<LorebookEntry[]>(`/lorebook/series/${seriesId}`),
    getHierarchical: (storyId: string) => fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}/hierarchical`),
    exportGlobal: () => fetchJSON<GlobalLorebookExport>("/lorebook/global/export"),
    importGlobal: (file: File) => uploadFile<{ success: boolean }>("/lorebook/global/import", file),
    // PDF/DOCX/MD/TXT reference document -> AI-extracted draft entry (not persisted; the
    // caller opens the normal entry-creation UI pre-filled with it for review).
    importDocument: (file: File) => uploadFile<{ draft: DocumentImportDraft }>("/lorebook/import/document", file)
};

// Prompts API
export const promptsApi = {
    getAll: (params?: { storyId?: string; promptType?: string; includeSystem?: boolean }) => {
        const query = new URLSearchParams();
        if (params?.storyId) query.set("storyId", params.storyId);
        if (params?.promptType) query.set("promptType", params.promptType);
        if (params?.includeSystem !== undefined) query.set("includeSystem", String(params.includeSystem));
        return fetchJSON<Prompt[]>(`/prompts?${query}`);
    },
    getById: (id: string) => fetchJSON<Prompt>(`/prompts/${id}`),
    create: (data: Omit<Prompt, "id" | "createdAt">) =>
        fetchJSON<Prompt>("/prompts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Prompt>) =>
        fetchJSON<Prompt>(`/prompts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/prompts/${id}`, { method: "DELETE" })
};

// AI Settings API
export const aiApi = {
    getSettings: () => fetchJSON<AISettings>("/ai/settings"),
    updateSettings: (id: string, data: Partial<AISettings>) =>
        fetchJSON<AISettings>(`/ai/settings/${id}`, { method: "PUT", body: JSON.stringify(data) })
};

// xAI OAuth device-flow API
export type GrokDeviceAuthorization = {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval: number;
};

export type GrokDevicePollResult =
    | { status: "complete" }
    | { status: "pending" | "slow_down" }
    | { status: "error"; error: string };

export const grokOAuthApi = {
    startDeviceFlow: () =>
        fetchJSON<GrokDeviceAuthorization>("/ai/grok-oauth/device/start", { method: "POST" }),
    pollDeviceToken: (deviceCode: string) =>
        fetchJSON<GrokDevicePollResult>("/ai/grok-oauth/device/poll", {
            method: "POST",
            body: JSON.stringify({ deviceCode })
        })
};

// Brainstorm (AI Chats) API
export const brainstormApi = {
    getByStory: (storyId: string) => fetchJSON<AIChat[]>(`/brainstorm/story/${storyId}`),
    getById: (id: string) => fetchJSON<AIChat>(`/brainstorm/${id}`),
    create: (data: Omit<AIChat, "createdAt">) =>
        fetchJSON<AIChat>("/brainstorm", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<AIChat>) =>
        fetchJSON<AIChat>(`/brainstorm/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/brainstorm/${id}`, { method: "DELETE" })
};

// Scene Beats API
export const scenebeatsApi = {
    getByChapter: (chapterId: string) => fetchJSON<SceneBeat[]>(`/scenebeats/chapter/${chapterId}`),
    getById: (id: string) => fetchJSON<SceneBeat>(`/scenebeats/${id}`),
    create: (data: Omit<SceneBeat, "createdAt">) =>
        fetchJSON<SceneBeat>("/scenebeats", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<SceneBeat>) =>
        fetchJSON<SceneBeat>(`/scenebeats/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/scenebeats/${id}`, { method: "DELETE" })
};

// Notes API
export const notesApi = {
    getByStory: (storyId: string) => fetchJSON<Note[]>(`/notes/story/${storyId}`),
    getById: (id: string) => fetchJSON<Note>(`/notes/${id}`),
    create: (data: Omit<Note, "id" | "createdAt" | "updatedAt">) =>
        fetchJSON<Note>("/notes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Note>) =>
        fetchJSON<Note>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/notes/${id}`, { method: "DELETE" })
};

// World-Building Chats API (backed by /api/chats)
export const chatsApi = {
    getByStory: (storyId: string, type?: string) => {
        const q = new URLSearchParams({ storyId });
        if (type) q.set("type", type);
        return fetchJSON<AIChat[]>(`/chats?${q}`);
    },
    getById: (id: string) => fetchJSON<AIChat>(`/chats/${id}`),
    getTemplates: () => fetchJSON<WorldBuildingTemplate[]>("/chats/templates"),
    getOrCreateGlobal: (chatType: string, title?: string) => {
        const q = title ? `?${new URLSearchParams({ title })}` : "";
        return fetchJSON<AIChat>(`/chats/global/${chatType}${q}`);
    },
    create: (data: { storyId: string; chatType?: string; templateSlug?: string; title?: string }) =>
        fetchJSON<AIChat>("/chats", { method: "POST", body: JSON.stringify(data) }),
    update: (
        id: string,
        data: {
            messages?: unknown[];
            title?: string;
            lastUsedPromptId?: string | null;
            lastUsedModelId?: string | null;
        }
    ) => fetchJSON<AIChat>(`/chats/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    appendMessage: (id: string, role: "user" | "assistant", content: string) =>
        fetchJSON<AIChat>(`/chats/${id}/messages`, { method: "POST", body: JSON.stringify({ role, content }) }),
    delete: (id: string) => fetchJSON<void>(`/chats/${id}`, { method: "DELETE" }),

    // Context for generating a response/proposal: system prompt, this chat's own pending
    // proposals, and Codex entries relevant to `query` (via the RAG hybrid index).
    getContext: (id: string, query?: string) => {
        const q = query ? `?${new URLSearchParams({ query })}` : "";
        return fetchJSON<ChatContext>(`/chats/${id}/context${q}`);
    },

    // Codex proposals scoped to this chat
    getProposals: (id: string, status?: CodexPendingStatus) => {
        const q = status ? `?${new URLSearchParams({ status })}` : "";
        return fetchJSON<CodexPendingChange[]>(`/chats/${id}/codex-proposals${q}`);
    },
    getProposal: (id: string, pendingChangeId: string) =>
        fetchJSON<CodexPendingChange>(`/chats/${id}/codex-proposals/${pendingChangeId}`),
    proposeNewEntry: (
        id: string,
        data: {
            messageId?: string;
            level: string;
            scopeId?: string;
            name: string;
            description: string;
            category: string;
            tags?: string[];
            proposedState?: CodexState;
        }
    ) =>
        fetchJSON(`/chats/${id}/codex-proposals`, {
            method: "POST",
            body: JSON.stringify({ type: "new_entry", ...data })
        }),
    proposeModifyEntry: (
        id: string,
        data: {
            messageId?: string;
            entryId: string;
            proposedDescription?: string;
            proposedState?: CodexState;
            proposedTags?: string[];
            proposedNeedsFleshingOut?: boolean;
        }
    ) =>
        fetchJSON<{ pendingChange: CodexPendingChange }>(`/chats/${id}/codex-proposals`, {
            method: "POST",
            body: JSON.stringify({ type: "modify_entry", ...data })
        }),
    reviseProposal: (
        id: string,
        pendingChangeId: string,
        data: {
            proposedDescription?: string;
            proposedState?: CodexState;
            proposedTags?: string[];
            proposedNeedsFleshingOut?: boolean;
        }
    ) =>
        fetchJSON<CodexPendingChange>(`/chats/${id}/codex-proposals/${pendingChangeId}`, {
            method: "PATCH",
            body: JSON.stringify(data)
        })
};

// Per-feature AI endpoint overrides
export const featureEndpointsApi = {
    get: () => fetchJSON<FeatureEndpoints>("/admin/feature-endpoints"),
    setFeature: (feature: FeatureKey, endpoint: FeatureEndpoint) =>
        fetchJSON<FeatureEndpoints>(`/admin/feature-endpoints/${feature}`, {
            method: "PUT",
            body: JSON.stringify(endpoint)
        }),
    removeFeature: (feature: FeatureKey) =>
        fetchJSON<FeatureEndpoints>(`/admin/feature-endpoints/${feature}`, { method: "DELETE" })
};

// Admin/Migration API
export const adminApi = {
    exportDatabase: () => fetchJSON<DatabaseExport>("/admin/export"),
    importDatabase: (file: File) => uploadFile<{ success: boolean }>("/admin/import", file),
    checkDemoExists: () => fetchJSON<{ exists: boolean }>("/admin/demo/exists"),
    importDemoData: () => fetchJSON<{ success: boolean; message: string }>("/admin/demo/import", { method: "POST" }),
    deleteDemoData: () =>
        fetchJSON<{ success: boolean; deleted: { series: number; stories: number; lorebookEntries: number } }>(
            "/admin/demo",
            { method: "DELETE" }
        )
};
