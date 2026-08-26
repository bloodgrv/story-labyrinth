import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { AUTH_UNAUTHORIZED_EVENT } from "@/services/api/apiFactory";
import { useAuthStatus } from "../hooks/useAuthStatus";
import { LoginPage } from "../pages/LoginPage";

interface AuthGateProps {
    children: ReactNode;
}

// Gates the entire app behind a session check. Shown once on load, and again whenever any
// API call comes back 401 (session expired or was revoked elsewhere) — see apiFactory.ts.
export function AuthGate({ children }: AuthGateProps) {
    const { data: status, isLoading, isError } = useAuthStatus();
    const queryClient = useQueryClient();

    useEffect(() => {
        const handleUnauthorized = () => {
            queryClient.invalidateQueries({ queryKey: ["auth", "status"] });
        };
        window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
        return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    }, [queryClient]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isError || !status?.authenticated) {
        return <LoginPage setupComplete={status?.setupComplete ?? false} instanceLabel={status?.instanceLabel} />;
    }

    return <>{children}</>;
}
