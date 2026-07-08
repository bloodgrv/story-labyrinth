import { attemptPromise } from "@jfdi/attempt";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "react-toastify";
import { aiService } from "@/services/ai/AIService";
import { grokOAuthApi } from "@/services/api/client";
import { logger } from "@/utils/logger";
import { aiSettingsKeys } from "./useAISettingsQuery";

type ConnectState =
    | { phase: "idle" }
    | { phase: "connecting"; userCode: string; verificationUriComplete: string }
    | { phase: "error"; message: string };

// Drives xAI's OAuth device flow: start it, show the user a code + link to approve in their
// browser, then poll until they finish (or the code expires / they're denied). On success the
// server has already persisted the tokens — this just needs to re-initialize the local provider
// and refresh its model list so the UI reflects "connected" immediately.
export const useGrokOAuthConnect = () => {
    const queryClient = useQueryClient();
    const [state, setState] = useState<ConnectState>({ phase: "idle" });
    const cancelledRef = useRef(false);

    const poll = useCallback(
        async (deviceCode: string, intervalMs: number, deadline: number) => {
            while (!cancelledRef.current && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
                if (cancelledRef.current) return;

                const [error, result] = await attemptPromise(() => grokOAuthApi.pollDeviceToken(deviceCode));
                if (error) {
                    logger.error("[useGrokOAuthConnect] Poll failed", error);
                    continue;
                }

                if (result.status === "complete") {
                    queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
                    await aiService.initialize();
                    await aiService.getAvailableModels("grok-oauth", true);
                    queryClient.invalidateQueries({ queryKey: aiSettingsKeys.models() });
                    setState({ phase: "idle" });
                    toast.success("Connected to xAI");
                    return;
                }

                if (result.status === "slow_down") intervalMs += 5000;
                if (result.status === "error") {
                    setState({ phase: "error", message: result.error });
                    toast.error(`xAI connection failed: ${result.error}`);
                    return;
                }
            }

            if (!cancelledRef.current) {
                setState({ phase: "error", message: "Code expired" });
                toast.error("xAI device code expired — try connecting again");
            }
        },
        [queryClient]
    );

    const connect = useCallback(async () => {
        cancelledRef.current = false;
        const [error, auth] = await attemptPromise(() => grokOAuthApi.startDeviceFlow());

        if (error || !auth) {
            logger.error("[useGrokOAuthConnect] Failed to start device flow", error);
            setState({ phase: "error", message: "Could not start xAI login" });
            toast.error("Could not start xAI login");
            return;
        }

        // Deliberately not auto-opening a new tab here: window.open() after an await falls
        // outside the click's "user gesture" window in most browsers and gets silently popup-
        // blocked. The UI shows the link as a real button instead, which is always reliable.
        setState({
            phase: "connecting",
            userCode: auth.userCode,
            verificationUriComplete: auth.verificationUriComplete
        });

        poll(auth.deviceCode, auth.interval * 1000, Date.now() + auth.expiresIn * 1000);
    }, [poll]);

    const cancel = useCallback(() => {
        cancelledRef.current = true;
        setState({ phase: "idle" });
    }, []);

    return { state, connect, cancel };
};
