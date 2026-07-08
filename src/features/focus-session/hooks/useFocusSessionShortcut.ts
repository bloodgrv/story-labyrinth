import { useHotkeys } from "react-hotkeys-hook";
import { useFocusSession } from "@/features/focus-session/context/FocusSessionContext";

// Same enableOnContentEditable/enableOnFormTags requirement Editor MultiView's shortcuts
// discovered (react-hotkeys-hook otherwise ignores keydowns from the Lexical contenteditable,
// which is focused the entire time someone is actually writing).
const HOTKEY_OPTIONS = { enableOnContentEditable: true, enableOnFormTags: true };

// mod+alt+f ("f" for focus) toggles a Deep Writing Session using the last-used config — the same
// mod+alt+<letter> key space Editor MultiView's shortcuts use (chosen there because most
// mod+<key> combos are already taken elsewhere in the app); "f" was free.
export function useFocusSessionShortcut(chapterId: string | null): void {
    const { isActive, config, startSession, endSession } = useFocusSession();

    useHotkeys(
        "mod+alt+f",
        event => {
            event.preventDefault();
            if (isActive) endSession();
            else startSession(config, chapterId);
        },
        HOTKEY_OPTIONS,
        [isActive, config, chapterId, startSession, endSession]
    );
}
