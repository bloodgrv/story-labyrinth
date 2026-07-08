import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
    clearPreferredLayout,
    clearSession,
    getPreferredLayout,
    getSession,
    recordTabOpen,
    savePreferredLayout
} from "./sessionStorage";
import type { PreferredLayout, StorySession } from "./types";

export function useSessionManager(storyId: string) {
    const [session, setSession] = useState<StorySession | null>(null);
    const [preferredLayout, setPreferredLayout] = useState<PreferredLayout | null>(null);

    useEffect(() => {
        if (!storyId) {
            setSession(null);
            setPreferredLayout(null);
            return;
        }
        setSession(getSession(storyId));
        setPreferredLayout(getPreferredLayout(storyId));
    }, [storyId]);

    const recordTab = useCallback(
        (url: string, label: string) => {
            if (!storyId) return;
            setSession(recordTabOpen(storyId, url, label));
        },
        [storyId]
    );

    const saveLayout = useCallback(
        (label: string) => {
            const tabs = session?.tabs.map(t => ({ url: t.url, label: t.label })) ?? [];
            if (!tabs.length) {
                toast.info("Open some tabs first, then save the layout");
                return;
            }
            const layout = savePreferredLayout(storyId, tabs, label);
            setPreferredLayout(layout);
            toast.success("Preferred layout saved");
        },
        [storyId, session]
    );

    const restoreLayout = useCallback(() => {
        if (!preferredLayout) return;
        preferredLayout.tabs.forEach(tab => {
            window.open(window.location.origin + tab.url, "_blank", "noopener,noreferrer");
            recordTabOpen(storyId, tab.url, tab.label);
        });
        setSession(getSession(storyId));
        const count = preferredLayout.tabs.length;
        toast.success(`Opened ${count} tab${count !== 1 ? "s" : ""}`);
    }, [storyId, preferredLayout]);

    const deleteLayout = useCallback(() => {
        clearPreferredLayout(storyId);
        setPreferredLayout(null);
        toast.success("Preferred layout cleared");
    }, [storyId]);

    const clearSessionTabs = useCallback(() => {
        if (!storyId) return;
        clearSession(storyId);
        setSession(null);
    }, [storyId]);

    return {
        session,
        preferredLayout,
        recordTab,
        saveLayout,
        restoreLayout,
        deleteLayout,
        clearSessionTabs
    };
}
