import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateVersionMutation } from "@/features/chapter-versions/hooks/useChapterVersionsQuery";

interface GenerateVersionDialogProps {
    chapterId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function GenerateVersionDialog({ chapterId, open, onOpenChange }: GenerateVersionDialogProps) {
    const [instruction, setInstruction] = useState("");
    const generateMutation = useGenerateVersionMutation(chapterId);

    const handleGenerate = () => {
        generateMutation.mutate(instruction.trim() || undefined, {
            onSuccess: () => {
                onOpenChange(false);
                setInstruction("");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Generate AI Draft</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                    <Label>Instruction (optional)</Label>
                    <Textarea
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                        placeholder="e.g. Make the ending darker, or tighten the pacing in the middle section"
                        rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                        Leave blank for a general alternate take on the chapter as it stands.
                    </p>
                </div>
                <DialogFooter>
                    <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
                        {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                        Generate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
