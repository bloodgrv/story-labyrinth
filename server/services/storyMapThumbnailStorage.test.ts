import { describe, expect, it } from "vitest";
import { getStoryMapThumbnailPath, isValidStoryMapThumbnailFilename } from "./storyMapThumbnailStorage.js";

describe("isValidStoryMapThumbnailFilename (B22 path jail)", () => {
    it("accepts a real generated filename for every supported extension", () => {
        for (const ext of ["jpg", "png", "webp"])
            expect(isValidStoryMapThumbnailFilename(`3fa85f64-5717-4562-b3fc-2c963f66afa6.${ext}`)).toBe(true);
    });

    it("rejects path traversal attempts", () => {
        expect(isValidStoryMapThumbnailFilename("../../../etc/passwd")).toBe(false);
    });

    it("rejects an extension this module never writes (gif is lorebook-only)", () => {
        expect(isValidStoryMapThumbnailFilename("3fa85f64-5717-4562-b3fc-2c963f66afa6.gif")).toBe(false);
    });

    it("rejects a uuid with no extension", () => {
        expect(isValidStoryMapThumbnailFilename("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(false);
    });
});

describe("getStoryMapThumbnailPath", () => {
    it("throws instead of returning a path for an invalid filename", () => {
        expect(() => getStoryMapThumbnailPath("../../../etc/passwd")).toThrow();
    });

    it("returns a path for a valid filename", () => {
        expect(getStoryMapThumbnailPath("3fa85f64-5717-4562-b3fc-2c963f66afa6.png")).toContain("3fa85f64-5717-4562-b3fc-2c963f66afa6.png");
    });
});
