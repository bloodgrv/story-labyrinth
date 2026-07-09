import { ImageOff, Upload, X } from "lucide-react";
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
}

// Deferred like CodexStateEditor's state — picking or removing an image only updates local form
// state (`imageFile`) here; the actual upload/delete call happens in LorebookEntryEditor's
// handleSubmit after the base entry create/update succeeds, since a brand-new entry has no id
// (and therefore nowhere to upload to) until that point.
export function ImageUploadField({ control, setValue, entryId, hasExistingImage }: ImageUploadFieldProps) {
    const imageFile = useWatch({ control, name: "imageFile" });
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

    return (
        <div className="border rounded-md p-3">
            <FormLabel>Image</FormLabel>
            <div className="mt-2 flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted flex items-center justify-center">
                    {previewSrc ? (
                        <img src={previewSrc} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <ImageOff className="h-6 w-6 text-muted-foreground" />
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <label aria-label={previewSrc ? "Replace image" : "Upload image"}>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) setValue("imageFile", file, { shouldDirty: true });
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
                    {canRemove && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setValue("imageFile", null, { shouldDirty: true })}
                        >
                            <X className="h-4 w-4 mr-1.5" />
                            Remove
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
