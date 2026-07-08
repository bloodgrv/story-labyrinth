import type { KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
    title: string;
    description: string;
    icon: LucideIcon;
    href?: string;
    badge?: string | number;
    /** Fully unbuilt — dims the card and disables click, shows a "Soon" badge. */
    comingSoon?: boolean;
    /** Built, but reached via a related/simplified view rather than a dedicated page — shows a subtler badge instead of dimming the card. */
    linkedVia?: string;
    actions?: ReactNode;
    className?: string;
    onOpen?: () => void;
}

export function DashboardCard({
    title,
    description,
    icon: Icon,
    href,
    badge,
    comingSoon,
    linkedVia,
    actions,
    className,
    onOpen
}: DashboardCardProps) {
    const isClickable = !!href && !comingSoon;

    const handleOpen = () => {
        if (!isClickable) return;
        onOpen?.();
        window.open(href, "_blank", "noopener,noreferrer");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!isClickable) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpen();
        }
    };

    return (
        <Card
            className={cn(
                "transition-all duration-150",
                isClickable &&
                    "cursor-pointer hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/40",
                comingSoon && "opacity-60",
                className
            )}
            onClick={handleOpen}
            onKeyDown={handleKeyDown}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
        >
            <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="shrink-0 p-1.5 rounded-md bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <CardTitle className="text-sm font-semibold leading-tight">{title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {badge !== undefined && (
                            <Badge variant="secondary" className="text-xs font-normal">
                                {badge}
                            </Badge>
                        )}
                        {comingSoon && (
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                Soon
                            </Badge>
                        )}
                        {!comingSoon && linkedVia && (
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                via {linkedVia}
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                {actions && (
                    <div className="mt-3" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        {actions}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
