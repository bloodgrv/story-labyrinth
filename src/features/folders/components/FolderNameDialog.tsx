import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface FolderNameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    initialValue?: string;
    onSubmit: (name: string) => void;
}

// Shared "type a folder name" dialog — used for both New folder/subfolder and Rename, by both the
// Lorebook folder sidebar and the ChatList folder tree.
export function FolderNameDialog({ open, onOpenChange, title, initialValue = "", onSubmit }: FolderNameDialogProps) {
    const [name, setName] = useState(initialValue);

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                onOpenChange(next);
                if (next) setName(initialValue);
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Folder name"
                        onKeyDown={e => {
                            if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
                        }}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => name.trim() && onSubmit(name.trim())} disabled={!name.trim()}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
