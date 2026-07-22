import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import type { LexicalEditor } from "lexical";
import { ChevronDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { INSERT_PAGE_BREAK } from "../PageBreakPlugin";

interface InsertDropdownProps {
    activeEditor: LexicalEditor;
    disabled: boolean;
}

export const InsertDropdown = ({ activeEditor, disabled }: InsertDropdownProps) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="h-8 gap-1 font-normal hover:bg-accent/50 transition-colors"
            >
                Insert
                <ChevronDown className="h-4 w-4" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuItem
                className="hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => activeEditor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
            >
                <div className="flex items-center gap-2">
                    <Minus className="h-4 w-4" />
                    <span className="text">Horizontal Rule</span>
                </div>
            </DropdownMenuItem>
            <DropdownMenuItem
                className="hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => activeEditor.dispatchCommand(INSERT_PAGE_BREAK, undefined)}
            >
                <div className="flex items-center gap-2">
                    <i className="icon page-break" />
                    <span className="text">Page Break</span>
                </div>
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
);
