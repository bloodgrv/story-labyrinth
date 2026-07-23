import { ImageOff, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Control, UseFormSetValue } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import { lorebookApi } from "@/services/api/client";
import type { CreateEntryForm } from "./entryFormUtils";

interface ImageUploadFieldProps {
    control: Control<CreateEntryForm>;
    setValue: UseFormSetValue<CreateEntryForm>;
    entryId?: string;
    hasExistingImage: boolean;
    // L2, docs/Locations_And_Maps_Design.md — only location entries get the Mood|Map preset
    // toggle; every other category stays on the original description-driven "mood" generation.
    isLocation?: boolean;
}

// Deferred like CodexStateEditor's state — picking/removing/generating an image only updates
// local form state here (`imageFile`, `generateImageOnSave`); the actual upload/delete/generate
// call happens in LorebookEntryEditor's handleSubmit after the base entry create/update succeeds,
// since a brand-new entry has no id (and therefore nowhere to upload to) until that point.
export function ImageUploadField({ control, setValue, entryId, hasExistingImage, isLocation }: ImageUploadFieldProps) {
    const imageFile = useWatch({ control, name: "imageFile" });
    const generateImageOnSave = useWatch({ control, name: "generateImageOnSave" });
    const description = useWatch({ control, name: "description" });
    const generateImagePreset = useWatch({ control, name: "generateImagePreset" }) ?? "mood";
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
    const previewSrc = objectUrl ?? (showExisting ? lorebookApi.imageUrl(entryId as string) : null);
    const canRemove = !isRemoved && (previewSrc !== null || imageFile instanceof File);

    const pickFile = (file: File) => {
        setValue("imageFile", file, { shouldDirty: true });
        setValue("generateImageOnSave", false, { shouldDirty: true });
    };

    const generateFromDescription = () => {
        setValue("generateImageOnSave", true, { shouldDirty: true });
        setValue("imageFile", undefined, { shouldDirty: true });
    };

    const removeImage = () => {
        setValue("imageFile", null, { shouldDirty: true });
        setValue("generateImageOnSave", false, { shouldDirty: true });
    };

    return (
        <div className="space-y-2">
            <FormLabel>Image</FormLabel>
            <div className="h-56 w-56 overflow-hidden rounded-md border bg-muted flex items-center justify-center">
                {previewSrc ? (
                    <img src={previewSrc} alt="" className="h-full w-full object-cover" />
                ) : generateImageOnSave ? (
                    <Sparkles className="h-10 w-10 text-muted-foreground" />
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
                    variant={generateImageOnSave ? "secondary" : "outline"}
                    size="sm"
                    disabled={!description?.trim()}
                    onClick={generateFromDescription}
                >
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Generate from Description
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
            {generateImageOnSave && (
                <p className="text-xs text-muted-foreground">
                    Will generate a new {generateImagePreset === "map" ? "top-down map" : "mood"} image from the description when you
                    save.
                </p>
            )}
        </div>
    );
}
