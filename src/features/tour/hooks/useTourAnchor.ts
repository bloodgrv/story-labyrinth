import { useEffect, useState } from "react";

export interface TourAnchorState {
    rect: DOMRect | null;
    // "found" also covers "no target requested" (a centered step needs no anchor at all) —
    // only "missing" means a real target string that never showed up in the DOM, the case the
    // design's own missing-anchor fallback (§5.2/§9 OT7) needs to detect.
    status: "searching" | "found" | "missing";
}

const POLL_INTERVAL_MS = 100;
const MAX_ATTEMPTS = 20; // ~2s — long enough for a route change + lazy chunk to settle

// First-Start Tour (T11, OT1/OT7) — finds the element carrying `data-tour="<target>"` after a
// step navigates somewhere new, tolerating the render lag a route change or a newly-mounted
// chat composer introduces. `resetKey` should change whenever the caller wants a fresh search
// (typically the step/micro id) — this hook does not re-search on its own once it settles.
export function useTourAnchor(target: string | undefined, resetKey: string): TourAnchorState {
    const [state, setState] = useState<TourAnchorState>({ rect: null, status: target ? "searching" : "found" });

    useEffect(() => {
        if (!target) {
            setState({ rect: null, status: "found" });
            return;
        }

        setState({ rect: null, status: "searching" });
        let cancelled = false;
        let attempts = 0;
        let timeoutId: ReturnType<typeof setTimeout>;

        const tryFind = () => {
            if (cancelled) return;
            const el = document.querySelector(`[data-tour="${target}"]`);
            if (el) {
                setState({ rect: el.getBoundingClientRect(), status: "found" });
                return;
            }
            attempts += 1;
            if (attempts >= MAX_ATTEMPTS) {
                setState({ rect: null, status: "missing" });
                return;
            }
            timeoutId = setTimeout(tryFind, POLL_INTERVAL_MS);
        };
        tryFind();

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resetKey is the deliberate re-run trigger, target is read fresh each run
    }, [target, resetKey]);

    // Keep the rect current while the anchor is on-screen — layout shifts (sidebar collapse,
    // a dialog opening) shouldn't leave a stale spotlight hole floating in the wrong place.
    useEffect(() => {
        if (state.status !== "found" || !target) return;

        const update = () => {
            const el = document.querySelector(`[data-tour="${target}"]`);
            if (el) setState(prev => ({ ...prev, rect: el.getBoundingClientRect() }));
        };
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        const interval = setInterval(update, 400);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
            clearInterval(interval);
        };
    }, [state.status, target]);

    return state;
}
