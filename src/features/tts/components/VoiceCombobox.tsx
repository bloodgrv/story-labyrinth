import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TtsVoice } from "@/types/ttsSettings";

interface VoiceComboboxProps {
    voices: TtsVoice[];
    value: string | undefined;
    onValueChange: (value: string | undefined) => void;
    placeholder?: string;
    emptyText?: string;
    noneLabel?: string;
    className?: string;
    id?: string;
}

// Provider-agnostic voice picker — works the same whether `voices` came from Speechify or any
// future provider, since TtsVoice already normalizes the shape (see types/ttsSettings.ts).
export const VoiceCombobox = ({
    voices,
    value,
    onValueChange,
    placeholder = "Select voice",
    emptyText = "No voices found",
    noneLabel = "None",
    className,
    id
}: VoiceComboboxProps) => {
    const [open, setOpen] = useState(false);
    const selectedVoice = voices.find(v => v.id === value);
    const listboxId = id ? `${id}-listbox` : "voice-combobox-listbox";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    className={cn("w-full justify-between font-normal", className)}
                >
                    {selectedVoice ? selectedVoice.name : placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command id={listboxId}>
                    <CommandInput placeholder="Type to filter..." />
                    <CommandList>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="none"
                                onSelect={() => {
                                    onValueChange(undefined);
                                    setOpen(false);
                                }}
                            >
                                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                                {noneLabel}
                            </CommandItem>
                            {voices.map(voice => (
                                <CommandItem
                                    key={voice.id}
                                    value={voice.name}
                                    onSelect={() => {
                                        onValueChange(voice.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn("mr-2 h-4 w-4", value === voice.id ? "opacity-100" : "opacity-0")}
                                    />
                                    {voice.name}
                                    {voice.locale && (
                                        <span className="ml-2 text-xs text-muted-foreground">{voice.locale}</span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
