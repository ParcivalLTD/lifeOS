/**
 * Google Health webhook sync verification (stage 3).
 *
 * Stands up a LOCAL MOCK Google that speaks the real protocol — token
 * refresh, the dataPoints endpoints (`:reconcile` for steps), and the Tink
 * public keyset URL — signs webhook notifications with its own P-256 key,
 * and drives the REAL delivery path: shared-secret check → signature
 * verification → parse → handleNotification. Everything under test is the
 * production code.
 *
 * Covers: both webhook security layers (bad secret rejected, tampered body
 * rejected, unknown key rejected), the verification handshake, idempotent
 * redelivery (zero new rows), value corrections via upsert, DELETE semantics
 * via interval re-sync (prune), steps day-aggregation from the reconciled
 * stream, sleep stage fan-out, nutrition facets, daily-summary types, and
 * the exercise policy: non-gym types become Events, gym-shaped types NEVER
 * do (flat config list).
 *
 * Leaves no trace. Usage: npm run test:ghealth-sync
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSign, generateKeyPairSync } from "node:crypto";
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

// --- signing key + Tink keyset ------------------------------------------------

const KEY_ID = 0x12345678;
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };

/** EcdsaPublicKey proto: version(1)=0, x(3), y(4) — length-delimited coords. */
function ecdsaPublicKeyProto(): Buffer {
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  return Buffer.concat([
    Buffer.from([0x08, 0x00]), // version = 0
    Buffer.from([0x1a, x.length]), x, // field 3: x
    Buffer.from([0x22, y.length]), y, // field 4: y
  ]);
}

const keysetJson = () => ({
  primaryKeyId: KEY_ID,
  key: [
    {
      keyId: KEY_ID,
      status: "ENABLED",
      outputPrefixType: "TINK",
      keyData: {
        typeUrl: "type.googleapis.com/google.crypto.tink.EcdsaPublicKey",
        value: ecdsaPublicKeyProto().toString("base64"),
        keyMaterialType: "ASYMMETRIC_PUBLIC",
      },
    },
  ],
});

/** Tink TINK-prefix signature header: base64(0x01 ‖ keyId BE32 ‖ DER sig). */
function signBody(rawBody: string, keyId = KEY_ID): string {
  const signer = createSign("sha256");
  signer.update(Buffer.from(rawBody, "utf8"));
  const der = signer.sign(privateKey); // DER is node's EC default
  const prefix = Buffer.alloc(5);
  prefix[0] = 0x01;
  prefix.writeUInt32BE(keyId, 1);
  return Buffer.concat([prefix, der]).toString("base64");
}

// --- mock Google ---------------------------------------------------------------

const REFRESH_TOKEN = "1//sync-mock-refresh";
const ACCESS_TOKEN = "ya29.sync-mock-access";

/** Mutable provider truth: what each dataPoints fetch returns. */
const provider: Record<string, Record<string, unknown>[]> = {};
const hits: string[] = [];

function mock() {
  return createServer((rq: IncomingMessage, rs: ServerResponse) => {
    let body = "";
    rq.on("data", (c) => (body += c));
    rq.on("end", () => {
      const url = rq.url ?? "/";
      hits.push(url);
      const send = (code: number, json: unknown) => {
        rs.writeHead(code, { "content-type": "application/json" });
        rs.end(JSON.stringify(json));
      };
      if (url === "/keyset.json") return send(200, keysetJson());
      if (url === "/oauth/token") {
        const p = new URLSearchParams(body);
        if (p.get("grant_type") === "refresh_token" && p.get("refresh_token") === REFRESH_TOKEN) {
          return send(200, { access_token: ACCESS_TOKEN, expires_in: 3599 });
        }
        return send(400, { error: "invalid_grant" });
      }
      const dp = url.match(/^\/v4\/users\/me\/dataTypes\/([a-z-]+)\/dataPoints(:reconcile)?\?/);
      if (dp) {
        if (rq.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) return send(401, {});
        return send(200, { dataPoints: provider[dp[1]] ?? [] });
      }
      send(404, { error: "not-found", url });
    });
  });
}

// --- notification helpers -------------------------------------------------------

const iso = (d: Date) => d.toISOString();
const now = new Date();
const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(dayStart.getTime() + dayOffset * 86_400_000 + h * 3_600_000 + m * 60_000);
const todayKey = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;

function notification(dataType: string, start: Date, end: Date, operation = "UPSERT"): string {
  return JSON.stringify({
    type: "dataTypeChanged",
    data: {
      healthUserId: "health-user-42",
      dataType,
      operation,
      intervals: [{ physicalTimeInterval: { startTime: iso(start), endTime: iso(end) } }],
    },
  });
}

