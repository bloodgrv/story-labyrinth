import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface SectionHeadingProps {
    children: ReactNode;
}

export function SectionHeading({ children }: SectionHeadingProps) {
    return (
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
            {children}
        </h2>
    );
}

interface StatCountProps {
    label: string;
    value: number;
    isLoading: boolean;
}

// Small inline count that shows a spinner while loading instead of a misleading "0".
export function StatCount({ label, value, isLoading }: StatCountProps) {
    if (isLoading)
        return (
            <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {label}
            </span>
        );

    return (
        <span>
            {value} {label}
            {value !== 1 ? "s" : ""}
        </span>
    );
}
