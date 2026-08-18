import path from "node:path";
import { defineConfig } from "vitest/config";

// Minimal config for the pure-function test slice (B40, docs/CURRENT_BACKLOG.md) — reuses the
// same "@" alias vite.config.ts defines for src/, since none of the targeted tests need any of
// vite.config.ts's other plugins (MDX, React, dev-server proxy). Node environment throughout:
// every current test target is a plain function (string/JSON in, value out), nothing renders.
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src")
        }
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts", "server/**/*.test.ts"]
    }
});
