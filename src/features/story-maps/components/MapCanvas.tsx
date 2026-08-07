import "@excalidraw/excalidraw/index.css";
import { Excalidraw, convertToExcalidrawElements, getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef } from "react";
import { useUpdateStoryMapDocumentMutation } from "@/features/story-maps/hooks/useStoryMapsQuery";
import type { MapSketchElementSkeleton, StoryMapDocument } from "@/types/storyMaps";

interface MapCanvasProps {
    storyId: string;
    map: StoryMapDocument;
    theme: "light" | "dark";
    // MV4 (docs/Maps_V2_Sketch_Design.md) — "Convert to sketch" from an existing location's
    // layoutMd text. Only meaningful when map.sceneJson has zero elements (MapDetailPanel.tsx
    // only sets this after the user explicitly accepts the offer for an empty scene) — seeds a
    // single text element with the raw layoutMd content, no parsing/inference (implementation
    // clarification b's "dumb-but-honest" call applied here too). Ignored when `seedSkeleton` is
    // also set (mutually exclusive in practice — MapDetailPanel.tsx never passes both).
    seedText?: string;
    // MV5 — a model-proposed sketch (```map-sketch-proposal, accepted via ChatInterface.tsx's
    // handleAcceptMapSketch). Unlike seedText, applies as a FULL REPLACE regardless of whether the
    // scene already had content — the user already saw and explicitly accepted the proposal
    // (MapSketchProposalCard.tsx's own copy warns "replaces the current sketch"), matching every
    // other propose→accept flow in this app (Codex/place-sheet/psych), none of which ask "are you
    // sure" a second time either.
    seedSkeleton?: MapSketchElementSkeleton[];
}

// Maps our own loose, non-Excalidraw MapSketchElementSkeleton (what the model emits and
// parseMapSketchProposal.ts validates) onto Excalidraw's actual ExcalidrawElementSkeleton shape —
// a container's/linear element's "label" is a `{text}` object here, not a bare string; arrows/
// lines carry "points" directly. Kept as a plain data mapper, not a class/factory, since
// `convertToExcalidrawElements` (called at the two call sites below) does all the real work of
// backfilling every other required field.
const toExcalidrawSkeleton = (el: MapSketchElementSkeleton): ExcalidrawElementSkeleton => {
    const label = el.label ? { text: el.label } : undefined;
    if (el.type === "text") return { type: "text", x: el.x, y: el.y, text: el.text ?? el.label ?? "" };
    if (el.type === "arrow" || el.type === "line")
        return { type: el.type, x: el.x, y: el.y, points: el.points ?? [[0, 0], [(el.width ?? 100) as number, 0]], label } as ExcalidrawElementSkeleton;
    return { type: el.type, x: el.x, y: el.y, width: el.width ?? 100, height: el.height ?? 60, label } as ExcalidrawElementSkeleton;
};

