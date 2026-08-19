import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DeleteChapterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    chapterOrder: number;
    chapterTitle: string;
    onDelete: () => void;
}

export const DeleteChapterDialog = ({
    open,
    onOpenChange,
    chapterOrder,
    chapterTitle,
    onDelete
}: DeleteChapterDialogProps) => (
    <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        description={`Move Chapter ${chapterOrder}: ${chapterTitle} to Trash? You can restore it within 14 days.`}
        onConfirm={onDelete}
        confirmLabel="Delete"
    />
);
