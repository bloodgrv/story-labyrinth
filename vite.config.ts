import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import rehypeSlug from "rehype-slug";
import remarkAlert from "remark-github-blockquote-alert";
import remarkGfm from "remark-gfm";
import { defineConfig, type Plugin } from "vite";

// @mdx-js/rollup's own transform hook strips any query string and matches purely on the `.mdx`
// extension (see node_modules/@mdx-js/rollup/lib/index.js: `id.split('?')[0]`), so a plain
// `import x from "./foo.mdx?raw"` still gets compiled as MDX instead of honoring Vite's `?raw`
// convention — guideSearchIndex.ts needs the literal source text, not the compiled component.
// This plugin's resolveId runs first and points `?raw` mdx imports at a virtual module id ending
// in `.js` (not `.mdx`), so @mdx-js/rollup's own extname check skips it entirely; load() then
// reads the real file and exports its text as a plain string.
function guideMdxRawPlugin(): Plugin {
    const virtualPrefix = "\0guide-mdx-raw:";
    return {
        name: "guide-mdx-raw",
        enforce: "pre",
        resolveId(source, importer) {
            if (!importer || !source.endsWith(".mdx?raw")) return null;
            const withoutQuery = source.slice(0, -"?raw".length);
            const absPath = path.resolve(path.dirname(importer), withoutQuery);
            return `${virtualPrefix}${absPath}.js`;
        },
        load(id) {
            if (!id.startsWith(virtualPrefix)) return null;
            const absPath = id.slice(virtualPrefix.length, -".js".length);
            const source = fs.readFileSync(absPath, "utf-8");
            return `export default ${JSON.stringify(source)};`;
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
    plugins: [
        guideMdxRawPlugin(),
        // rehypeSlug gives every heading a GitHub-style id (e.g. #working-with-series) so
        // GuideSearch can scrollIntoView the exact matched section.
        { enforce: "pre", ...mdx({ remarkPlugins: [remarkGfm, remarkAlert], rehypePlugins: [rehypeSlug] }) },
        react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ })
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@lexical-playground": path.resolve(__dirname, "src/Lexical/lexical-playground/src"),
            shared: path.resolve(__dirname, "src/Lexical/shared/src")
        }
    },
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:3001",
                changeOrigin: true
            },
            // M4 (docs/MCP_Tool_Connections_Design.md §4.1) — the /mcp protocol endpoint is a new
            // top-level mount (not under /api, see server/index.ts), so it needs its own proxy
            // entry too, or McpServerExposeCard.tsx's displayed endpoint URL (window.location.origin
            // + "/mcp") would be correct in production (single Express origin) but unreachable from
            // the Vite dev origin.
            "/mcp": {
                target: "http://localhost:3001",
                changeOrigin: true
            }
        },
        host: true
    },
    build: {
        outDir: "dist/client",
        rollupOptions: {
            output: {
                manualChunks: {
                    // Split large markdown rendering dependencies
                    "react-markdown": ["react-markdown", "remark-gfm", "rehype-raw", "rehype-sanitize"],
                    // Story Graph's canvas/pan/zoom/drag-to-connect — isolated so non-graph-tool users never load it
                    "story-graph": ["@xyflow/react"]
                }
            }
        }
    }
}));
