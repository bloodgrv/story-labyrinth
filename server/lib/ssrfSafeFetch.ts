import dns from "node:dns/promises";
import net from "node:net";

// Shared SSRF guard (B23, docs/CODE_REVIEW_2026-08-17.md). Two concrete server-side-fetch features
// exist — Research's live page fetch (webSearchService.ts's fetchPage, URL comes straight from a
// chat message) and EPUB export's remote `<img src>` embedding (epubGenerator.ts) — both let a
// user-supplied URL make the server itself issue a request. Without this guard either one can probe
// cloud metadata endpoints (169.254.169.254), internal admin panels, or any other LAN/Tailscale-
// reachable service from the server's own network position. Threat model here is a trusted
// single-operator/household deployment (see CURRENT_BACKLOG.md B23's threat-model note) — this
// blocks the concrete probing paths, it isn't a hardened multi-tenant egress proxy.

export class SsrfBlockedError extends Error {}

const isPrivateIPv4 = (ip: string): boolean => {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true; // malformed -> deny
    const [a, b] = parts;
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
    return false;
};

const isPrivateIPv6 = (ip: string): boolean => {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
    if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice("::ffff:".length)); // IPv4-mapped
    return false;
};

export interface SsrfOptions {
    // Per-connection opt-in (docs/MCP_Tool_Connections_Design.md §2.4/§3.2) — short-circuits the
    // private/loopback/link-local/CGNAT checks below for self-hosted/LAN targets the owner has
    // explicitly trusted. Protocol validation and the localhost-hostname check still always apply.
    // Off by default so every existing caller (webSearchService.ts, epubGenerator.ts) is unaffected.
    allowPrivate?: boolean;
}

// Validates protocol + resolves the hostname so a DNS answer can't point at an internal target the
// URL text itself doesn't reveal ("DNS rebinding") — every resolved address is checked, not just
// the first. Throws SsrfBlockedError on anything disallowed; returns the parsed URL on success.
export const assertPublicUrl = async (rawUrl: string, options: SsrfOptions = {}): Promise<URL> => {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new SsrfBlockedError(`Blocked protocol: ${parsed.protocol}`);
    if (options.allowPrivate) return parsed;

    const hostname = parsed.hostname;
    if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new SsrfBlockedError(`Blocked hostname: ${hostname}`);

    const literalFamily = net.isIP(hostname);
    if (literalFamily === 4) {
        if (isPrivateIPv4(hostname)) throw new SsrfBlockedError(`Blocked IP: ${hostname}`);
        return parsed;
    }
    if (literalFamily === 6) {
        if (isPrivateIPv6(hostname)) throw new SsrfBlockedError(`Blocked IP: ${hostname}`);
        return parsed;
    }

    const records = await dns.lookup(hostname, { all: true }).catch(() => []);
    if (records.length === 0) throw new SsrfBlockedError(`Could not resolve host: ${hostname}`);
    for (const { address, family } of records) {
        if (family === 4 && isPrivateIPv4(address)) throw new SsrfBlockedError(`Blocked resolved IP: ${address} (${hostname})`);
        if (family === 6 && isPrivateIPv6(address)) throw new SsrfBlockedError(`Blocked resolved IP: ${address} (${hostname})`);
    }
    return parsed;
};

// fetch() wrapper that re-validates on every redirect hop (manual redirect handling — the plain
// `follow` mode would let a first-hop-safe URL redirect straight to a private address after the
// check already passed).
export const ssrfSafeFetch = async (
    rawUrl: string,
    init: RequestInit = {},
    maxRedirects = 5,
    options: SsrfOptions = {}
): Promise<Response> => {
    let currentUrl = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const parsed = await assertPublicUrl(currentUrl, options);
        const res = await fetch(parsed, { ...init, redirect: "manual" });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
            currentUrl = new URL(location, parsed).toString();
            continue;
        }
        return res;
    }
    throw new SsrfBlockedError("Too many redirects");
};
