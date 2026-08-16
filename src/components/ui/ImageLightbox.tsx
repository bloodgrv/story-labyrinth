import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Dialog, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
    src: string;
    alt: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// A click-to-enlarge popup for a single image — full-bleed content (no padded card chrome like
// the default DialogContent), image shown at its natural size capped to the viewport via
// object-contain, dark overlay, click-outside/Escape/X all close it (Radix's own defaults).
// Deliberately its own Content rather than reusing DialogContent: a lightbox needs transparent/
// unpadded/unbordered styling that would fight that component's card-shaped defaults.
export function ImageLightbox({ src, alt, open, onOpenChange }: ImageLightboxProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogPortal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed left-[50%] top-[50%] z-50 flex max-h-[92vh] max-w-[92vw] -translate-x-1/2 -translate-y-1/2",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                    )}
                >
                    <DialogTitle className="sr-only">{alt || "Image preview"}</DialogTitle>
                    <img src={src} alt={alt} className="max-h-[92vh] max-w-[92vw] rounded-md object-contain shadow-2xl" />
                    <DialogPrimitive.Close className="absolute -right-3 -top-3 rounded-full bg-background p-1.5 shadow-md ring-1 ring-border transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
