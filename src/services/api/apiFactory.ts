import { beginAiOneShot, endAiOneShot } from "@/features/activity/store/aiActivityStore";

const API_BASE = "/api";

// Dispatched whenever any API call comes back 401 (session expired/missing) so AuthGate
// can drop back to the login screen without every caller needing to handle it.
export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

const notifyIfUnauthorized = (status: number, pathname: string) => {
    if (status === 401 && !pathname.startsWith("/auth/")) window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
};

// AI Actions lamp (aiActivityStore.ts's one-shot registry) — a curated allowlist of the one-shot
// AI POST endpoints fetchJSON/uploadFile already funnel through, matched against the path only
// (no query string). Deliberately excludes /lorebook/:id/image (plain file upload, no AI) and
// /lorebook/global/import (JSON bulk import, no AI) despite living right next to entries that DO
// match — every entry here was traced against the real server route, not guessed.
const AI_ONE_SHOT_ENDPOINTS: { pattern: RegExp; label: string }[] = [
    { pattern: /^\/humanizer\/rewrite$/, label: "Humanize text" },
    { pattern: /^\/lorebook\/sheet\/improve$/, label: "Improve Lore Sheet" },
    { pattern: /^\/lorebook\/[^/]+\/sheet\/sync$/, label: "Sync structured fields" },
    { pattern: /^\/lorebook\/[^/]+\/timeline\/extract-pins$/, label: "Extract timeline pins" },
    { pattern: /^\/lorebook\/[^/]+\/generate-image$/, label: "Generate image" },
    { pattern: /^\/lorebook\/import\/document(\/batch)?$/, label: "Import document" },
    { pattern: /^\/outline-import$/, label: "Import outline structure" }
];

const matchAiOneShotLabel = (url: string): string | undefined =>
    AI_ONE_SHOT_ENDPOINTS.find(({ pattern }) => pattern.test(url.split("?")[0]))?.label;

// Helper function for fetch requests
export const fetchJSON = async <T>(url: string, options?: RequestInit): Promise<T> => {
    const aiLabel = matchAiOneShotLabel(url);
    const activityId = aiLabel ? beginAiOneShot({ label: aiLabel }) : undefined;
    try {
        const response = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options?.headers
            }
        });

        if (!response.ok) {
            notifyIfUnauthorized(response.status, url);
            const error = await response.json().catch(() => ({ error: "Request failed" }));
            throw new Error(error.error || `Request failed with status ${response.status}`);
        }

        // 204/other no-body responses have nothing for response.json() to parse — it throws
        // "Unexpected end of JSON input" on the empty string. Callers (e.g. chat/story delete)
        // expect a resolved promise on success, not a thrown error.
        if (response.status === 204) return undefined as T;

        return await response.json();
    } finally {
        if (activityId) endAiOneShot(activityId);
    }
};

// Helper for endpoints that return a binary body on success (e.g. generated audio) and JSON
// on failure — fetchJSON can't be reused since it always parses the success response as JSON.
export const fetchBlob = async (url: string, options?: RequestInit): Promise<Blob> => {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options?.headers
        }
    });

    if (!response.ok) {
        notifyIfUnauthorized(response.status, url);
        const error = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || `Request failed with status ${response.status}`);
    }

    return response.blob();
};

// Helper for form data uploads (no Content-Type header - browser sets multipart boundary).
// `timeoutMs` is opt-in (undefined = no timeout, matching every existing caller's behavior) —
// only document import passes one, since that's the one upload whose server-side work includes
// a third-party LLM call that can genuinely hang (e.g. a stuck OAuth token refresh) with no
// error ever surfacing, unlike the other callers here which are just local file processing.
// `fields` is opt-in too (undefined = file-only, every pre-existing caller's behavior) — Name
// Generator's CSV import (NG5) is the first caller that needs extra multipart fields alongside
// the file (pool metadata the CSV itself doesn't carry).
export const uploadFile = async <T>(url: string, file: File, timeoutMs?: number, fields?: Record<string, string>): Promise<T> => {
    const aiLabel = matchAiOneShotLabel(url);
    const activityId = aiLabel ? beginAiOneShot({ label: aiLabel }) : undefined;
    const formData = new FormData();
    formData.append("file", file);
    if (fields) for (const [key, value] of Object.entries(fields)) formData.append(key, value);
    const controller = timeoutMs ? new AbortController() : undefined;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
        let response: Response;
        try {
            response = await fetch(`${API_BASE}${url}`, {
                method: "POST",
                body: formData,
                signal: controller?.signal
            });
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError")
                throw new Error(`Timed out after ${Math.round((timeoutMs as number) / 1000)}s — check your AI provider connection and try again.`);
            throw err;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }

        if (!response.ok) {
            notifyIfUnauthorized(response.status, url);
            const error = await response.json().catch(() => ({ error: "Upload failed" }));
            const message = error.details ? `${error.error}: ${error.details}` : error.error || "Upload failed";
            throw new Error(message);
        }
        return await response.json();
    } finally {
        if (activityId) endAiOneShot(activityId);
    }
};
