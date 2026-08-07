import { attemptPromise } from "@jfdi/attempt";
import { ArrowLeft, Copy, Download, Loader2, MapPin, Trash2 } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { useUpdateLorebookMutation } from "@/features/lorebook/hooks/useLorebookQuery";
import { useLocationEntryQuery } from "@/features/story-maps/hooks/useLocationEntriesQuery";
import { useDeleteStoryMapDocumentMutation, useStoryMapDocumentQuery, useUpdateStoryMapDocumentMutation } from "@/features/story-maps/hooks/useStoryMapsQuery";
import { sceneToMarkdown } from "@/features/story-maps/lib/sceneToText";
import { isDarkThemeId, useTheme } from "@/lib/theme-provider";
import type { MapSketchElementSkeleton } from "@/types/storyMaps";

// Lazy-loaded — Excalidraw (MapCanvas.tsx) is a large dependency this app has no business pulling
// into the main bundle for every page that never opens Maps.
const MapCanvas = lazy(() => import("./MapCanvas").then(m => ({ default: m.MapCanvas })));

interface MapDetailPanelProps {
    storyId: string;
    mapId: string;
    onBack: () => void;
    onDeleted: () => void;
    // MV5 — an accepted ```map-sketch-proposal, handed down from MapsTool.tsx (which consumed it
    // from StoryContext.pendingMapSketch). Takes priority over MV4's convert-offer banner — the
    // user already explicitly accepted a full-replace in the chat, so there's nothing to ask again.
    seedSkeleton?: MapSketchElementSkeleton[];
}

