export interface AuthUser {
    id: string;
    username: string;
}

export interface AuthStatus {
    setupComplete: boolean;
    authenticated: boolean;
    username: string | null;
}
