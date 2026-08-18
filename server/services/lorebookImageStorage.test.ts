import { describe, expect, it } from "vitest";
import { getLorebookImagePath, isValidLorebookImageFilename } from "./lorebookImageStorage.js";

describe("isValidLorebookImageFilename (B22 path jail)", () => {
    it("accepts a real generated filename for every supported extension", () => {
        for (const ext of ["jpg", "png", "webp", "gif"])
            expect(isValidLorebookImageFilename(`3fa85f64-5717-4562-b3fc-2c963f66afa6.${ext}`)).toBe(true);
    });

    it("rejects path traversal attempts", () => {
        expect(isValidLorebookImageFilename("../../../etc/passwd")).toBe(false);
        expect(isValidLorebookImageFilename("..\\..\\windows\\win.ini")).toBe(false);
    });

    it("rejects an absolute path", () => {
        expect(isValidLorebookImageFilename("/etc/passwd")).toBe(false);
    });

    it("rejects a well-formed uuid with a disallowed extension", () => {
        expect(isValidLorebookImageFilename("3fa85f64-5717-4562-b3fc-2c963f66afa6.svg")).toBe(false);
    });

    it("rejects a uuid with no extension at all", () => {
        expect(isValidLorebookImageFilename("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(false);
    });

    it("rejects a filename with an embedded null byte or extra path segment", () => {
        expect(isValidLorebookImageFilename("3fa85f64-5717-4562-b3fc-2c963f66afa6.png/../secret")).toBe(false);
    });
});

describe("getLorebookImagePath", () => {
    it("throws instead of returning a path for an invalid filename", () => {
        expect(() => getLorebookImagePath("../../../etc/passwd")).toThrow();
    });

    it("returns a path for a valid filename", () => {
        expect(getLorebookImagePath("3fa85f64-5717-4562-b3fc-2c963f66afa6.png")).toContain("3fa85f64-5717-4562-b3fc-2c963f66afa6.png");
    });
});
