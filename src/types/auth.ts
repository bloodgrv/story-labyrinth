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
    // Remote Access — Login Instance Label (RF5) — public even while logged out; null when unset.
    instanceLabel: string | null;
    // Remote Access — RF3 sidebar Remote toggle state for this session; null while logged out.
    remoteProfile: boolean | null;
}
