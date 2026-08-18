import { describe, expect, it } from "vitest";
import { assertPublicUrl, SsrfBlockedError } from "./ssrfSafeFetch.js";

// All cases here use literal IP addresses or a bare "localhost" hostname so assertPublicUrl never
// hits DNS — keeps these tests fast and network-independent, and literal-IP handling is exactly
// the branch that matters for B23 (a DNS-rebinding test would need a real/mocked resolver, out of
// scope for this pure-function slice).
describe("assertPublicUrl (B23 SSRF guard)", () => {
    it("blocks disallowed protocols", async () => {
        await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
        await expect(assertPublicUrl("ftp://example.com/x")).rejects.toThrow(SsrfBlockedError);
    });

    it("blocks localhost by name", async () => {
        await expect(assertPublicUrl("http://localhost/")).rejects.toThrow(SsrfBlockedError);
        await expect(assertPublicUrl("http://foo.localhost/")).rejects.toThrow(SsrfBlockedError);
    });

    it("blocks IPv4 loopback, RFC1918, link-local/cloud-metadata, and CGNAT ranges", async () => {
        const blocked = ["http://127.0.0.1/", "http://10.1.2.3/", "http://172.16.0.1/", "http://192.168.1.1/", "http://169.254.169.254/", "http://100.64.0.1/"];
        for (const url of blocked) await expect(assertPublicUrl(url), url).rejects.toThrow(SsrfBlockedError);
    });

    it("allows a public IPv4 literal", async () => {
        await expect(assertPublicUrl("http://8.8.8.8/")).resolves.toBeInstanceOf(URL);
    });

    it("blocks IPv6 loopback and unique-local ranges", async () => {
        await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow(SsrfBlockedError);
        await expect(assertPublicUrl("http://[fd00::1]/")).rejects.toThrow(SsrfBlockedError);
        await expect(assertPublicUrl("http://[fe80::1]/")).rejects.toThrow(SsrfBlockedError);
    });

    it("blocks an IPv4-mapped IPv6 loopback", async () => {
        await expect(assertPublicUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow(SsrfBlockedError);
    });
});
