/**
 * Google Health connection verification (stage: OAuth + storage).
 *
 * Real Google cannot be reached from CI (needs a live consent screen and a
 * Testing-status OAuth client), so this stands up a LOCAL MOCK that speaks
 * the actual protocol — authorization-code exchange returning
 * `refresh_token_expires_in`, token refresh, revocation, and the Health API
 * confirmation call — and points the REAL client at it via the test-only
 * base-URL overrides. Everything under test is the production code path.
 *
 * Covers: token sealed at rest + never exposed, the 7-day Testing-mode
 * expiry state machine (ok → expiring at ≤3 days → expired), early
 * revocation (broken), reconnect clearing it, disconnect revoking at
 * Google's end and clearing storage, calendar exclusion, backup redaction.
 *
 * Leaves no trace. Usage: npm run test:ghealth
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as NodeJS.Module;

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};

// --- mock Google -------------------------------------------------------------
const REFRESH_TOKEN = "1//mock-refresh-token-abc123";
const ACCESS_TOKEN = "ya29.mock-access-token";
const TESTING_TTL_S = 604799; // what real Testing-status responses carry
let revokeCalls = 0;

function mock() {
  return createServer((rq: IncomingMessage, rs: ServerResponse) => {
    let body = "";
    rq.on("data", (c) => (body += c));
    rq.on("end", () => {
      const url = rq.url ?? "/";
      const send = (code: number, json: unknown) => {
        rs.writeHead(code, { "content-type": "application/json" });
        rs.end(JSON.stringify(json));
      };
      if (url === "/oauth/token") {
        const p = new URLSearchParams(body);
        if (p.get("grant_type") === "authorization_code") {
          if (p.get("code") !== "good-code") return send(400, { error: "invalid_grant" });
          return send(200, {
            access_token: ACCESS_TOKEN,
            refresh_token: REFRESH_TOKEN,
            refresh_token_expires_in: TESTING_TTL_S,
            expires_in: 3599,
            scope:
              "https://www.googleapis.com/auth/googlehealth.sleep.readonly https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
            token_type: "Bearer",
          });
        }
        if (p.get("grant_type") === "refresh_token") {
          if (p.get("refresh_token") !== REFRESH_TOKEN) {
            return send(400, { error: "invalid_grant" });
          }
          return send(200, { access_token: ACCESS_TOKEN, expires_in: 3599 });
        }
        return send(400, { error: "unsupported_grant_type" });
      }
      if (url === "/oauth/revoke") {
        revokeCalls++;
        return send(200, {});
      }
      if (url === "/v4/users/me:getIdentity") {
        if (rq.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) return send(401, {});
        return send(200, { healthUserId: "health-user-42" });
      }
      send(404, { error: "not-found" });
    });
  });
}

async function main() {
  const server = mock();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env.GOOGLE_HEALTH_OAUTH_BASE = `http://127.0.0.1:${port}/oauth`;
  process.env.GOOGLE_HEALTH_API_BASE = `http://127.0.0.1:${port}`;
  process.env.GOOGLE_HEALTH_CLIENT_ID = "mock-client-id";
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = "mock-client-secret";

  const { closeDb, forUser } = await import("@/db");
  const { events } = await import("@/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const {
    authorizeUrl, exchangeCode, confirmAccess, mintAccessToken, GHEALTH_SCOPES,
  } = await import("@/lib/ghealth/client");
  const {
    deleteGHealthConnection, getGHealthConnection, markGHealthBroken,
    refreshTokenOf, saveGHealthConnection, RECONNECT_WARNING_DAYS,
  } = await import("@/lib/data/ghealth");
  const { buildExport } = await import("@/lib/backup");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { addDaysISO, todayISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const udb = forUser(OWNER);
  const isGH = sql`${events.payload} is not null and jsonb_exists(${events.payload}, 'ghealth')`;

  // ---- boundary -------------------------------------------------------------
  const clientSrc = readFileSync("src/lib/ghealth/client.ts", "utf8");
  check("boundary: ghealth client is server-only",
    clientSrc.includes('import "server-only"'));
  check("boundary: data layer is server-only",
    readFileSync("src/lib/data/ghealth.ts", "utf8").includes('import "server-only"'));
  const apiFn = clientSrc.slice(
    clientSrc.indexOf("async function api"),
    clientSrc.indexOf("export async function confirmAccess"),
  );
  check("boundary: the Health API data helper only ever GETs",
    /method: "GET"/.test(apiFn) && !/method: "(POST|PUT|PATCH|DELETE)"/.test(apiFn));
  // stage 3 added exactly ONE sanctioned non-OAuth POST: webhook subscriber
  // registration (config, not health data). Nothing else may POST the API.
  const apiSection = clientSrc.slice(clientSrc.indexOf("async function api"));
  check("boundary: the only API POST is subscriber registration (config write)",
    (apiSection.match(/method: "POST"/g) ?? []).length === 1 &&
      apiSection.indexOf('method: "POST"') > apiSection.indexOf("registerWebhookSubscriber"));
  check("scopes: exactly the four documented read-only scopes",
    GHEALTH_SCOPES.length === 4 &&
      GHEALTH_SCOPES.every((s) => s.includes("googlehealth.") && s.endsWith(".readonly")),
    GHEALTH_SCOPES.join("\n"));

  const authUrl = authorizeUrl("http://127.0.0.1:3000/cb", "state-xyz");
  check("authorize url: offline access + forced consent (fresh refresh token every reconnect)",
    authUrl.includes("access_type=offline") && authUrl.includes("prompt=consent"));
  check("authorize url: carries the CSRF state", authUrl.includes("state=state-xyz"));

  // ---- connect flow (exchange → confirm → save) -----------------------------
  await deleteGHealthConnection(OWNER); // clean slate

  const grant = await exchangeCode("good-code", "http://127.0.0.1:3000/cb");
  check("exchange: tokens + Testing-mode refresh TTL parsed",
    grant.refreshToken === REFRESH_TOKEN &&
      grant.refreshTokenExpiresInSeconds === TESTING_TTL_S);

  const { healthUserId } = await confirmAccess(grant.accessToken);
  check("confirm: identity call verifies the token BEFORE anything is stored",
    healthUserId === "health-user-42");

  let threw = false;
  try {
    await exchangeCode("bad-code", "http://127.0.0.1:3000/cb");
  } catch {
    threw = true;
  }
  check("exchange: a bad code throws — nothing to store", threw);

  await saveGHealthConnection(OWNER, {
    refreshToken: grant.refreshToken,
    refreshTokenExpiresInSeconds: grant.refreshTokenExpiresInSeconds,
    healthUserId,
    scopes: grant.scopes,
  });

  // ---- storage secrecy -------------------------------------------------------
  const [row] = await udb.select(events, { where: and(eq(events.archived, false), isGH) });
  const rawPayload = JSON.stringify(row.payload);
  check("secrecy: the refresh token is NOT stored in plaintext",
    !rawPayload.includes(REFRESH_TOKEN));
  check("secrecy: the sealed blob is versioned AES-GCM output",
    /"secret":"v1\./.test(rawPayload));
  const conn = await getGHealthConnection(OWNER);
  check("secrecy: the public view carries no secret field",
    conn !== null && !JSON.stringify(conn).includes("secret"));
  check("round-trip: refreshTokenOf decrypts back to the original",
    (await refreshTokenOf(OWNER)) === REFRESH_TOKEN);
  check("round-trip: the decrypted token still mints access tokens",
    (await mintAccessToken((await refreshTokenOf(OWNER))!)) === ACCESS_TOKEN);

  // ---- the 7-day expiry state machine ---------------------------------------
  check("expiry: fresh connection is OK with ~7 days on the clock",
    conn!.status === "ok" && conn!.daysLeft >= RECONNECT_WARNING_DAYS + 1 && conn!.daysLeft <= 7,
    `status=${conn!.status} daysLeft=${conn!.daysLeft}`);
  check("expiry: expiresAt ≈ issuedAt + refresh_token_expires_in",
    Math.abs(
      (Date.parse(conn!.expiresAt) - Date.parse(conn!.issuedAt)) / 1000 - TESTING_TTL_S,
    ) < 5);

  // wind the clock: 2 days left → the early reconnect prompt window
  const patchExpiry = async (msFromNow: number) => {
    const [r] = await udb.select(events, { where: and(eq(events.archived, false), isGH) });
    const p = r.payload as { ghealth: Record<string, unknown> };
    p.ghealth.expiresAt = new Date(Date.now() + msFromNow).toISOString();
    await udb.update(events, { payload: p }, eq(events.id, r.id));
  };
  await patchExpiry(2 * 86_400_000);
  check("expiry: ≤3 days left → EXPIRING (reconnect prompt fires early, not at death)",
    (await getGHealthConnection(OWNER))!.status === "expiring");
  await patchExpiry(-3_600_000);
  const lapsed = (await getGHealthConnection(OWNER))!;
  check("expiry: past expiresAt → EXPIRED, plainly (never a silent failure)",
    lapsed.status === "expired" && lapsed.daysLeft < 0,
    `status=${lapsed.status}`);

  // ---- early revocation (broken) + reconnect --------------------------------
  await markGHealthBroken(OWNER, "invalid_grant on refresh");
  const broken = (await getGHealthConnection(OWNER))!;
  check("broken: an actively rejected token is its own state, with the reason",
    broken.status === "broken" && broken.lastError === "invalid_grant on refresh");

  await saveGHealthConnection(OWNER, {
    refreshToken: REFRESH_TOKEN,
    refreshTokenExpiresInSeconds: TESTING_TTL_S,
    healthUserId,
    scopes: grant.scopes,
  });
  const healed = (await getGHealthConnection(OWNER))!;
  check("reconnect: a fresh grant clears broken/expired and restarts the 7-day clock",
    healed.status === "ok" && healed.daysLeft >= RECONNECT_WARNING_DAYS + 1 && !healed.lastError);

  // ---- never on the calendar, never in a backup ------------------------------
  const visible = await listEventsInRange(OWNER, addDaysISO(todayISO(), -3), addDaysISO(todayISO(), 3));
  check("calendar: the connection record never appears as a schedule item",
    !visible.some((e) => e.title === "Google Health connection"));

  const dump = JSON.stringify(await buildExport());
  check("backup: sealed token redacted from the NFR-4 export",
    dump.includes('"ghealth"') && !/"ghealth":\{[^}]*"secret"/.test(dump) &&
      dump.includes("secretRedacted"));
  check("backup: the plaintext refresh token appears nowhere in the export",
    !dump.includes(REFRESH_TOKEN));

  // ---- disconnect -------------------------------------------------------------
  const revokesBefore = revokeCalls;
  const token = await refreshTokenOf(OWNER);
  const { revokeToken } = await import("@/lib/ghealth/client");
  if (token) await revokeToken(token);
  await deleteGHealthConnection(OWNER);
  check("disconnect: the grant is revoked at Google's end", revokeCalls === revokesBefore + 1);
  check("disconnect: local storage cleared", (await getGHealthConnection(OWNER)) === null);

  server.close();
  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
