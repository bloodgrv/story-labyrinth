export type UserRole = "owner" | "editor" | "viewer";

export interface AuthUser {
    id: string;
    username: string;
    role: UserRole;
    isActive: boolean;
}

export interface AuthStatus {
    setupComplete: boolean;
    authenticated: boolean;
    username: string | null;
    role: UserRole | null;
    // First-Start Tour (T11) — null while logged out, same posture as username/role above.
    onboardingTourCompleted: boolean | null;
}
