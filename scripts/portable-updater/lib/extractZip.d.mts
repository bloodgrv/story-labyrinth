// Type contract for extractZip.mjs. The updater tree is deliberately plain, dependency-free
// JavaScript that the server never imports at runtime — this exists purely so the vitest suite
// (server/test/portableExtractZip.test.ts) can import it under the server's tsc project, which
// runs with allowJs: false.

export interface ExtractZipOptions {
    onProgress?: (done: number, total: number) => void;
}

export interface ExtractZipResult {
    files: number;
    directories: number;
}

export function extractZipTo(zipPath: string, destDir: string, options?: ExtractZipOptions): ExtractZipResult;
