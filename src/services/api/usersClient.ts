import type { AuthUser, UserRole } from "@/types/auth";
import { fetchJSON } from "./apiFactory";

// User admin API (owner-only — server enforces this; see server/routes/users.ts)
export const usersApi = {
    list: () => fetchJSON<AuthUser[]>("/users"),
    create: (username: string, password: string, role: UserRole) =>
        fetchJSON<AuthUser>("/users", { method: "POST", body: JSON.stringify({ username, password, role }) }),
    updateRole: (id: string, role: UserRole) =>
        fetchJSON<AuthUser>(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    setActive: (id: string, isActive: boolean) =>
        fetchJSON<AuthUser>(`/users/${id}/active`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    resetPassword: (id: string, newPassword: string) =>
        fetchJSON<AuthUser>(`/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) }),
    // Remote Access — Login Instance Label (RF5, see docs/Remote_Access_Funnel_Design.md §5c)
    setInstanceLabel: (label: string) =>
        fetchJSON<{ instanceLabel: string | null }>("/users/instance-label", {
            method: "PATCH",
            body: JSON.stringify({ label })
        }),
    // Remote Access — Revoke All Sessions (RF2, see docs/Remote_Access_Funnel_Design.md §6)
    revokeAllSessions: () => fetchJSON<{ revoked: number }>("/users/revoke-all-sessions", { method: "POST" })
};
