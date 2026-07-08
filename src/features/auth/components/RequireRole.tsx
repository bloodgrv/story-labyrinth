import type { ReactNode } from "react";
import type { UserRole } from "@/types/auth";
import { useCurrentRole } from "../hooks/useCanEdit";

interface RequireRoleProps {
    role: UserRole;
    children: ReactNode;
}

// UX-only gate (see useCanEdit.ts) — hides a subtree from anyone but the given role.
// The corresponding server routes enforce this independently (requireOwner, etc).
export function RequireRole({ role, children }: RequireRoleProps) {
    const currentRole = useCurrentRole();
    if (currentRole !== role) return null;
    return <>{children}</>;
}
