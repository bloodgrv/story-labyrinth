import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
    NodeContextMenuOption,
    NodeContextMenuPlugin,
    NodeContextMenuSeparator
} from "@lexical/react/LexicalNodeContextMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isDecoratorNode, $isNodeSelection, $isRangeSelection, COPY_COMMAND, CUT_COMMAND, PASTE_COMMAND } from "lexical";
import type { JSX } from "react";
import { useMemo } from "react";

export default function ContextMenuPlugin(): JSX.Element {
    const [editor] = useLexicalComposerContext();

    const items = useMemo(
        () => [
            new NodeContextMenuOption(`Remove Link`, {
                $onSelect: () => {
                    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
                },
                $showOn: node => $isLinkNode(node.getParent())
            }),
            new NodeContextMenuSeparator({
                $showOn: node => $isLinkNode(node.getParent())
            }),
            new NodeContextMenuOption(`Copy`, {
                $onSelect: () => {
                    editor.dispatchCommand(COPY_COMMAND, null);
                }
            }),
            new NodeContextMenuOption(`Cut`, {
                $onSelect: () => {
                    editor.dispatchCommand(CUT_COMMAND, null);
                }
            }),
            new NodeContextMenuOption(`Paste`, {
                $onSelect: () => {
                    navigator.clipboard.read().then(async () => {
                        const data = new DataTransfer();

                        const items = await navigator.clipboard.read();
                        const item = items[0];

                        const permission = await navigator.permissions.query({
                            // @ts-expect-error These types are incorrect.
                            name: "clipboard-read"
                        });
                        if (permission.state === "denied") {
                            alert("Not allowed to paste from clipboard.");
                            return;
                        }

                        for (const type of item.types) {
                            const dataString = await (await item.getType(type)).text();
                            data.setData(type, dataString);
                        }

                        const event = new ClipboardEvent("paste", {
                            clipboardData: data
                        });

                        editor.dispatchCommand(PASTE_COMMAND, event);
                    });
                }
            }),
            new NodeContextMenuOption(`Paste as Plain Text`, {
                $onSelect: () => {
                    navigator.clipboard.read().then(async () => {
                        const permission = await navigator.permissions.query({
                            // @ts-expect-error These types are incorrect.
                            name: "clipboard-read"
                        });

                        if (permission.state === "denied") {
                            alert("Not allowed to paste from clipboard.");
                            return;
                        }

                        const data = new DataTransfer();
                        const items = await navigator.clipboard.readText();
                        data.setData("text/plain", items);

                        const event = new ClipboardEvent("paste", {
                            clipboardData: data
                        });
                        editor.dispatchCommand(PASTE_COMMAND, event);
                    });
                }
            }),
            new NodeContextMenuOption(`Delete Node`, {
                $onSelect: () => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                        const currentNode = selection.anchor.getNode();
                        const parents = currentNode.getParents();
                        const ancestorNodeWithRootAsParent = parents[parents.length - 2];

                        ancestorNodeWithRootAsParent?.remove();
                    } else if ($isNodeSelection(selection)) {
                        const selectedNodes = selection.getNodes();
                        selectedNodes.forEach(node => {
                            if ($isDecoratorNode(node))
                                node.remove();

                        });
                    }
                }
            })
        ],
        [editor]
    );

    return (
        <NodeContextMenuPlugin
            className="lexical-context-menu"
            itemClassName="lexical-context-menu-item"
            separatorClassName="lexical-context-menu-separator"
            items={items}
        />
    );
}
