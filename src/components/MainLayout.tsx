import { Home } from "lucide-react";
import { Link, Outlet } from "react-router";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { RemoteSessionToggle } from "@/features/auth/components/RemoteSessionToggle";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";

export function MainLayout() {
    return (
        <div className="min-h-screen flex bg-background">
            {/* Fixed Icon Navigation - hidden on mobile */}
            <div className="hidden md:flex w-12 border-r bg-muted/50 flex-col items-center py-4 fixed h-screen">
                {/* Top Navigation Icons */}
                <div className="flex-1 flex flex-col space-y-4">
                    <Link to="/">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 hover:bg-accent hover:text-accent-foreground"
                        >
                            <Home className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>

                {/* Theme Toggle + Logout at Bottom */}
                <div className="pb-4 flex flex-col items-center gap-1">
                    <ThemeToggle />
                    <RemoteSessionToggle collapsed className="h-9 w-9" />
                    <LogoutButton collapsed className="h-9 w-9" />
                </div>
            </div>

            {/* Main Content Area - offset removed on mobile */}
            <div className="flex-1 ml-0 md:ml-12">
                <Outlet />
            </div>
        </div>
    );
}
