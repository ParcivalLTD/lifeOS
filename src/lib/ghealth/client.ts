import "server-only";

/**
 * Google Health API client — OAuth2 + the read endpoints Helm uses.
 *
 * READ-ONLY BY CONSTRUCTION, same discipline as the CalDAV client: every
 * Google Health *API* request goes through `api()`, which only issues GETs.
 * (The OAuth endpoints are POSTs by protocol — token exchange, refresh,
 * revoke — but they touch credentials, never health data. Stage 3 adds one
 * more sanctioned POST, subscriber registration, which configures webhooks
 * and also writes no health data.)
 *
 * Scope strings and endpoint shapes are from the current Google Health API
 * docs (developers.google.com/health, checked 2026-07-21), NOT recalled:
 *  - scopes: googlehealth.{activity_and_fitness | health_metrics_and_
 *    measurements | sleep | nutrition}.readonly
 *  - token exchange returns `refresh_token_expires_in` (~604799s in Testing
 *    publishing status — the documented 7-day expiry, not a bug)
 *  - base: https://health.googleapis.com/v4
 *
 * Test-only overrides (never set in real environments): GOOGLE_HEALTH_OAUTH_BASE
 * points authorize/token/revoke at a mock; GOOGLE_HEALTH_API_BASE likewise for
 * the API. Same pattern as CALDAV_BASE_URL.
 */

export const GHEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
];

const oauthBase = () => process.env.GOOGLE_HEALTH_OAUTH_BASE || null;
const apiBase = () =>
  process.env.GOOGLE_HEALTH_API_BASE || "https://health.googleapis.com";

const AUTHORIZE_URL = () =>
  oauthBase() ? `${oauthBase()}/authorize` : "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () =>
  oauthBase() ? `${oauthBase()}/token` : "https://oauth2.googleapis.com/token";
const REVOKE_URL = () =>
  oauthBase() ? `${oauthBase()}/revoke` : "https://oauth2.googleapis.com/revoke";

/** Whether the OAuth client is configured server-side. UI gates on this. */
export function ghealthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_HEALTH_CLIENT_ID && process.env.GOOGLE_HEALTH_CLIENT_SECRET,
  );
}

function clientCreds(): { id: string; secret: string } {
  const id = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const secret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET are not set — Google Health is unavailable",
    );
  }
  return { id, secret };
}

/** The stored refresh token was rejected — re-consent is required. */
export class GHealthAuthError extends Error {
  constructor(message = "Google rejected the stored credentials — reconnect Google Health") {
    super(message);
    this.name = "GHealthAuthError";
  }
}

export class GHealthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GHealthError";
  }
}

// --- OAuth ---------------------------------------------------------------

/** The consent URL the owner's browser is sent to. `prompt=consent` forces a
 * fresh refresh token on every (re)connect — Google otherwise omits it on
 * repeat consents, and reconnecting IS the 7-day Testing-mode workflow. */
export function authorizeUrl(redirectUri: string, state: string): string {
  const { id } = clientCreds();
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GHEALTH_SCOPES.join(" "),
    state,
  });
  return `${AUTHORIZE_URL()}?${q}`;
}

export type TokenGrant = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the REFRESH token dies (~7 days under Testing status). */
  refreshTokenExpiresInSeconds: number | null;
  scopes: string[];
};

async function tokenRequest(body: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 400 || res.status === 401) {
    // invalid_grant = revoked/expired refresh token or bad code
    throw new GHealthAuthError(
      typeof json.error === "string" ? `Google auth failed: ${json.error}` : undefined,
    );
  }
  if (!res.ok) throw new GHealthError(`Google token endpoint failed: ${res.status}`);
  return json;
}

/** Authorization code → tokens (the connect flow's exchange step). */
export async function exchangeCode(code: string, redirectUri: string): Promise<TokenGrant> {
  const { id, secret } = clientCreds();
  const json = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
  if (typeof json.access_token !== "string" || typeof json.refresh_token !== "string") {
    throw new GHealthError("Google token response was missing tokens");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    refreshTokenExpiresInSeconds:
      typeof json.refresh_token_expires_in === "number"
        ? json.refresh_token_expires_in
        : null,
    scopes: typeof json.scope === "string" ? json.scope.split(" ") : [],
  };
}

/** Refresh token → short-lived access token (used per sync; never stored). */
export async function mintAccessToken(refreshToken: string): Promise<string> {
  const { id, secret } = clientCreds();
  const json = await tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
    }),
  );
  if (typeof json.access_token !== "string") {
    throw new GHealthError("Google refresh response was missing an access token");
  }
  return json.access_token;
}

/** Revoke on disconnect, so the grant dies at Google's end too — not just in
 * our storage. Best-effort: a failure must not block the local disconnect. */
export async function revokeToken(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_URL(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- the API (GET-only) ----------------------------------------------------

async function api(
  accessToken: string,
  path: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${apiBase()}/v4/${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) throw new GHealthAuthError();
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/**
 * The connect-time confirmation call: proves the token actually works against
 * the Health API before anything is stored. Primary probe is getIdentity
 * (also yields the healthUserId that webhook notifications reference); if the
 * endpoint shape differs (docs list it without a worked example), fall back
 * to a plain dataPoints read, which the granted scopes cover either way.
 */
export async function confirmAccess(
  accessToken: string,
): Promise<{ healthUserId: string | null }> {
  const identity = await api(accessToken, "users/me:getIdentity");
  if (identity.status >= 200 && identity.status < 300) {
    const j = identity.json as { healthUserId?: unknown; userId?: unknown } | null;
    const id =
      typeof j?.healthUserId === "string"
        ? j.healthUserId
        : typeof j?.userId === "string"
          ? j.userId
          : null;
    return { healthUserId: id };
  }
  const probe = await api(accessToken, "users/me/dataTypes/weight/dataPoints");
  if (probe.status >= 200 && probe.status < 300) return { healthUserId: null };
  throw new GHealthError(
    `Google Health API rejected the confirmation call (${identity.status}/${probe.status})`,
  );
}
