import { deflateSync } from "node:zlib";
import { jsPDF } from "jspdf";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";

// Guards the two dependency contracts Wave 0 (B46/B47) leaned on, neither of which TypeScript can
// check: (1) pdf-parse's getImage() extracts embedded images WITHOUT the `canvas` package — it uses
// its own @napi-rs/canvas dependency, which is why removing node-canvas was safe; (2) the jsPDF API
// surface exportStoryAsPdf.ts drives still exists, which matters because that file holds the
// instance as `any` ("jsPDF types are incomplete"), so a major bump can break it silently.
//
// documentImportService's own extractImageFromPdf is private, and its exported wrappers call an LLM
// through buildClientForFeature — so this asserts the library contract that function is a thin
// wrapper over, mirroring its exact call shape. If this fails after a dependency bump, check
// extractImageFromPdf before assuming the test is stale.

// Minimal valid PNG encoder (zlib + CRC32, no dependency). A hand-pasted base64 literal is a bad
// fixture here: jsPDF verifies PNG chunk CRCs and rejects a malformed one outright.
const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crc]);
};

const solidPng = (width: number, height: number): Buffer => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: truecolour RGB
    // rows are [filter byte, then RGB triples]
    const raw = Buffer.concat(
        Array.from({ length: height }, () => {
            const row = Buffer.alloc(1 + width * 3);
            for (let x = 0; x < width; x++) {
                row[1 + x * 3] = 220;
                row[2 + x * 3] = 40;
                row[3 + x * 3] = 40;
            }
            return row;
        })
    );
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0))
    ]);
};

// Above pdf-parse's default imageThreshold of 80px — see the threshold test below.
const buildPdfWithImage = (imageWidth = 200, imageHeight = 150): Buffer => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // The exact call surface src/utils/export/exportStoryAsPdf.ts uses.
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("Title", pageWidth / 2, pageHeight / 3, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    const lines: string[] = doc.splitTextToSize("Body text that wraps across the line width.", pageWidth - 40);
    lines.forEach((line, i) => doc.text(line, 20, 100 + i * 8));
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(20, 110, pageWidth - 20, 110);
    doc.addPage();

    const png = `data:image/png;base64,${solidPng(imageWidth, imageHeight).toString("base64")}`;
    doc.addImage(png, "PNG", 20, 20, 40, 30);
    return Buffer.from(doc.output("arraybuffer"));
};

// Mirrors extractImageFromPdf (server/services/documentImportService.ts) exactly.
const extractLargestImage = async (buffer: Buffer) => {
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getImage();
        const images = result.pages.flatMap(page => page.images).filter(image => !!image.dataUrl);
        return images.reduce<(typeof images)[number] | null>(
            (largest, image) => (!largest || image.width * image.height > largest.width * largest.height ? image : largest),
            null
        );
    } finally {
        await parser.destroy();
    }
};

describe("PDF embedded-image extraction (B46 — no `canvas` package)", () => {
    it("extracts an embedded image, with correct dimensions and a usable data URL", async () => {
        const best = await extractLargestImage(buildPdfWithImage());

        if (!best) throw new Error("expected an embedded image to be extracted");
        expect(best.width).toBe(200);
        expect(best.height).toBe(150);
        expect(best.dataUrl).toMatch(/^data:image\//);
    });

    it("picks the largest image by pixel area, not the first one found", async () => {
        const doc = new jsPDF();
        doc.addImage(`data:image/png;base64,${solidPng(100, 100).toString("base64")}`, "PNG", 10, 10, 20, 20);
        doc.addImage(`data:image/png;base64,${solidPng(300, 200).toString("base64")}`, "PNG", 10, 60, 40, 30);
        const best = await extractLargestImage(Buffer.from(doc.output("arraybuffer")));

        if (!best) throw new Error("expected the larger of the two embedded images");
        expect(best.width).toBe(300);
    });

    it("skips images below pdf-parse's default 80px imageThreshold", async () => {
        // Documents real (previously unrecorded) behaviour: document import calls getImage() with no
        // options, so a small decorative image is silently ignored rather than returned.
        expect(await extractLargestImage(buildPdfWithImage(40, 40))).toBeNull();
    });
});

describe("jsPDF export API surface (B47 — held as `any` in exportStoryAsPdf.ts)", () => {
    it("still produces a multi-page PDF through the APIs the exporter calls", () => {
        // Cast exactly as exportStoryAsPdf.ts does. It matters: jsPDF's published types declare
        // getNumberOfPages() on the instance but NOT on `internal`, while the exporter calls
        // doc.internal.getNumberOfPages() — so only a runtime assertion can catch that breaking.
        // eslint-disable-next-line typescript-eslint/no-explicit-any -- jsPDF types are incomplete, same as the exporter
        const doc = new jsPDF() as any;
        doc.text("page one", 20, 20);
        doc.addPage();
        doc.text("page two", 20, 20);

        expect(doc.internal.getNumberOfPages()).toBe(2);
        expect(typeof doc.save).toBe("function");

        const bytes = Buffer.from(doc.output("arraybuffer"));
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    });
});
