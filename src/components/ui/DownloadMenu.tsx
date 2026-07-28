import { attemptPromise } from "@jfdi/attempt";
import { Download } from "lucide-react";
import type { MouseEvent } from "react";
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { chaptersApi, storiesApi } from "@/services/api/client";
import { downloadChapter } from "@/utils/export/downloadChapter";
import { downloadStory } from "@/utils/export/downloadStory";
import { computeEpubPreflightWarnings } from "@/utils/export/epubPreflight";
import { logger } from "@/utils/logger";
import { Button } from "./button";
import { ConfirmDialog } from "./ConfirmDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

interface DownloadMenuProps {
    type: "story" | "chapter";
    id: string;
    variant?: "outline" | "ghost" | "link" | "default" | "destructive" | "secondary";
    size?: "default" | "sm" | "lg" | "icon";
    showIcon?: boolean;
    label?: string;
    className?: string;
}

export function DownloadMenu({
    type,
    id,
    variant = "ghost",
    size = "icon",
    showIcon = true,
    label = "Download",
    className = ""
}: DownloadMenuProps) {
    const [epubWarnings, setEpubWarnings] = useState<string[]>([]);
    const [epubConfirmOpen, setEpubConfirmOpen] = useState(false);
    const pendingEpubDownload = useRef<(() => void) | null>(null);

    const runDownload = async (format: "html" | "text" | "markdown" | "epub" | "pdf") => {
        const [error] = await attemptPromise(async () => {
            if (type === "story") await downloadStory(id, format);
            else await downloadChapter(id, format);
        });
        if (error) {
            logger.error(`Failed to download ${type}:`, error);
            toast.error(`Failed to download ${type}`, {
                position: "bottom-center",
                autoClose: 2000
            });
            return;
        }
        toast.success(`${type === "story" ? "Story" : "Chapter"} downloaded as ${format.toUpperCase()}`, {
            position: "bottom-center",
            autoClose: 2000
        });
    };

    const handleDownload = async (format: "html" | "text" | "markdown" | "epub" | "pdf", e: MouseEvent) => {
        e.stopPropagation();

        if (format !== "epub") {
            await runDownload(format);
            return;
        }

        // Soft preflight (KDP3): never blocks export, just surfaces things that
        // would look off on Kindle before the download actually fires.
        const [preflightError, warnings] = await attemptPromise(async () => {
            const story = type === "story" ? await storiesApi.getById(id) : null;
            const chapter = type === "chapter" ? await chaptersApi.getById(id) : null;
            const resolvedStory = story || (chapter && (await storiesApi.getById(chapter.storyId)));
            if (!resolvedStory) throw new Error("Story not found");

            const chapters = await chaptersApi.getByStory(resolvedStory.id);
            return computeEpubPreflightWarnings(resolvedStory, chapters);
        });

        if (preflightError || !warnings || warnings.length === 0) {
            await runDownload("epub");
            return;
        }

        setEpubWarnings(warnings);
        pendingEpubDownload.current = () => runDownload("epub");
        setEpubConfirmOpen(true);
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant={variant} size={size} className={`flex items-center gap-1 ${className}`}>
                        {showIcon && <Download className="h-4 w-4" />}
                        {(size !== "icon" || !showIcon) && label}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={e => handleDownload("html", e)}>Download as HTML</DropdownMenuItem>
                    <DropdownMenuItem onClick={e => handleDownload("text", e)}>Download as Text</DropdownMenuItem>
                    <DropdownMenuItem onClick={e => handleDownload("markdown", e)}>
                        Download as Markdown
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={e => handleDownload("epub", e)}>
                        Download as EPUB (Kindle)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={e => handleDownload("pdf", e)}>Download as PDF</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmDialog
                open={epubConfirmOpen}
                onOpenChange={setEpubConfirmOpen}
                title="Before you export..."
                description={`${epubWarnings.join(" ")} You can still export — this won't block you.`}
                confirmLabel="Export anyway"
                cancelLabel="Cancel"
                onConfirm={() => {
                    setEpubConfirmOpen(false);
                    pendingEpubDownload.current?.();
                }}
            />
        </>
    );
}
