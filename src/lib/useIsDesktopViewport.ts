import { useEffect, useState } from "react";

// Matches Tailwind's default `md` breakpoint. Used to conditionally mount desktop-only layout
// (e.g. resizable chat rails) rather than hiding them via CSS, which fights react-resizable-panels'
// own layout calculations.
const DESKTOP_QUERY = "(min-width: 768px)";

export const useIsDesktopViewport = (): boolean => {
    const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);

    useEffect(() => {
        const mql = window.matchMedia(DESKTOP_QUERY);
        const handleChange = () => setIsDesktop(mql.matches);
        mql.addEventListener("change", handleChange);
        return () => mql.removeEventListener("change", handleChange);
    }, []);

    return isDesktop;
};
