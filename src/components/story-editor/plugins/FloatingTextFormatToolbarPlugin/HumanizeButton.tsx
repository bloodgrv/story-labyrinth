import { Loader2, Sparkles } from "lucide-react";
import type { JSX } from "react";
import { Button } from "@/components/ui/button";

interface HumanizeButtonProps {
    isHumanizing: boolean;
    onHumanize: () => void;
}

export const HumanizeButton = ({ isHumanizing, onHumanize }: HumanizeButtonProps): JSX.Element => (
    <Button
        variant="outline"
        size="sm"
        onClick={onHumanize}
        disabled={isHumanizing}
        className="flex items-center gap-1"
        title="Rewrite the selected text to sound more human"
    >
        {isHumanizing ? (
            <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Humanizing...</span>
            </>
        ) : (
            <>
                <Sparkles className="h-3 w-3" />
                <span>Humanize</span>
            </>
        )}
    </Button>
);
