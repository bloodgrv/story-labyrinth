import { ImageOff, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Control, UseFormSetValue } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { lorebookApi } from "@/services/api/client";
import { resolveImageGenerationBrief, type CreateEntryForm } from "./entryFormUtils";

interface ImageUploadFieldProps {
    control: Control<CreateEntryForm>;
    setValue: UseFormSetValue<CreateEntryForm>;
    entryId?: string;
    hasExistingImage: boolean;
    // The entry's current server-side image filename (a fresh random UUID every
    // upload/generate/replace, see lorebookImageStorage.ts) — used purely as a cache-busting
    // query param. GET /:id/image is a stable URL regardless of which file backs it, so without
    // this the browser can keep serving the previous image's cached bytes after a regenerate.
    imageFilename?: string | null;
    // L2, docs/Locations_And_Maps_Design.md — only location entries get the Mood|Map preset
    // toggle; every other category stays on the original description-driven "mood" generation.
    isLocation?: boolean;
    // Fires the real lorebookApi.generateImage call immediately (lazily creating the entry first
    // if it's still unsaved) — see LorebookEntryEditor.tsx's handleGenerateImage. Unlike
    // Upload/Remove below (still deferred to form submit, unchanged), generation doesn't wait for
    // Update/Create — there's no reason to once an id exists, and even a brand-new entry gets one
    // via the same lazy-create path starting a WB chat before Create already uses.
    onGenerateImage: (preset: "mood" | "map") => void;
    isGeneratingImage: boolean;
}

// Upload/Remove are still deferred like CodexStateEditor's state — picking/removing an image only
// updates local form state here (`imageFile`), the actual call happens in LorebookEntryEditor's
// handleSubmit after the base entry create/update succeeds. Generation is NOT deferred (see
// onGenerateImage above) — it fires as soon as you click, independent of the Update button.
export function ImageUploadField({
    control,
    setValue,
    entryId,
    hasExistingImage,
    imageFilename,
    isLocation,
    onGenerateImage,
    isGeneratingImage
}: ImageUploadFieldProps) {
    const imageFile = useWatch({ control, name: "imageFile" });
    const description = useWatch({ control, name: "description" });
    const sheetBody = useWatch({ control, name: "sheetBody" });
    const placeState = useWatch({ control, name: "placeState" });
    const generateImagePreset = useWatch({ control, name: "generateImagePreset" }) ?? "mood";
    // Live, not saved — matches whatever's actually on the page right now (see
    // resolveImageGenerationBrief's own comment for why this replaced a description-only check).
    const generationBrief = resolveImageGenerationBrief({ description, sheetBody, placeState }, generateImagePreset);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!(imageFile instanceof File)) {
            setObjectUrl(null);
            return;
        }
        const url = URL.createObjectURL(imageFile);
        setObjectUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    const isRemoved = imageFile === null;
    const showExisting = hasExistingImage && imageFile === undefined && !!entryId;
    const previewSrc =
        objectUrl ?? (showExisting ? `${lorebookApi.imageUrl(entryId as string)}?v=${imageFilename ?? ""}` : null);
    const canRemove = !isRemoved && (previewSrc !== null || imageFile instanceof File);
    const [lightboxOpen, setLightboxOpen] = useState(false);

    const pickFile = (file: File) => {
        setValue("imageFile", file, { shouldDirty: true });
    };

    const removeImage = () => {
        setValue("imageFile", null, { shouldDirty: true });
    };

    return (
        <div className="space-y-2">
            <FormLabel>Image</FormLabel>
            <div className="h-56 w-56 overflow-hidden rounded-md border bg-muted flex items-center justify-center">
                {previewSrc ? (
                    <>
                        <img
                            src={previewSrc}
                            alt=""
                            onClick={() => setLightboxOpen(true)}
                            className="h-full w-full object-cover cursor-zoom-in transition-opacity hover:opacity-90"
                        />
                        <ImageLightbox
                            src={previewSrc}
                            alt="Entry image"
                            open={lightboxOpen}
                            onOpenChange={setLightboxOpen}
                        />
                    </>
                ) : isGeneratingImage ? (
                    <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                ) : (
                    <ImageOff className="h-10 w-10 text-muted-foreground" />
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                <label aria-label={previewSrc ? "Replace image" : "Upload image"}>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) pickFile(file);
                            e.target.value = "";
                        }}
                    />
                    <Button type="button" variant="outline" size="sm" asChild>
                        <span className="cursor-pointer">
                            <Upload className="h-4 w-4 mr-1.5" />
                            {previewSrc ? "Replace" : "Upload"}
                        </span>
                    </Button>
                </label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!generationBrief.trim() || isGeneratingImage}
                    onClick={() => onGenerateImage(generateImagePreset)}
                >
                    {isGeneratingImage ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4 mr-1.5" />
                    )}
                    Generate Image
                </Button>
                {isLocation && (
                    <div className="flex rounded-md border overflow-hidden">
                        <Button
                            type="button"
                            variant={generateImagePreset === "mood" ? "secondary" : "ghost"}
                            size="sm"
                            className="rounded-none"
                            onClick={() => setValue("generateImagePreset", "mood", { shouldDirty: true })}
                        >
                            Mood
                        </Button>
                        <Button
                            type="button"
                            variant={generateImagePreset === "map" ? "secondary" : "ghost"}
                            size="sm"
                            className="rounded-none"
                            onClick={() => setValue("generateImagePreset", "map", { shouldDirty: true })}
                        >
                            Map
                        </Button>
                    </div>
                )}
                {canRemove && (
                    <Button type="button" variant="ghost" size="sm" onClick={removeImage}>
                        <X className="h-4 w-4 mr-1.5" />
                        Remove
                    </Button>
                )}
            </div>
        </div>
    );
}
