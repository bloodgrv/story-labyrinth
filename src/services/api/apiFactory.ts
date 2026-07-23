const API_BASE = "/api";

// Dispatched whenever any API call comes back 401 (session expired/missing) so AuthGate
// can drop back to the login screen without every caller needing to handle it.
export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

const notifyIfUnauthorized = (status: number, pathname: string) => {
    if (status === 401 && !pathname.startsWith("/auth/")) window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
};

// Helper function for fetch requests
export const fetchJSON = async <T>(url: string, options?: RequestInit): Promise<T> => {
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

    return response.json();
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
    const formData = new FormData();
    formData.append("file", file);
    if (fields) for (const [key, value] of Object.entries(fields)) formData.append(key, value);
    const controller = timeoutMs ? new AbortController() : undefined;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

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
    return response.json();
};
