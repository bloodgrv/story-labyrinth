import { attempt } from "@jfdi/attempt";
import type { McpToolCallProposal } from "@/types/mcpConnection";

// Global (unlike parseShuttleProposal.ts's single-match fence) — MCP M2, docs/
// MCP_Tool_Connections_Design.md §3.5 explicitly allows "multiple fences per reply" (e.g. two
// distinct tool calls proposed in one turn), and matchAll is this directory's existing idiom for
// that shape (extractMarkdownLinks.ts).
const MCP_TOOL_CALL_PROPOSAL_FENCE = /```mcp-tool-call-proposal\s*\n([\s\S]*?)```/g;

const isValidPayload = (value: unknown): value is McpToolCallProposal => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.connectionId === "string" &&
        record.connectionId.trim().length > 0 &&
        typeof record.toolName === "string" &&
        record.toolName.trim().length > 0 &&
        typeof record.reason === "string" &&
        record.reason.trim().length > 0 &&
        (record.args === undefined || (typeof record.args === "object" && record.args !== null && !Array.isArray(record.args)))
    );
};

export const parseMcpToolCallProposal = (content: string): { cleanedContent: string; proposals: McpToolCallProposal[] } => {
    const matches = [...content.matchAll(MCP_TOOL_CALL_PROPOSAL_FENCE)];
    if (matches.length === 0) return { cleanedContent: content, proposals: [] };

    const cleanedContent = content.replace(MCP_TOOL_CALL_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const proposals: McpToolCallProposal[] = [];
    for (const match of matches) {
        const [error, parsed] = attempt(() => JSON.parse(match[1]));
        if (error || !isValidPayload(parsed)) continue;
        proposals.push({ ...parsed, args: parsed.args ?? {} });
    }

    return { cleanedContent, proposals };
};
