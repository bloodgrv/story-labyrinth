// No existing precedent in this codebase for category -> color; LorebookEntryList.tsx groups by
// category with plain text/badges, no color coding. Chosen here purely to make the graph
// scannable at a glance.
const CATEGORY_COLORS: Record<string, string> = {
    character: "#f97316",
    location: "#22c55e",
    item: "#eab308",
    event: "#ef4444",
    note: "#6b7280",
    synopsis: "#8b5cf6",
    "starting scenario": "#06b6d4",
    timeline: "#ec4899"
};

export const categoryColor = (category: string): string => CATEGORY_COLORS[category] ?? "#6b7280";
