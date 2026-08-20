import type { WriterPrefsSettings } from "@/types/writerPrefsSettings";
import { fetchJSON } from "./apiFactory";

export const writerPrefsSettingsApi = {
    getSettings: () => fetchJSON<WriterPrefsSettings>("/writer-prefs/settings"),
    updateSettings: (id: string, data: Partial<WriterPrefsSettings>) =>
        fetchJSON<WriterPrefsSettings>(`/writer-prefs/settings/${id}`, { method: "PUT", body: JSON.stringify(data) })
};