async function main() {
  const server = mock();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env.GOOGLE_HEALTH_OAUTH_BASE = `http://127.0.0.1:${port}/oauth`;
  process.env.GOOGLE_HEALTH_API_BASE = `http://127.0.0.1:${port}`;
  process.env.GOOGLE_HEALTH_KEYSET_URL = `http://127.0.0.1:${port}/keyset.json`;
  process.env.GOOGLE_HEALTH_CLIENT_ID = "mock-client-id";
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = "mock-client-secret";
  process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = "mock-webhook-secret";

  const { closeDb, forUser } = await import("@/db");
  const { events, metricDatapoints, metrics } = await import("@/db/schema");
  const { and, eq, inArray } = await import("drizzle-orm");
  const { webhookSecretOk, verifyWebhookSignature, parseNotification, resetKeysetCache } =
    await import("@/lib/ghealth/webhook");
  const { handleNotification } = await import("@/lib/ghealth/sync");
  const { saveGHealthConnection, deleteGHealthConnection } = await import("@/lib/data/ghealth");
  const { METRIC_SPECS } = await import("@/lib/ghealth/mapping");

  const OWNER = process.env.SEED_USER_ID!;
  const udb = forUser(OWNER);

  // snapshot pre-existing metric ids so cleanup only removes what we created
  const specNames = Object.values(METRIC_SPECS).map((s) => s.name);
  const preMetrics = new Set(
    (await udb.select(metrics, { where: inArray(metrics.name, specNames) })).map((m) => m.id),
  );

  await deleteGHealthConnection(OWNER);
  await saveGHealthConnection(OWNER, {
    refreshToken: REFRESH_TOKEN,
    refreshTokenExpiresInSeconds: 604799,
    healthUserId: "health-user-42",
    scopes: [],
  });

  /** The route's exact gate order, as one callable delivery. */
  const deliver = async (
    rawBody: string,
    opts: { auth?: string | null; sig?: string | null } = {},
  ): Promise<number | Awaited<ReturnType<typeof handleNotification>>> => {
    const auth = opts.auth === undefined ? "mock-webhook-secret" : opts.auth;
    if (!webhookSecretOk(auth)) return 401;
    const sig = opts.sig === undefined ? signBody(rawBody) : opts.sig;
    if (!(await verifyWebhookSignature(rawBody, sig))) return 403;
    const n = parseNotification(rawBody);
    if (!n) return 204;
    return handleNotification(OWNER, n);
  };

  const countDatapoints = async (metricName: string) => {
    const [m] = await udb.select(metrics, { where: eq(metrics.name, metricName) });
    if (!m) return { rows: [] as { value: number; externalId: string | null }[], count: 0 };
    const rows = await udb.select(metricDatapoints, {
      where: and(eq(metricDatapoints.metricId, m.id), eq(metricDatapoints.source, "google_health")),
    });
    return { rows, count: rows.length };
  };

  // ---- source-level guarantees ------------------------------------------------
  const routeSrc = readFileSync("src/app/api/webhooks/google-health/route.ts", "utf8");
  check("route: enforces BOTH layers before acking (secret + signature)",
    routeSrc.indexOf("webhookSecretOk(request") < routeSrc.indexOf("await verifyWebhookSignature(") &&
      routeSrc.indexOf("webhookSecretOk(request") > 0 &&
      routeSrc.includes("status: 401") && routeSrc.includes("status: 403"));
  check("route: acks 204 immediately and processes via after()",
    routeSrc.includes("after(") && routeSrc.includes("status: 204"));
  check("route: registered as a public path (Google has no session)",
    readFileSync("src/lib/supabase/middleware.ts", "utf8").includes("/api/webhooks/google-health"));

  // ---- security layers ----------------------------------------------------------
  const stepsBody = notification("steps", at(0), at(23));
  check("security: wrong shared secret → 401, nothing runs",
    (await deliver(stepsBody, { auth: "wrong" })) === 401);
  check("security: missing secret header → 401",
    (await deliver(stepsBody, { auth: null })) === 401);
  check("security: missing signature → 403",
    (await deliver(stepsBody, { sig: null })) === 403);
  check("security: tampered body fails signature verification",
    (await deliver(stepsBody.replace("steps", "sleep"), { sig: signBody(stepsBody) })) === 403);
  resetKeysetCache();
  check("security: unknown key id is rejected even after a keyset refetch",
    (await deliver(stepsBody, { sig: signBody(stepsBody, 0x9999) })) === 403);
  check("handshake: a signed verification probe acks 2xx with no work",
    (await deliver(JSON.stringify({ type: "verification", challenge: "x" }))) === 204);
  check("parse: an unknown data type acks without syncing",
    (await deliver(notification("bloodGlucose", at(0), at(23)))) === 204);

  // ---- steps: reconciled stream → one datapoint per day, idempotent ------------
  provider["steps"] = [
    { name: "users/me/dataTypes/steps/dataPoints/s1", steps: { count: 4000, interval: { startTime: iso(at(8)), endTime: iso(at(9)) } } },
    { name: "users/me/dataTypes/steps/dataPoints/s2", steps: { count: 3000, interval: { startTime: iso(at(15)), endTime: iso(at(16)) } } },
  ];
  hits.length = 0;
  const r1 = await deliver(stepsBody);
  check("steps: delivery syncs", typeof r1 === "object" && "upserted" in r1 && r1.upserted >= 1);
  check("steps: fetched via :reconcile (server-side multi-source merge, no double-count)",
    hits.some((h) => h.includes("/steps/dataPoints:reconcile?")));
  let steps = await countDatapoints("Steps");
  const todayRow = steps.rows.find((r) => r.externalId === `steps/${todayKey}`);
  check("steps: ONE datapoint per civil day, summed (4000+3000)",
    todayRow !== undefined && todayRow.value === 7000,
    JSON.stringify(steps.rows.map((r) => [r.externalId, r.value])));
  const stepsCountBefore = steps.count;
  await deliver(stepsBody); // exact redelivery
  steps = await countDatapoints("Steps");
  check("steps: redelivered webhook creates ZERO new rows", steps.count === stepsCountBefore);
  provider["steps"].push({
    name: "users/me/dataTypes/steps/dataPoints/s3",
    steps: { count: 500, interval: { startTime: iso(at(20)), endTime: iso(at(21)) } },
  });
  await deliver(stepsBody);
  steps = await countDatapoints("Steps");
  check("steps: a correction UPDATES the day's row in place (7500, same row)",
    steps.count === stepsCountBefore &&
      steps.rows.find((r) => r.externalId === `steps/${todayKey}`)?.value === 7500);

  // ---- weight: upsert + prune (DELETE semantics) --------------------------------
  const weightBody = notification("weight", at(0), at(23));
  provider["weight"] = [
    { name: "users/me/dataTypes/weight/dataPoints/w1", weight: { weightGrams: 82500, sampleTime: iso(at(7)) } },
    { name: "users/me/dataTypes/weight/dataPoints/w2", weight: { weightGrams: 82100, sampleTime: iso(at(20)) } },
  ];
  await deliver(weightBody);
  let weight = await countDatapoints("Body weight");
  check("weight: both samples land in kg",
    weight.count === 2 && weight.rows.some((r) => r.value === 82.5) && weight.rows.some((r) => r.value === 82.1));
  provider["weight"] = [
    { name: "users/me/dataTypes/weight/dataPoints/w1", weight: { weightGrams: 83000, sampleTime: iso(at(7)) } },
  ];
  await deliver(weightBody, {});
  weight = await countDatapoints("Body weight");
  check("weight: re-sync applies the correction AND deletes the upstream-deleted row",
    weight.count === 1 && weight.rows[0].value === 83 && weight.rows[0].externalId?.endsWith("/w1") === true);

  // ---- sleep: stage fan-out, night stamped at wake-up ---------------------------
  provider["sleep"] = [
    {
      name: "users/me/dataTypes/sleep/dataPoints/n1",
      sleep: {
        interval: { startTime: iso(at(23, 0, -1)), endTime: iso(at(7)) },
        summary: {
          minutesAsleep: 420,
          stagesSummary: [
            { type: "DEEP", minutes: 80 },
            { type: "REM", minutes: 90 },
            { type: "LIGHT", minutes: 250 },
            { type: "AWAKE", minutes: 20 },
          ],
        },
      },
    },
  ];
  await deliver(notification("sleep", at(23, 0, -1), at(7)));
  const hours = await countDatapoints("Sleep hours");
  const deepM = await countDatapoints("Sleep deep");
  check("sleep: duration lands in hours (420min → 7h) on the wake-up day",
    hours.count === 1 && hours.rows[0].value === 7);
  check("sleep: stage breakdown fans out to its own metrics",
    deepM.count === 1 && deepM.rows[0].value === 80 &&
      (await countDatapoints("Sleep REM")).rows[0]?.value === 90 &&
      (await countDatapoints("Sleep light")).rows[0]?.value === 250 &&
      (await countDatapoints("Sleep awake")).rows[0]?.value === 20);

  // ---- daily summary type (resting HR) ------------------------------------------
  provider["daily-resting-heart-rate"] = [
    { name: "users/me/dataTypes/dailyRestingHeartRate/dataPoints/d1", dailyRestingHeartRate: { date: todayKey, beatsPerMinute: 52 } },
  ];
  await deliver(notification("dailyRestingHeartRate", at(0), at(23)));
  const rhr = await countDatapoints("Resting heart rate");
  check("daily summaries: resting HR lands on its civil date",
    rhr.count === 1 && rhr.rows[0].value === 52);

  // ---- nutrition: facet fan-out ---------------------------------------------------
  provider["nutrition-log"] = [
    {
      name: "users/me/dataTypes/nutritionLog/dataPoints/m1",
      nutritionLog: {
        interval: { startTime: iso(at(12, 30)), endTime: iso(at(13)) },
        energy: { value: 650 },
        totalCarbohydrate: { value: 70 },
        totalFat: { value: 20 },
        nutrients: [{ nutrient: "PROTEIN", quantity: { value: 40 } }],
      },
    },
  ];
  await deliver(notification("nutritionLog", at(12), at(14)));
  check("nutrition: one log entry fans out to kcal + macro facets",
    (await countDatapoints("Calories")).rows[0]?.value === 650 &&
      (await countDatapoints("Carbs")).rows[0]?.value === 70 &&
      (await countDatapoints("Fat")).rows[0]?.value === 20 &&
      (await countDatapoints("Protein")).rows[0]?.value === 40);

  // ---- exercise: the gym-exclusion policy ------------------------------------------
  const exBody = notification("exercise", at(0), at(23));
  provider["exercise"] = [
    {
      name: "users/me/dataTypes/exercise/dataPoints/e1",
      exercise: { exerciseType: "WALKING", interval: { startTime: iso(at(18)), endTime: iso(at(18, 45)) } },
    },
    {
      name: "users/me/dataTypes/exercise/dataPoints/e2",
      exercise: { exerciseType: "STRENGTH_TRAINING", interval: { startTime: iso(at(6)), endTime: iso(at(7)) } },
    },
  ];
  const exStats = await deliver(exBody);
  const ghEvents = async () =>
    (await udb.select(events, { where: eq(events.source, "google_health") })).filter((e) => !e.archived);
  let evs = await ghEvents();
  check("exercise: a walk becomes a health Event on the calendar",
    evs.length === 1 && evs[0].title === "Walking" && evs[0].kind === "session" && evs[0].domain === "health");
  check("exercise: STRENGTH_TRAINING is EXCLUDED — never collides with manual Gym logs",
    typeof exStats === "object" && "excludedExercises" in exStats && exStats.excludedExercises === 1 &&
      evs.every((e) => e.title !== "Strength Training"));
  await deliver(exBody);
  evs = await ghEvents();
  check("exercise: redelivery creates no duplicate Events", evs.length === 1);
  provider["exercise"] = [];
  await deliver(exBody);
  evs = await ghEvents();
  check("exercise: upstream deletion archives the mirrored Event (soft-delete)",
    evs.length === 0);

  // ---- auth failure surfaces, never silently retries ------------------------------
  provider["weight"] = [];
  const badTokenBody = notification("weight", at(0), at(23));
  // break the stored refresh token by re-saving garbage
  await saveGHealthConnection(OWNER, {
    refreshToken: "1//revoked",
    refreshTokenExpiresInSeconds: 604799,
    healthUserId: "health-user-42",
    scopes: [],
  });
  const authRes = await deliver(badTokenBody);
  const { getGHealthConnection } = await import("@/lib/data/ghealth");
  const conn = await getGHealthConnection(OWNER);
  check("auth: a rejected refresh token marks the connection BROKEN (surfaced, not retried)",
    typeof authRes === "object" && "authFailed" in authRes && conn?.status === "broken");

  // ---- leave no trace ---------------------------------------------------------------
  const created = await udb.select(metrics, { where: inArray(metrics.name, specNames) });
  for (const m of created) {
    await udb.delete(metricDatapoints, and(eq(metricDatapoints.metricId, m.id), eq(metricDatapoints.source, "google_health"))!);
    if (!preMetrics.has(m.id)) {
      const left = await udb.select(metricDatapoints, { where: eq(metricDatapoints.metricId, m.id) });
      if (left.length === 0) await udb.delete(metrics, eq(metrics.id, m.id));
    }
  }
  const mirrored = await udb.select(events, { where: eq(events.source, "google_health") });
  for (const e of mirrored) await udb.delete(events, eq(events.id, e.id));
  await deleteGHealthConnection(OWNER);

  server.close();
  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
