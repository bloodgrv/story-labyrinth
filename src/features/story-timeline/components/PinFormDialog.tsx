import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PinLinkType, PinManuscriptStatus, PinWhenKind, TimelinePin } from "@/types/storyTimeline";

export interface PinFormValues {
    title: string;
    blurb: string;
    whenKind: PinWhenKind;
    relativeOffsetYears: string;
    fuzzyPhrase: string;
    civilDate: string;
    manuscriptStatus: PinManuscriptStatus;
}

const emptyValues: PinFormValues = {
    title: "",
    blurb: "",
    whenKind: "fuzzy",
    relativeOffsetYears: "",
    fuzzyPhrase: "",
    civilDate: "",
    manuscriptStatus: "planned"
};

const pinToValues = (pin: TimelinePin): PinFormValues => ({
    title: pin.title,
    blurb: pin.blurb ?? "",
    whenKind: pin.whenKind,
    relativeOffsetYears: pin.relativeOffsetYears != null ? String(pin.relativeOffsetYears) : "",
    fuzzyPhrase: pin.fuzzyPhrase ?? "",
    civilDate: pin.civilDate ?? "",
    manuscriptStatus: pin.manuscriptStatus
});

const linkLabel: Record<PinLinkType, string> = { chapter: "Chapter", lorebook: "Lorebook entry", note: "Note" };

interface PinFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // Editing an existing pin vs. native board-first create. When placing from a source (Place on
    // timeline), pass initialTitle/link — the link is fixed by the caller, not editable here.
    pin?: TimelinePin | null;
    initialTitle?: string;
    link?: { linkType: PinLinkType; linkId: string } | null;
    onSubmit: (values: {
        title: string;
        blurb: string | null;
        whenKind: PinWhenKind;
        relativeOffsetYears: number | null;
        fuzzyPhrase: string | null;
        civilDate: string | null;
        manuscriptStatus: PinManuscriptStatus;
    }) => void;
    isSubmitting?: boolean;
}

// Story Timeline (T6, TL1/TL2) — create/edit pin: title, blurb, when-kind selector (relative/
// fuzzy/civil) + kind-specific fields. Plain useState form, same convention NewMapDialog.tsx uses
// (this app doesn't reach for react-hook-form on small dialogs).
export function PinFormDialog({ open, onOpenChange, pin, initialTitle, link, onSubmit, isSubmitting }: PinFormDialogProps) {
    const [values, setValues] = useState<PinFormValues>(emptyValues);

    useEffect(() => {
        if (!open) return;
        if (pin) setValues(pinToValues(pin));
        // A brand-new pin linked to a chapter is the one case the UI genuinely knows better than
        // the general "planned" default — it's being placed on content that already exists.
        else setValues({ ...emptyValues, title: initialTitle ?? "", manuscriptStatus: link?.linkType === "chapter" ? "written" : "planned" });
    }, [open, pin, initialTitle, link?.linkType]);

    const handleSubmit = () => {
        if (!values.title.trim()) return;
        onSubmit({
            title: values.title.trim(),
            blurb: values.blurb.trim() || null,
            whenKind: values.whenKind,
            relativeOffsetYears: values.whenKind === "relative" && values.relativeOffsetYears !== "" ? Number(values.relativeOffsetYears) : null,
            fuzzyPhrase: values.whenKind === "fuzzy" ? values.fuzzyPhrase.trim() || null : null,
            civilDate: values.whenKind === "civil" ? values.civilDate.trim() || null : null,
            manuscriptStatus: values.manuscriptStatus
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{pin ? "Edit timeline pin" : "New timeline pin"}</DialogTitle>
                </DialogHeader>

                {link && (
                    <p className="text-xs text-muted-foreground -mt-2">
                        Linked to this {linkLabel[link.linkType].toLowerCase()}
                    </p>
                )}

                <div className="space-y-2">
                    <Label htmlFor="pin-title">Title</Label>
                    <Input
                        id="pin-title"
                        value={values.title}
                        onChange={e => setValues(v => ({ ...v, title: e.target.value }))}
                        placeholder="e.g. Mission Nightingale"
                        autoFocus
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="pin-blurb">Blurb (optional)</Label>
                    <Textarea
                        id="pin-blurb"
                        value={values.blurb}
                        onChange={e => setValues(v => ({ ...v, blurb: e.target.value }))}
                        rows={2}
                        placeholder="Short note — full detail lives in the linked source"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Manuscript status</Label>
                    <Select
                        value={values.manuscriptStatus}
                        onValueChange={(value: PinManuscriptStatus) => setValues(v => ({ ...v, manuscriptStatus: value }))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="planned">Planned — not written yet</SelectItem>
                            <SelectItem value="written">Written — already in the manuscript</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>When</Label>
                    <Select value={values.whenKind} onValueChange={(value: PinWhenKind) => setValues(v => ({ ...v, whenKind: value }))}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="relative">Relative to Story-start</SelectItem>
                            <SelectItem value="fuzzy">Fuzzy phrase</SelectItem>
                            <SelectItem value="civil">Civil date</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {values.whenKind === "relative" && (
                    <div className="space-y-2">
                        <Label htmlFor="pin-relative">Years from Story-start</Label>
                        <Input
                            id="pin-relative"
                            type="number"
                            step="0.5"
                            value={values.relativeOffsetYears}
                            onChange={e => setValues(v => ({ ...v, relativeOffsetYears: e.target.value }))}
                            placeholder="Negative = before, positive = after, e.g. -6"
                        />
                    </div>
                )}
                {values.whenKind === "fuzzy" && (
                    <div className="space-y-2">
                        <Label htmlFor="pin-fuzzy">Fuzzy phrase</Label>
                        <Input
                            id="pin-fuzzy"
                            value={values.fuzzyPhrase}
                            onChange={e => setValues(v => ({ ...v, fuzzyPhrase: e.target.value }))}
                            placeholder="e.g. that winter, her childhood"
                        />
                        <p className="text-xs text-muted-foreground">
                            Sorted by drag order among other fuzzy pins — no exact position required.
                        </p>
                    </div>
                )}
                {values.whenKind === "civil" && (
                    <div className="space-y-2">
                        <Label htmlFor="pin-civil">Civil date</Label>
                        <Input
                            id="pin-civil"
                            value={values.civilDate}
                            onChange={e => setValues(v => ({ ...v, civilDate: e.target.value }))}
                            placeholder="e.g. 1890 or 2019-03-14"
                        />
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!values.title.trim() || isSubmitting}>
                        {pin ? "Save" : "Add pin"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
