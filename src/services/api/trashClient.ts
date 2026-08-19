import type { TrashItem } from "@/types/trash";
import { fetchJSON } from "./apiFactory";

export const trashApi = {
    list: () => fetchJSON<TrashItem[]>("/trash"),
    restore: (type: string, id: string) => fetchJSON<{ success: boolean }>(`/trash/${type}/${id}/restore`, { method: "POST" }),
    purge: (type: string, id: string) => fetchJSON<{ success: boolean }>(`/trash/${type}/${id}`, { method: "DELETE" })
};
