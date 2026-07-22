import type { FeatureEndpoint, FeatureEndpoints, FeatureKey } from "@/types/aiSettings";
import type { AuthStatus, AuthUser } from "@/types/auth";
import type { CodexPendingChange, CodexPendingStatus, CodexState } from "@/types/codex";
import type {
    AIChat,
    AISettings,
    DatabaseExport,
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
export { agentJobsApi } from "./agentJobsClient";
export { agentMemoriesApi } from "./agentMemoriesClient";
export { beatsApi } from "./beatsClient";
export { brainstormApi } from "./brainstormClient";
export { chaptersApi } from "./chaptersClient";
export { chapterSnapshotsApi } from "./chapterSnapshotsClient";
export { chapterVersionsApi } from "./chapterVersionsClient";
export { codexApi } from "./codexClient";
export { deskTransfersApi } from "./deskTransfersClient";
export { foldersApi } from "./foldersClient";
export { grammarApi } from "./grammarClient";
export { humanizerApi } from "./humanizerClient";
export { lorebookApi } from "./lorebookClient";
export { outlineApi, outlineCharactersApi } from "./outlineClient";
export { ragApi } from "./ragClient";
export { storyGraphApi } from "./storyGraphClient";
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
    startDeviceFlow: () => fetchJSON<GrokDeviceAuthorization>("/ai/grok-oauth/device/start", { method: "POST" }),
    pollDeviceToken: (deviceCode: string) =>
        fetchJSON<GrokDevicePollResult>("/ai/grok-oauth/device/poll", {
            method: "POST",
            body: JSON.stringify({ deviceCode })
        })
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
    create: (data: {
        storyId: string;
        chatType?: string;
        templateSlug?: string;
        title?: string;
        anchorEntryId?: string | null;
        anchorChapterId?: string | null;
    }) => fetchJSON<AIChat>("/chats", { method: "POST", body: JSON.stringify(data) }),
    update: (
        id: string,
        data: {
            messages?: unknown[];
            title?: string;
            lastUsedPromptId?: string | null;
            lastUsedModelId?: string | null;
            includeNotes?: boolean;
            includeOutline?: boolean;
            includeMemory?: boolean;
            includeLorebook?: boolean;
            includeChapterSummaries?: boolean;
            brainstormStyle?: string;
            wbStyle?: string;
            outlineStyle?: string;
            includePsychModule?: boolean;
            autoInsertProse?: boolean;
            autoAcceptCodex?: boolean;
            autoAcceptOutline?: boolean;
            webSearchEnabled?: boolean;
            autoShuttle?: boolean;
            folderId?: string | null; // B9, docs/Folders_Org_Design.md — null unfiles
        }
    ) => fetchJSON<AIChat>(`/chats/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    appendMessage: (id: string, role: "user" | "assistant", content: string) =>
        fetchJSON<AIChat>(`/chats/${id}/messages`, { method: "POST", body: JSON.stringify({ role, content }) }),
    delete: (id: string) => fetchJSON<void>(`/chats/${id}`, { method: "DELETE" }),

    // Context for generating a response/proposal: system prompt, this chat's own pending
    // proposals, and Codex entries relevant to `query` (via the RAG hybrid index).
    // focusedNoteId (P0.4 K1, Notes chats only) — whichever note is currently open in the Notes tool.
    getContext: (id: string, query?: string, focusedNoteId?: string) => {
        const params: Record<string, string> = {};
        if (query) params.query = query;
        if (focusedNoteId) params.focusedNoteId = focusedNoteId;
        const q = Object.keys(params).length > 0 ? `?${new URLSearchParams(params)}` : "";
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
        fetchJSON<{ entry: LorebookEntry; snapshot: unknown; pendingChange: CodexPendingChange }>(
            `/chats/${id}/codex-proposals`,
            {
                method: "POST",
                body: JSON.stringify({ type: "new_entry", ...data })
            }
        ),
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
