import type { HumanizeTextResult, HumanizerSettings } from "@/types/humanizerSettings";
import { fetchJSON } from "./apiFactory";

// Humanizer API
export const humanizerApi = {
    getSettings: () => fetchJSON<HumanizerSettings>("/humanizer/settings"),
    updateSettings: (id: string, data: Partial<HumanizerSettings>) =>
        fetchJSON<HumanizerSettings>(`/humanizer/settings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    rewrite: (text: string) =>
        fetchJSON<HumanizeTextResult>("/humanizer/rewrite", { method: "POST", body: JSON.stringify({ text }) })
};
