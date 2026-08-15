import type { AutoHumanizeProcessResult, AutoHumanizerSettings } from "@/types/autoHumanizerSettings";
import type { AiDetectResult } from "@/types/aiTextDetector";
import { fetchJSON } from "./apiFactory";

export const autoHumanizerApi = {
    getSettings: () => fetchJSON<AutoHumanizerSettings>("/auto-humanizer/settings"),
    updateSettings: (id: string, data: Partial<AutoHumanizerSettings>) =>
        fetchJSON<AutoHumanizerSettings>(`/auto-humanizer/settings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    detect: (text: string) => fetchJSON<AiDetectResult>("/auto-humanizer/detect", { method: "POST", body: JSON.stringify({ text }) }),
    process: (text: string) =>
        fetchJSON<AutoHumanizeProcessResult>("/auto-humanizer/process", { method: "POST", body: JSON.stringify({ text }) })
};
