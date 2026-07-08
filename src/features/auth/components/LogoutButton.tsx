import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthMutations } from "../hooks/useAuthStatus";

interface LogoutButtonProps {
    collapsed?: boolean;
    className?: string;
}

export function LogoutButton({ collapsed, className }: LogoutButtonProps) {
    const { logout } = useAuthMutations();

    return (
        <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            className={collapsed ? className : `w-full justify-start gap-2 ${className ?? ""}`}
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            title="Log out"
        >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="text-sm">Log out</span>}
        </Button>
    );
}
