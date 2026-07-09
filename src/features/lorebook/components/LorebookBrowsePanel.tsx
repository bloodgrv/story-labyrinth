import { Download, Loader2, Plus, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LorebookEntry } from "@/types/story";
import { CATEGORIES, type LorebookCategory } from "./form";
import { LorebookEntryList } from "./LorebookEntryList";

interface LorebookBrowsePanelProps {
    seriesId?: string;
    selectedCategory: LorebookCategory;
    onCategoryChange: (category: LorebookCategory) => void;
    categoryCounts: Record<LorebookCategory, number>;
    entriesByCategory: LorebookEntry[];
    isLoading: boolean;
    onExport: () => void;
    onImport: (event: ChangeEvent<HTMLInputElement>) => void;
    isImportingDocument: boolean;
    onOpenEntry: (entry: LorebookEntry) => void;
    onNewEntry: () => void;
}

// The default "Browse" tab's content — header, export/import controls, category selector, and
// the card grid. Extracted out of LorebookPage.tsx to keep that file under the project's
// max-lines limit once the open-tabs strip and document-import wiring were added.
export function LorebookBrowsePanel({
    seriesId,
    selectedCategory,
    onCategoryChange,
    categoryCounts,
    entriesByCategory,
    isLoading,
    onExport,
    onImport,
    isImportingDocument,
    onOpenEntry,
    onNewEntry
}: LorebookBrowsePanelProps) {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Header - horizontal with buttons alongside title */}
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-3xl font-bold">{seriesId ? "Series Lorebook" : "Story Lorebook"}</h1>
                    <p className="text-muted-foreground mt-1 text-xs sm:text-base truncate">
                        {seriesId ? "Shared across series" : "Story, global & series entries"}
                    </p>
                </div>
                <div className="flex gap-1 sm:gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onExport}
                        className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                        title="Export"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline ml-2">Export</span>
                    </Button>
                    <label
                        htmlFor="import-lorebook"
                        aria-label="Import lorebook entries — JSON, PDF, DOCX, or Markdown"
                        onClick={e => {
                            if (isImportingDocument) e.preventDefault();
                        }}
                    >
                        <Button
                            variant="outline"
                            size="icon"
                            asChild
                            disabled={isImportingDocument}
                            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                        >
                            <div title="Import (JSON, PDF, DOCX, or Markdown)">
                                {isImportingDocument ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                                <span className="hidden sm:inline ml-2">{isImportingDocument ? "Analyzing..." : "Import"}</span>
                            </div>
                        </Button>
                    </label>
                    <input
                        id="import-lorebook"
                        type="file"
                        accept=".json,.pdf,.docx,.md,.txt"
                        className="hidden"
                        disabled={isImportingDocument}
                        onChange={onImport}
                    />
                    <Button size="icon" className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3" onClick={onNewEntry} title="New Entry">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline ml-2">New Entry</span>
                    </Button>
                </div>
            </div>

            <Separator className="bg-gray-300 dark:bg-gray-700" />

            {/* Mobile: dropdown selector */}
            <div className="sm:hidden">
                <Select value={selectedCategory} onValueChange={v => onCategoryChange(v as LorebookCategory)}>
                    <SelectTrigger className="w-full">
                        <SelectValue>
                            {selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} (
                            {categoryCounts[selectedCategory] || 0})
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>
                                {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat] || 0})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Desktop: tabs */}
            <Tabs
                value={selectedCategory}
                onValueChange={v => onCategoryChange(v as LorebookCategory)}
                className="w-full hidden sm:block"
            >
                <TabsList className="w-full justify-start bg-gray-100 dark:bg-gray-800 p-1 border border-gray-300 dark:border-gray-700">
                    {CATEGORIES.map(cat => (
                        <TabsTrigger
                            key={cat}
                            value={cat}
                            className="text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                        >
                            {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat] || 0})
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Entry list - shared between mobile and desktop */}
            <div className="mt-4 sm:mt-6">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                ) : entriesByCategory.length > 0 ? (
                    <LorebookEntryList entries={entriesByCategory} editable={true} showLevel={true} onOpenEntry={onOpenEntry} />
                ) : (
                    <div className="text-center text-muted-foreground py-12">No {selectedCategory} entries yet</div>
                )}
            </div>
        </div>
    );
}
