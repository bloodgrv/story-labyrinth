import { $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";

// Inserts accepted prose-proposal text as a new paragraph — at the current cursor position if
// the editor has a live selection (mirroring Scene Beat's insertTextAfterNode, generalized from
// "after a specific node" to "after the selection's top-level block"), otherwise appended to the
// end of the document. See lexicalEditorUtils.ts for the Scene Beat precedent this extends.
export const insertProposedProse = (editor: LexicalEditor, text: string): void => {
    editor.update(() => {
        const paragraphNode = $createParagraphNode();
        paragraphNode.append($createTextNode(text));

        const selection = $getSelection();
        const anchorElement = $isRangeSelection(selection) ? selection.anchor.getNode().getTopLevelElement() : null;

        if (anchorElement) anchorElement.insertAfter(paragraphNode);
        else $getRoot().append(paragraphNode);

        paragraphNode.selectEnd();
    });
};
