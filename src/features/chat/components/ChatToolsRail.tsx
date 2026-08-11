import { ChevronLeft, ChevronRight, type LucideIcon, MessagesSquare } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

// One entry in the rail's icon column that opens a modal drawer (Approvals/Context/Playbook —
// Axis 3 of docs/Chat_Chrome_Declutter_Design.md). The "Chats" bucket (Axis 2) is deliberately
// NOT one of these — it's handled by the separate chats* props below, mirroring
// EditorToolsPanel.tsx's own split between its mapped sidebarButtons (modal SimpleDrawer) and its
// hand-written, non-modal "Chats" button.
export interface ChatToolsRailPanel {
    id: string;
    icon: LucideIcon;
    label: string;
    title: string;
    description?: ReactNode;
    // Rendered inside this panel's drawer body while it's the open one.
    content: ReactNode;
    // Small chip/count rendered on the closed rail icon — pending-count badge for Approvals,
    // armed-summary chip for Context (Axis 4). Absent for panels with nothing to summarize.
    badge?: ReactNode;
    // Icon-only-mode substitute for `badge` (would overflow the collapsed w-8 button otherwise).
    // Falls back to a plain dot indicator when `badge` is set but this isn't — fine for a
    // non-numeric "armed" chip (Context), but a real pending *count* (Approvals) should supply
    // its own compact numeral here rather than degrade to a content-free dot.
    compactBadge?: ReactNode;
}

interface ChatToolsRailProps {
    // Single-open-panel state (Axis 3: exactly one modal panel open at a time) — lifted to the
    // host rather than owned here, so a host can close its own panel on e.g. chat switch without
    // reaching into this component's internals. All optional (defaulting to "no panels") since a
    // host that hasn't been migrated past the Chats bucket yet (e.g. CR1's Notes) has nothing to
    // pass here — CR2+ is what actually populates these per host.
    openPanelId?: string | null;
    onTogglePanel?: (id: string) => void;
    onClosePanel?: () => void;
    panels?: ChatToolsRailPanel[];
    // The non-modal "Chats" bucket (Axis 2) — a sibling docked column, not a drawer. Kept
    // structurally separate from `panels` for the same reason EditorToolsPanel.tsx's own Chats
    // button isn't part of its mapped sidebarButtons array.
    chatsOpen: boolean;
    onToggleChats: () => void;
    chatsBadge?: ReactNode;
    // Icon-only vs icon+label width toggle, independent of panel-open state — mirrors
    // EditorToolsPanel's own collapsed/onToggleCollapsed. Optional since not every host needs a
    // second collapse axis on top of the panel/Chats state.
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    // Research's Story|Global tabs, Outline's import button — content that doesn't fit the
    // four-bucket rail (Axis 5a / CR6). Rendered above the icon column when present.
    hostExtras?: ReactNode;
}

// Shared icon-rail + single-open-modal-drawer shell for the five non-Editor chat hosts
// (World-Building, Outline, Notes, Research, Brainstorm) — generalizes EditorToolsPanel.tsx's own
// two-mechanism pattern (icon rail + SimpleDrawer, plus one non-modal Chats toggle) so each host
// stops hand-rolling its own always-visible chrome. See docs/Chat_Chrome_Declutter_Design.md
// (T10) — this is CR0: the shell is built and typed here but not yet imported by any host. CR1+
// wires it in one host at a time (rollout order per Axis 6: Notes -> Outline -> Brainstorm ->
// Research -> WB), which is the point this component actually becomes visible/behavior-changing.
export function ChatToolsRail({
    openPanelId = null,
    onTogglePanel = () => {},
    onClosePanel = () => {},
    panels = [],
    chatsOpen,
    onToggleChats,
    chatsBadge,
    collapsed = false,
    onToggleCollapsed,
    hostExtras
}: ChatToolsRailProps) {
    const openPanel = panels.find(panel => panel.id === openPanelId) ?? null;

    return (
        <>
            <aside className={cn("hidden md:flex flex-col border-l bg-muted/20 transition-all duration-200", collapsed ? "w-12" : "w-36")}>
                {hostExtras && <div className="p-2 border-b">{hostExtras}</div>}

                <div className="flex-1 py-2 space-y-2">
                    <Button
                        variant={chatsOpen ? "default" : "outline"}
                        size="sm"
                        className={cn("mx-2 relative", collapsed ? "justify-center px-0 w-8" : "justify-start")}
                        onClick={onToggleChats}
                        title={chatsOpen ? "Hide Chats" : "Show Chats"}
                    >
                        <MessagesSquare className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="ml-2">Chats</span>}
                        {/* Icon-only mode has no room for a full badge (would overflow the w-8
                            button) — collapse it to a small dot indicator instead, same signal. */}
                        {collapsed
                            ? chatsBadge && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary" />
                            : chatsBadge}
                    </Button>

                    {panels.map(({ id, icon: Icon, label, title, badge, compactBadge }) => (
                        <Button
                            key={id}
                            variant={openPanelId === id ? "default" : "outline"}
                            size="sm"
                            className={cn("mx-2 relative", collapsed ? "justify-center px-0 w-8" : "justify-start")}
                            onClick={() => onTogglePanel(id)}
                            title={title}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span className="ml-2">{label}</span>}
                            {collapsed
                                ? (compactBadge ?? (badge && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary" />))
                                : badge}
                        </Button>
                    ))}
                </div>

                {onToggleCollapsed && (
                    <div className="p-2 border-t">
                        <Button variant="ghost" size="icon" className="w-full" onClick={onToggleCollapsed} title={collapsed ? "Expand rail" : "Collapse rail"}>
                            {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </div>
                )}
            </aside>

            {openPanel && (
                <Drawer open onOpenChange={open => !open && onClosePanel()}>
                    <DrawerContent className="max-h-[80vh]">
                        <DrawerHeader>
                            <DrawerTitle>{openPanel.title}</DrawerTitle>
                            {openPanel.description && <DrawerDescription>{openPanel.description}</DrawerDescription>}
                        </DrawerHeader>
                        <div className="px-4 overflow-y-auto max-h-[60vh]">{openPanel.content}</div>
                        <DrawerFooter>
                            <DrawerClose asChild>
                                <Button variant="outline">Close</Button>
                            </DrawerClose>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>
            )}
        </>
    );
}
