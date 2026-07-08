import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOCUS_THEMES, type FocusThemeId } from "@/types/focusSession";

interface FocusThemeSwitcherProps {
    value: FocusThemeId;
    onChange: (theme: FocusThemeId) => void;
    triggerClassName?: string;
}

// Shared by the Start Session dialog and the in-session HUD's quick-switcher, so picking a
// theme always offers the same four options in the same order.
export function FocusThemeSwitcher({ value, onChange, triggerClassName }: FocusThemeSwitcherProps) {
    return (
        <Select value={value} onValueChange={next => onChange(next as FocusThemeId)}>
            <SelectTrigger className={triggerClassName}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {FOCUS_THEMES.map(theme => (
                    <SelectItem key={theme.id} value={theme.id}>
                        {theme.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
