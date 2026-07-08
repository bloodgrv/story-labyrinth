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

// Helper for form data uploads (no Content-Type header - browser sets multipart boundary)
export const uploadFile = async <T>(url: string, file: File): Promise<T> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}${url}`, {
        method: "POST",
        body: formData
    });
    if (!response.ok) {
        notifyIfUnauthorized(response.status, url);
        const error = await response.json().catch(() => ({ error: "Upload failed" }));
        const message = error.details ? `${error.error}: ${error.details}` : error.error || "Upload failed";
        throw new Error(message);
    }
    return response.json();
};
