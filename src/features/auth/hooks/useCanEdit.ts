import type { UserRole } from "@/types/auth";
import { useAuthStatus } from "./useAuthStatus";

// AuthGate only renders the app once authenticated, so `role` is always set here in
// practice — the "owner" fallback only matters during the brief loading window.
export const useCurrentRole = (): UserRole => useAuthStatus().data?.role ?? "owner";

// UX-only gate: hides/disables controls a viewer can't use anyway. Real enforcement is
// server-side (server/middleware/auth.ts's blockViewerMutations) — this just avoids
// showing a control that would 403.
export const useCanEdit = (): boolean => useCurrentRole() !== "viewer";

export const useIsOwner = (): boolean => useCurrentRole() === "owner";