// MV2 (docs/Maps_V2_Sketch_Design.md) — the real Excalidraw embed, replacing MapDetailPanel.tsx's
// MV1 placeholder.
//
// Lazy-loaded via React.lazy at the call site (MapDetailPanel.tsx) — Excalidraw is a large
// dependency this app has no business pulling into the main bundle for pages that never touch it.
export function MapCanvas({ storyId, map, theme, seedText, seedSkeleton }: MapCanvasProps) {
    const updateMutation = useUpdateStoryMapDocumentMutation(storyId);

    // Stable debounced save (same useRef(debounce(...)) pattern as SaveChapterContentPlugin —
    // see its own comment for why: a fresh debounce instance every render would never actually
    // wait, defeating the point). serializeAsJSON is Excalidraw's own canonical .excalidraw file
    // shape (type/version/source/elements/appState/files) — used instead of hand-rolling a scene
    // object so a later real .excalidraw file import/export (not in MV2's scope) stays trivial.
    // "database" export type strips the `type: "text/plain"` clipboard-only content Excalidraw
    // sometimes attaches — the right variant for a persisted document, not a copy/paste blob.
    const saveRef = useRef(
        debounce((mapId: string, elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
            const json = serializeAsJSON(elements, appState, files, "database");
            updateMutation.mutate({ id: mapId, data: { sceneJson: JSON.parse(json) } });
        }, 1000)
    );

    // initialData is read once at mount only — Excalidraw does not treat it as a controlled prop,
    // so this deliberately doesn't reference `map` beyond the mount-time snapshot (a mid-session
    // sceneJson change from elsewhere, e.g. a future AI Accept in MV5, needs excalidrawAPI.
    // updateScene, not a prop change — out of MV2's scope). `key={map.id}` at the call site
    // (MapDetailPanel.tsx) forces a real remount when switching between maps so this snapshot is
    // never stale for the wrong map, same defense-in-depth precedent as the Editor MultiView
    // cross-chapter content-loss bug fix (DECISIONS.md).
    //
    // Both `seedText` (MV4) and `seedSkeleton` (MV5) are folded in here rather than passed
    // straight to Excalidraw's `initialData` as raw partial objects — `convertToExcalidrawElements`
    // (the library's own skeleton→full-element converter) backfills every field Excalidraw
    // actually needs, so this never risks handing the canvas a malformed element. `seedSkeleton`
    // takes priority and is a full replace (see its own prop doc comment above); `seedText` only
    // applies when the saved scene is still empty.
    const initialData = useMemo<ExcalidrawInitialDataState>(() => {
        const scene = map.sceneJson as { elements?: unknown[]; appState?: Record<string, unknown>; files?: BinaryFiles } | null | undefined;
        const savedElements = (scene?.elements ?? []) as OrderedExcalidrawElement[];
        const elements: OrderedExcalidrawElement[] = seedSkeleton
            ? convertToExcalidrawElements(seedSkeleton.map(toExcalidrawSkeleton), { regenerateIds: true })
            : seedText && savedElements.length === 0
              ? convertToExcalidrawElements([{ type: "text", x: 40, y: 40, text: seedText, fontSize: 16 }])
              : savedElements;
        return {
            elements,
            appState: { ...(scene?.appState ?? {}) },
            files: scene?.files ?? {}
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time snapshot only, see comment above
    }, []);

    // Real, live-caught bug: Excalidraw fires `onChange` on its own internal idle/presence
    // heartbeat (~every 2s) even with zero user interaction and zero element changes — appState
    // churn only (collaborators/idle tracking), no edits. Those pulses land further apart than
    // the 1s debounce window above, so each one independently completed its own debounce cycle
    // and fired a real PATCH — confirmed live via console instrumentation: a single click
    // produced a dozen+ "debounced save FIRED" logs over the following ~20s of total inactivity.
    // Fix: gate on `getSceneVersion(elements)` (Excalidraw's own element-version hash, the
    // standard technique their own reference integrations use) and only touch the debounced save
    // at all when the elements actually changed — appState-only pulses return immediately without
    // ever arming the timer. Seeded with `initialData.elements`' own version (not the DB's stale
    // pre-conversion version) so the mount effect below, not the idle heartbeat, is what persists
    // a fresh conversion — the heartbeat would otherwise also see a "change" and race it.
    const initialElements = initialData.elements ?? [];
    const lastVersionRef = useRef<number>(getSceneVersion(initialElements as OrderedExcalidrawElement[]));

    useEffect(() => {
        // MV4/MV5 — a freshly-seeded scene (convert-to-sketch text, or an accepted AI proposal)
        // needs to land in the DB immediately, not wait for the next onChange/idle heartbeat — a
        // reload one second after clicking "Convert"/"Accept" must not lose it back to the old scene.
        if ((seedText || seedSkeleton) && initialElements.length > 0) {
            const json = serializeAsJSON(initialElements as OrderedExcalidrawElement[], initialData.appState ?? {}, initialData.files ?? {}, "database");
            updateMutation.mutate({ id: map.id, data: { sceneJson: JSON.parse(json) } });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once at mount only, mirrors initialData's own one-shot snapshot
    }, []);

    useEffect(
        () => () => {
            // Flush, don't cancel — same reasoning as SaveChapterContentPlugin's unmount cleanup:
            // this component unmounts on every "Back to maps" click and tool switch, and a
            // still-pending debounced save at that moment (e.g. user drew something and
            // immediately clicked back) must not be silently discarded.
            saveRef.current.flush();
        },
        []
    );

    return (
        <div className="h-full w-full">
            <Excalidraw
                initialData={initialData}
                theme={theme}
                onChange={(elements, appState, files) => {
                    const version = getSceneVersion(elements);
                    if (version === lastVersionRef.current) return;
                    lastVersionRef.current = version;
                    saveRef.current(map.id, elements, appState, files);
                }}
            />
        </div>
    );
}
