import type { CreateFolderInput, OrgFolder } from "@/types/folders";
import { fetchJSON } from "./apiFactory";

export const foldersApi = {
    list: (params: { kind: "lorebook" | "chat" | "notes"; scopeId: string; category?: string; chatType?: string }) => {
        const q = new URLSearchParams({ kind: params.kind, scopeId: params.scopeId });
        if (params.category) q.set("category", params.category);
        if (params.chatType) q.set("chatType", params.chatType);
        return fetchJSON<OrgFolder[]>(`/folders?${q}`);
    },
    create: (data: CreateFolderInput) => fetchJSON<OrgFolder>("/folders", { method: "POST", body: JSON.stringify(data) }),
    rename: (id: string, name: string) =>
        fetchJSON<OrgFolder>(`/folders/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
    move: (id: string, data: { parentId?: string | null; order?: number }) =>
        fetchJSON<OrgFolder>(`/folders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    reorder: (updates: Array<{ id: string; order: number; parentId?: string | null }>) =>
        fetchJSON<{ success: boolean }>("/folders/reorder", { method: "PATCH", body: JSON.stringify({ updates }) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/folders/${id}`, { method: "DELETE" })
};