// MV2 (docs/Maps_V2_Sketch_Design.md) — header (title/location/delete) stays a normal flow block;
// the canvas below needs a real bounded viewport to render into (Excalidraw fills its parent's
// height, it doesn't grow to fit content), so this switched from MV1's page-scrolling `p-6`
// wrapper to a `h-full flex flex-col` shell — MainContent.tsx's `needsBoundedHeight` list grew
// "story-map" back (same reasoning as Relationships' React Flow canvas).
export function MapDetailPanel({ storyId, mapId, onBack, onDeleted, seedSkeleton }: MapDetailPanelProps) {
    const { data: map, isLoading } = useStoryMapDocumentQuery(mapId);
    const { data: location, isLoading: locationLoading } = useLocationEntryQuery(map?.locationId ?? null);
    const { theme } = useTheme();
    const updateMutation = useUpdateStoryMapDocumentMutation(storyId);
    const updateLorebookMutation = useUpdateLorebookMutation();
    const deleteMutation = useDeleteStoryMapDocumentMutation(storyId);
    const [title, setTitle] = useState("");
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [isExportingImage, setIsExportingImage] = useState(false);
    // MV4 (docs/Maps_V2_Sketch_Design.md) — "offer Convert to sketch once per location when
    // opening Maps" (migration table). Interpreted as "while the scene is still empty and the
    // location has layoutMd text" rather than a persisted one-time-ever flag: no new schema
    // needed, and it naturally goes silent forever the moment the scene gains any content
    // (conversion or manual drawing) — see DECISIONS.md for the full reasoning.
    const [convertChoice, setConvertChoice] = useState<"pending" | "convert" | "skip">("pending");

    // Keyed on map.id, not the whole `map` object: MapCanvas's autosave (every ~1s while drawing)
    // replaces the detail query's cache entry on every scene save, which would otherwise re-run
    // this effect and clobber an in-progress rename with the last-committed title. Only actually
    // switching to a different map (or the initial load) should reset the local title draft.
    useEffect(() => {
        if (map) setTitle(map.title);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on id only, see comment above
    }, [map?.id]);

    const commitTitle = () => {
        if (!map || !title.trim() || title.trim() === map.title) return;
        updateMutation.mutate({ id: map.id, data: { title: title.trim() } });
    };

    const handleDelete = () => {
        deleteMutation.mutate(mapId, { onSuccess: onDeleted });
    };

    const sceneElements = (map?.sceneJson as { elements?: unknown[] } | null | undefined)?.elements ?? [];
    const layoutMdText = location?.metadata?.placeState?.layoutMd?.trim() || "";
    const showConvertOffer = !seedSkeleton && !!map?.locationId && !!layoutMdText && sceneElements.length === 0;

    // MV4's export half — the scene's current (last-saved) content, summarized as markdown, either
    // written into the linked location's place sheet or copied to the clipboard for a free map.
    // Reads the last-saved sceneJson, not live unsaved canvas state (MapCanvas's own autosave lag
    // is ~1s) — acceptable for a manual, occasional export action, not worth wiring an
    // excalidrawAPI ref just to shave a second.
    const handleExport = () => {
        const markdown = sceneToMarkdown(sceneElements);
        if (!markdown) {
            toast.info("Nothing to export yet — draw something on the canvas first.");
            return;
        }
        if (map?.locationId) {
            updateLorebookMutation.mutate({
                id: map.locationId,
                data: { metadata: { ...location?.metadata, placeState: { ...location?.metadata?.placeState, layoutMd: markdown } } }
            });
        } else {
            void navigator.clipboard.writeText(markdown).then(() => toast.success("Copied to clipboard"));
        }
    };

    // MV6 — illustration-only PNG snapshot (design doc decision #7: images never SoT, never
    // re-imported). Uses Excalidraw's own `exportToBlob` (a pure elements→canvas renderer, not a
    // DOM screenshot) against the last-saved scene, same "last-saved, not live" tradeoff as
    // handleExport above. Dynamically imported rather than a static top-of-file import — this
    // component is eager (mounted for every map, not just ones the user opens), and a static
    // import would pull @excalidraw/excalidraw's runtime out of MapCanvas.tsx's lazy chunk and
    // into the main bundle, undoing MV2's whole lazy-loading decision. The dynamic import resolves
    // to the exact same chunk MapCanvas.tsx already lazy-loads, so this never doubles the download.
    const handleDownloadImage = async () => {
        if (!map || sceneElements.length === 0) {
            toast.info("Nothing to export yet — draw something on the canvas first.");
            return;
        }
        setIsExportingImage(true);
        const scene = map.sceneJson as { appState?: Record<string, unknown>; files?: Record<string, unknown> } | null;
        const [error, blob] = await attemptPromise(async () => {
            const { exportToBlob } = await import("@excalidraw/excalidraw");
            return exportToBlob({
                elements: sceneElements as Parameters<typeof exportToBlob>[0]["elements"],
                appState: { ...(scene?.appState ?? {}), exportBackground: true },
                files: (scene?.files ?? {}) as Parameters<typeof exportToBlob>[0]["files"],
                mimeType: "image/png"
            });
        });
        setIsExportingImage(false);
        if (error || !blob) {
            toast.error("Failed to export image");
            return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `${map.title}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (isLoading || !map || (map.locationId && locationLoading)) {
        return (
            <div className="h-full flex flex-col">
                <div className="p-4 border-b shrink-0">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to maps
                    </Button>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="p-3 border-b shrink-0 flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 shrink-0">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={e => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="text-base font-medium h-9 max-w-sm"
                />
                {location ? (
                    <Badge variant="secondary" className="gap-1 shrink-0">
                        <MapPin className="h-3 w-3" />
                        {location.name}
                    </Badge>
                ) : (
                    <span className="text-xs text-muted-foreground shrink-0">Free story map</span>
                )}
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0" title="Export scene as text">
                    <Copy className="h-4 w-4 mr-2" />
                    {map.locationId ? "Export to place sheet" : "Copy as text"}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadImage}
                    disabled={isExportingImage}
                    className="shrink-0"
                    title="Download the current sketch as a PNG image — illustration only, never re-imported"
                >
                    {isExportingImage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    Download PNG
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteOpen(true)} className="shrink-0">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-1 min-h-0">
                {showConvertOffer && convertChoice === "pending" ? (
                    <div className="h-full flex items-center justify-center p-6">
                        <div className="max-w-md space-y-4 rounded-lg border bg-card p-6 text-center">
                            <p className="text-sm font-medium">This location already has layout notes</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap text-left max-h-32 overflow-y-auto rounded border bg-muted/40 p-2">
                                {layoutMdText}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Drop that text onto the canvas as a starting point, or start with a blank sketch instead.
                            </p>
                            <div className="flex justify-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => setConvertChoice("skip")}>
                                    Start blank canvas
                                </Button>
                                <Button size="sm" onClick={() => setConvertChoice("convert")}>
                                    Convert to sketch
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Suspense
                        fallback={
                            <div className="h-full flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        }
                    >
                        <MapCanvas
                            key={map.id}
                            storyId={storyId}
                            map={map}
                            theme={isDarkThemeId(theme) ? "dark" : "light"}
                            seedText={convertChoice === "convert" ? layoutMdText : undefined}
                            seedSkeleton={seedSkeleton}
                        />
                    </Suspense>
                )}
            </div>

            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={setConfirmDeleteOpen}
                title="Delete this map?"
                description={`"${map.title}" and its sketch will be permanently deleted. This can't be undone.`}
                confirmLabel="Delete"
                onConfirm={handleDelete}
            />
        </div>
    );
}
