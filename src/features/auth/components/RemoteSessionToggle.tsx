import { Shield, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStatus, useSetRemoteSessionMutation } from "../hooks/useAuthStatus";

interface RemoteSessionToggleProps {
    collapsed?: boolean;
    className?: string;
}

const TOOLTIP = "Stricter session on this browser (1 day max, 1 hour idle). Use on work or shared PCs.";

// Remote Access — RF3 sidebar Remote toggle (docs/Remote_Access_Funnel_Design.md §5b). Placed
// immediately above LogoutButton in Sidebar.tsx's footer cluster, per the design's locked
// placement. Any authenticated role may flip this — it declares "this browser is less trusted,"
// not an admin action. Does NOT start/stop Tailscale Funnel on the host (ops/CLI only, per lock).
export function RemoteSessionToggle({ collapsed, className }: RemoteSessionToggleProps) {
    const { data: status } = useAuthStatus();
    const setRemoteMutation = useSetRemoteSessionMutation();
    const isOn = status?.remoteProfile ?? false;
    const Icon = isOn ? ShieldCheck : Shield;

    return (
        <Button
            variant={isOn ? "secondary" : "ghost"}
            size={collapsed ? "icon" : "default"}
            className={cn(collapsed ? className : `w-full justify-start gap-2 ${className ?? ""}`, isOn && "text-primary")}
            onClick={() => setRemoteMutation.mutate(!isOn)}
            disabled={setRemoteMutation.isPending}
            title={TOOLTIP}
        >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="text-sm">{isOn ? "Remote · On" : "Remote"}</span>}
        </Button>
    );
}
