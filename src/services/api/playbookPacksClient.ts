import type { PlaybookKey, PlaybookPack, PlaybookScope, PlaybookStyle } from "@/types/playbookPack";
import { fetchJSON, uploadFile } from "./apiFactory";

export const playbookPacksApi = {
    // storyId omitted (or null) lists shipped+global only; passed, also includes that story's own
    // story-scoped rows.
    list: (storyId?: string | null) => {
        const qs = storyId ? `?storyId=${encodeURIComponent(storyId)}` : "";
        return fetchJSON<{ packs: PlaybookPack[] }>(`/playbook-packs${qs}`);
    },
    resolve: (storyId: string | null, playbookKey: PlaybookKey, style: PlaybookStyle) => {
        const q = new URLSearchParams({ playbookKey, style });
        if (storyId) q.set("storyId", storyId);
        return fetchJSON<{ pack: PlaybookPack | null }>(`/playbook-packs/resolve?${q.toString()}`);
    },
    create: (data: {
        playbookKey: PlaybookKey;
        style: PlaybookStyle;
        packScope: "global" | "story";
        storyId: string | null;
        title: string;
        body: string;
    }) => fetchJSON<PlaybookPack>("/playbook-packs", { method: "POST", body: JSON.stringify(data) }),
    copy: (id: string, targetScope: "global" | "story", targetStoryId: string | null) =>
        fetchJSON<PlaybookPack>(`/playbook-packs/${id}/copy`, { method: "POST", body: JSON.stringify({ targetScope, targetStoryId }) }),
    update: (id: string, data: { title?: string; body?: string }) =>
        fetchJSON<PlaybookPack>(`/playbook-packs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/playbook-packs/${id}`, { method: "DELETE" }),
    import: (file: File, fields: { packScope: PlaybookScope; storyId?: string; playbookKey?: string; style?: string; title?: string }) =>
        uploadFile<PlaybookPack>(
            "/playbook-packs/import",
            file,
            undefined,
            Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Record<string, string>
        ),
    exportGlobal: () => fetchJSON<{ type: string; playbookPacks: PlaybookPack[] }>("/playbook-packs/global/export"),
    importGlobal: (file: File) => uploadFile<{ imported: number }>("/playbook-packs/global/import", file)
};
