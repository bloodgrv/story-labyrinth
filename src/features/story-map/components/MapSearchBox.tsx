import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { StoryMapNode } from "@/types/storyMap";

interface MapSearchBoxProps {
    nodes: StoryMapNode[];
    onSelect: (nodeId: string) => void;
}

export function MapSearchBox({ nodes, onSelect }: MapSearchBoxProps) {
    const [term, setTerm] = useState("");
    const [focused, setFocused] = useState(false);

    const matches = useMemo(() => {
        const t = term.trim().toLowerCase();
        if (!t) return [];
        return nodes.filter(n => n.name.toLowerCase().includes(t)).slice(0, 8);
    }, [nodes, term]);

    const handleSelect = (id: string) => {
        onSelect(id);
        setTerm("");
        setFocused(false);
    };

    return (
        <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
                value={term}
                onChange={e => setTerm(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                placeholder="Find a location..."
                className="h-8 pl-8 text-sm"
            />
            {focused && matches.length > 0 && (
                <div className="absolute top-full mt-1 w-full rounded border bg-background shadow-lg z-20 overflow-hidden">
                    {matches.map(n => (
                        <button
                            key={n.id}
                            type="button"
                            className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-muted truncate"
                            onClick={() => handleSelect(n.id)}
                        >
                            {n.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
