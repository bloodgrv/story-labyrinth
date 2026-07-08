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
}
