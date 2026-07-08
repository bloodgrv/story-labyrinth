// xAI OAuth2 Device Authorization Grant (RFC 8628) client. Lets a SuperGrok subscriber connect
// their own account against the real official https://api.x.ai/v1 endpoint instead of pasting a
// separately-purchased console.x.ai API key — no cookie scraping, no Cloudflare bot-detection
// concerns, just a standard OAuth flow xAI operates for its own first-party tools (grok-cli
// etc). client_id below is the public desktop-client identifier those tools ship — it is not a
// secret, mirroring how `gh`/GitHub CLI and similar tools embed a public OAuth client id.
const CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const SCOPE = "openid profile email offline_access grok-cli:access api:access";
const DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code";
const TOKEN_URL = "https://auth.x.ai/oauth2/token";

// Refresh this many ms before actual expiry, matching the margin used by known first-party
// clients of this same flow, so a request never races an about-to-expire token.
const REFRESH_SKEW_MS = 120_000;

export type DeviceAuthorization = {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval: number;
};

export type TokenSet = {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
};

export const startDeviceFlow = async (): Promise<DeviceAuthorization> => {
    const response = await fetch(DEVICE_CODE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE })
    });

    if (!response.ok) throw new Error(`xAI device authorization failed: ${response.status}`);

    const data = await response.json();
    return {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        verificationUriComplete: data.verification_uri_complete,
        expiresIn: data.expires_in,
        interval: data.interval
    };
};

export type PollResult =
    | { status: "complete"; tokens: TokenSet }
    | { status: "pending" | "slow_down" }
    | { status: "error"; error: string };

export const pollDeviceToken = async (deviceCode: string): Promise<PollResult> => {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCode,
            client_id: CLIENT_ID
        })
    });

    const data = await response.json();

    if (response.ok) {
        return {
            status: "complete",
            tokens: {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: Date.now() + data.expires_in * 1000
            }
        };
    }

    if (data.error === "authorization_pending" || data.error === "slow_down") return { status: data.error };
    return { status: "error", error: data.error ?? `HTTP ${response.status}` };
};

const refreshAccessToken = async (refreshToken: string): Promise<TokenSet | null> => {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: CLIENT_ID
        })
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000
    };
};

// Returns a currently-valid access token, transparently refreshing it first if it's expired or
// about to be. Returns null if there's no connection yet, or the refresh itself failed (refresh
// token revoked/expired — the user needs to reconnect via the device flow again).
export const ensureFreshAccessToken = async (settings: {
    grokOAuthAccessToken?: string | null;
    grokOAuthRefreshToken?: string | null;
    grokOAuthExpiresAt?: number | null;
}): Promise<TokenSet | null> => {
    if (!settings.grokOAuthAccessToken) return null;

    const stillValid = settings.grokOAuthExpiresAt && settings.grokOAuthExpiresAt - REFRESH_SKEW_MS > Date.now();
    if (stillValid)
        return {
            accessToken: settings.grokOAuthAccessToken,
            refreshToken: settings.grokOAuthRefreshToken ?? undefined,
            expiresAt: settings.grokOAuthExpiresAt as number
        };

    if (!settings.grokOAuthRefreshToken) return null;
    return refreshAccessToken(settings.grokOAuthRefreshToken);
};
