import { useState } from "react";
import { Bookmark, ExternalLink, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { PreferredLayout, StorySession } from "@/features/session/types";

interface SessionCardProps {
    session: StorySession | null;
    preferredLayout: PreferredLayout | null;
    onSaveLayout: (label: string) => void;
    onRestoreLayout: () => void;
    onDeleteLayout: () => void;
    onClearSession: () => void;
}

export function SessionCard({
    session,
    preferredLayout,
    onSaveLayout,
    onRestoreLayout,
    onDeleteLayout,
    onClearSession
}: SessionCardProps) {
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [layoutLabel, setLayoutLabel] = useState("");

    const tabs = session?.tabs ?? [];

    const handleSave = () => {
        onSaveLayout(layoutLabel.trim() || "My working setup");
        setShowSaveInput(false);
        setLayoutLabel("");
    };

    const handleSaveClick = () => {
        if (!tabs.length) return;
        setShowSaveInput(true);
    };

    return (
        <Card>
            <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">Session</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-4">

                {/* Preferred layout section */}
                {preferredLayout ? (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{preferredLayout.label}</p>
                                <p className="text-xs text-muted-foreground">
                                    {preferredLayout.tabs.length} tab{preferredLayout.tabs.length !== 1 ? "s" : ""}
                                    {" · "}saved {new Date(preferredLayout.savedAt).toLocaleDateString()}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={onDeleteLayout}
                                title="Delete saved layout"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {preferredLayout.tabs.map(tab => (
                                <span
                                    key={tab.url}
                                    className="inline-flex items-center gap-1 text-xs bg-background border rounded px-1.5 py-0.5"
                                >
                                    <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                                    {tab.label}
                                </span>
                            ))}
                        </div>
                        <Button size="sm" className="w-full h-7 text-xs" onClick={onRestoreLayout}>
                            <RotateCcw className="h-3 w-3 mr-1.5" />
                            Restore {preferredLayout.tabs.length} tab{preferredLayout.tabs.length !== 1 ? "s" : ""}
                        </Button>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        No preferred layout saved. Open some cards and save the setup for quick restore next session.
                    </p>
                )}

                {/* Recent tabs */}
                {tabs.length > 0 && (
                    <>
                        <Separator />
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground">Opened this session</p>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                    onClick={onClearSession}
                                    title="Clear session history"
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="space-y-1">
                                {tabs.slice(0, 6).map(tab => (
                                    <div key={tab.url + tab.openedAt} className="flex items-center gap-2 text-xs">
                                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <button
                                            className="text-left hover:underline truncate flex-1 text-xs"
                                            onClick={() =>
                                                window.open(window.location.origin + tab.url, "_blank", "noopener,noreferrer")
                                            }
                                        >
                                            {tab.label}
                                        </button>
                                        <span className="text-muted-foreground shrink-0 tabular-nums">
                                            {new Date(tab.openedAt).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit"
                                            })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Save layout */}
                <Separator />
                {showSaveInput ? (
                    <div className="flex gap-1.5">
                        <Input
                            value={layoutLabel}
                            onChange={e => setLayoutLabel(e.target.value)}
                            placeholder="Layout name (optional)"
                            className="h-7 text-xs"
                            onKeyDown={e => {
                                if (e.key === "Enter") handleSave();
                                if (e.key === "Escape") setShowSaveInput(false);
                            }}
                            autoFocus
                        />
                        <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleSave}>
                            Save
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => setShowSaveInput(false)}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={handleSaveClick}
                        disabled={tabs.length === 0}
                        title={tabs.length === 0 ? "Open some tabs first" : undefined}
                    >
                        <Bookmark className="h-3 w-3 mr-1.5" />
                        Save as preferred layout
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
