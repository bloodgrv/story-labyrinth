import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRef } from "react";
import { type Control, useWatch } from "react-hook-form";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { lorebookApi } from "@/services/api/client";
import type { CreateEntryForm, LorebookCategory } from "./entryFormUtils";
import { LoreSheetReworkButton } from "./LoreSheetReworkButton";
import { appendMissingSections, appendSection, getSheetTemplate, parseSheetHeadings } from "./sheetTemplates";

interface LoreSheetEditorProps {
    control: Control<CreateEntryForm>;
    category: LorebookCategory;
    // T9 — only needed for the "Rework in chat" sub-span trigger below (anchors to this entry's WB
    // chat, same reasoning as RawEntryFields' description-field button). Undefined for a brand-new
    // unsaved entry, which just disables the button.
    entryId?: string;
    storyId?: string;
}

// Sheet-first primary editing surface (T5 FS1, docs/Lore_Sheet_And_Sync_Design.md §7b) — markdown
// `sheetBody` + a sticky per-category section outline + "Insert template". This is the SoT
// artifact; structured Codex/description fields stay a derived projection produced by the
// separate Sync loop (FS3+, not built yet) — this component never writes anywhere but sheetBody.
export function LoreSheetEditor({ control, category, entryId, storyId }: LoreSheetEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const sheetBody = useWatch({ control, name: "sheetBody" }) ?? "";
    const name = useWatch({ control, name: "name" });
    const template = getSheetTemplate(category);
    const headings = parseSheetHeadings(sheetBody);
    const present = new Set(headings.map(h => h.heading.toLowerCase()));

    // Optional "Improve sheet with AI" tidy pass (FS2, §9b) — one-shot, stateless, no
    // propose/accept gate (the sheet is already a freely user-editable field; this just fills a
    // suggestion into it). Applies client-side only via the render prop's field.onChange below —
    // the user still has to hit Update to persist anything.
    const improveMutation = useMutation({ mutationFn: () => lorebookApi.improveSheet({ sheetBody, category, name: name || "this entry" }) });

    // T5 FS8 template polish — replaces the old proportional-scrollTop approximation (flagged in
    // FS1's own comment as "exact positioning is FS8 polish territory") with the standard
    // mirror-div technique: a hidden off-screen div styled identically to the textarea (same
    // font/width/padding, so it wraps text exactly the same way) renders the sheet's text up to
    // the target heading, and a marker span's `offsetTop` gives the real pixel position — accurate
    // even with long wrapped lines, which the old per-`\n`-line proportional math wasn't.
    const measureOffsetTop = (el: HTMLTextAreaElement, index: number): number => {
        const style = window.getComputedStyle(el);
        const mirror = document.createElement("div");
        const mirroredProps: Array<keyof CSSStyleDeclaration> = [
            "boxSizing",
            "width",
            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",
            "borderTopWidth",
            "borderRightWidth",
            "borderBottomWidth",
            "borderLeftWidth",
            "fontFamily",
            "fontSize",
            "fontWeight",
            "lineHeight",
            "letterSpacing",
            "tabSize"
        ];
        for (const prop of mirroredProps) (mirror.style as unknown as Record<string, string>)[prop as string] = style[prop] as string;
        mirror.style.position = "absolute";
        mirror.style.visibility = "hidden";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.wordWrap = "break-word";
        mirror.style.top = "0";
        mirror.style.left = "-9999px";
        mirror.style.height = "auto";

        mirror.textContent = el.value.slice(0, index);
        const marker = document.createElement("span");
        marker.textContent = "​";
        mirror.appendChild(marker);

        document.body.appendChild(mirror);
        const offsetTop = marker.offsetTop;
        document.body.removeChild(mirror);
        return offsetTop;
    };

    const scrollToHeading = (heading: string) => {
        const target = headings.find(h => h.heading.toLowerCase() === heading.toLowerCase());
        const el = textareaRef.current;
        if (!target || !el) return;
        el.focus();
        el.setSelectionRange(target.index, target.index + target.heading.length + 3);
        const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 20;
        el.scrollTop = Math.max(0, measureOffsetTop(el, target.index) - lineHeight);
    };

    return (
        <FormField
            control={control}
            name="sheetBody"
            render={({ field }) => (
                <FormItem>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-muted-foreground">Lore Sheet</span>
                        <div className="flex gap-2">
                            <LoreSheetReworkButton entryId={entryId} storyId={storyId} textareaRef={textareaRef} />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!field.value?.trim() || improveMutation.isPending}
                                onClick={async () => {
                                    try {
                                        const result = await improveMutation.mutateAsync();
                                        if (result.success && result.sheetBody) {
                                            field.onChange(result.sheetBody);
                                            toast.success("Sheet improved — review before saving.");
                                        } else {
                                            toast.error(result.message || "Couldn't improve the sheet");
                                        }
                                    } catch (error) {
                                        toast.error(error instanceof Error ? error.message : "Couldn't improve the sheet");
                                    }
                                }}
                            >
                                <Sparkles className="h-3.5 w-3.5 mr-1" />
                                {improveMutation.isPending ? "Improving..." : "Improve with AI"}
                            </Button>
                            {template.length > 0 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => field.onChange(appendMissingSections(field.value ?? "", category))}
                                >
                                    Insert template
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {template.length > 0 && (
                            <div className="w-40 shrink-0 border-r pr-3 space-y-1 max-h-[420px] overflow-y-auto">
                                {template.map(section => {
                                    const has = present.has(section.heading.toLowerCase());
                                    return (
                                        <button
                                            key={section.heading}
                                            type="button"
                                            onClick={() =>
                                                has
                                                    ? scrollToHeading(section.heading)
                                                    : field.onChange(appendSection(field.value ?? "", section.heading))
                                            }
                                            className={cn(
                                                "block w-full text-left text-xs px-2 py-1 rounded truncate",
                                                has
                                                    ? "text-foreground hover:bg-muted"
                                                    : "text-muted-foreground/50 hover:text-muted-foreground italic"
                                            )}
                                            title={has ? section.heading : `Add "${section.heading}" section`}
                                        >
                                            {has ? section.heading : `+ ${section.heading}`}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <FormControl>
                            <Textarea
                                {...field}
                                ref={el => {
                                    field.ref(el);
                                    textareaRef.current = el;
                                }}
                                placeholder={
                                    template.length > 0
                                        ? `Write this entry's Lore Sheet — "Insert template" adds the ${category} section skeleton.`
                                        : "Write freeform notes for this entry..."
                                }
                                rows={16}
                                className="flex-1 min-h-[320px] font-mono text-sm resize-y"
                            />
                        </FormControl>
                    </div>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
