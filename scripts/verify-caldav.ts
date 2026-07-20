/**
 * Apple Calendar sync verification.
 *
 * There is no way to test against real iCloud in CI (it needs a real Apple ID
 * and an app-specific password), so this stands up a LOCAL MOCK CalDAV server
 * that speaks the actual protocol — PROPFIND discovery chain, calendar-query
 * REPORT with expanded recurrences, HTTP basic auth — and points the real
 * client at it. Everything under test is the production code path: the same
 * client, the same sync, the same upsert, the same connection record.
 *
 * Covers what was asked:
 *   1. a full sync creates events correctly
 *   2. a second sync with no iCloud changes creates NO duplicates
 *   3. a revoked password surfaces the reconnect state, not a silent failure
 *   4. the read-only guarantee: no write verb exists in the client
 *
 * Leaves no trace: every event it creates is deleted at the end.
 *
 * Usage: npm run test:caldav
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

/**
 * The caldav modules are marked `server-only`, whose whole job is to explode
 * when pulled into a CLIENT bundle. This IS a server process, so the marker
 * has nothing to protect here — neutralise it by pre-seeding its module cache
 * entry, exactly as Next does for a server component. The assertions below
 * still verify the marker is present in the source, so this cannot be used to
 * quietly drop the protection.
 */
const req = createRequire(import.meta.url);
const serverOnly = req.resolve("server-only");
req.cache[serverOnly] = {
  id: serverOnly,
  filename: serverOnly,
  loaded: true,
  exports: {},
} as NodeJS.Module;

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};

// --- mock iCloud -------------------------------------------------------------

const APPLE_ID = "owner@icloud.com";
const GOOD_PASSWORD = "abcd-efgh-ijkl-mnop";

/** Flipped mid-test to simulate the owner revoking the app-specific password. */
let validPassword = GOOD_PASSWORD;
/** Every method the client issued, so we can prove it never wrote. */
const methodsSeen: string[] = [];

const ics = (uid: string, summary: string, start: string, end: string, extra = "") =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nDTSTART:${start}\r\nDTEND:${end}\r\n${extra}END:VEVENT\r\nEND:VCALENDAR`;

const icsAllDay = (uid: string, summary: string, day: string, next: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nDTSTART;VALUE=DATE:${day}\r\nDTEND;VALUE=DATE:${next}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
const inDays = (n: number, h = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, 0, 0, 0);
  return d;
};
const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/** Two calendars, so "sync ALL calendars" is actually exercised. */
const CALENDARS: Record<string, { name: string; items: string[] }> = {
  "/1234/calendars/home/": {
    name: "Home",
    items: [
      ics("evt-dentist", "Dentist", stamp(inDays(2, 9)), stamp(inDays(2, 10))),
      // a recurring series the server has already expanded into occurrences,
      // distinguished only by RECURRENCE-ID
      ics("evt-standup", "Standup", stamp(inDays(1, 9)), stamp(inDays(1, 9)),
        `RECURRENCE-ID:${stamp(inDays(1, 9))}\r\n`),
      ics("evt-standup", "Standup", stamp(inDays(2, 9)), stamp(inDays(2, 9)),
        `RECURRENCE-ID:${stamp(inDays(2, 9))}\r\n`),
    ],
  },
  "/1234/calendars/work/": {
    name: "Work",
    items: [
      icsAllDay("evt-leave", "Annual leave", ymd(inDays(5)), ymd(inDays(6))),
      ics("evt-review", "Perf review", stamp(inDays(3, 14)), stamp(inDays(3, 15))),
    ],
  },
};

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function mockServer() {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    methodsSeen.push(req.method ?? "?");

    const auth = req.headers.authorization ?? "";
    const decoded = Buffer.from(auth.replace(/^Basic\s+/i, ""), "base64").toString();
    if (decoded !== `${APPLE_ID}:${validPassword}`) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("unauthorized");
      return;
    }

    const url = req.url ?? "/";
    const send = (body: string) => {
      res.writeHead(207, { "content-type": 'application/xml; charset="utf-8"' });
      res.end(body);
    };

    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      // 1. root PROPFIND → principal
      if (req.method === "PROPFIND" && url === "/") {
        send(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>/</D:href><D:propstat><D:prop><D:current-user-principal><D:href>/1234/principal/</D:href></D:current-user-principal></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
        return;
      }
      // 2. principal PROPFIND → calendar home
      if (req.method === "PROPFIND" && url.includes("/principal")) {
        send(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:href>/1234/principal/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>/1234/calendars/</D:href></C:calendar-home-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
        return;
      }
      // 3. home PROPFIND Depth:1 → the calendar collections
      if (req.method === "PROPFIND" && url === "/1234/calendars/") {
        const entries = Object.entries(CALENDARS)
          .map(
            ([href, c]) =>
              `<D:response><D:href>${href}</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>${c.name}</D:displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
          )
          .join("");
        // include a VTODO-only list + the home itself, both of which must be skipped
        const noise =
          `<D:response><D:href>/1234/calendars/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype><D:displayname>home</D:displayname></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>` +
          `<D:response><D:href>/1234/calendars/reminders/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Reminders</D:displayname><C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
        send(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${noise}${entries}</D:multistatus>`);
        return;
      }
      // 4. calendar-query REPORT → the events
      if (req.method === "REPORT" && CALENDARS[url]) {
        const body = CALENDARS[url].items
          .map(
            (item, i) =>
              `<D:response><D:href>${url}${i}.ics</D:href><D:propstat><D:prop><D:getetag>"${i}"</D:getetag><C:calendar-data>${xmlEscape(item)}</C:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
          )
          .join("");
        send(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${body}</D:multistatus>`);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
  });
}

async function main() {
  const { closeDb, forUser } = await import("@/db");
  const { events } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { READ_METHODS } = await import("@/lib/caldav/client");
  const { syncAppleCalendar } = await import("@/lib/caldav/sync");
  const { parseVEvents } = await import("@/lib/caldav/ical");
  const { decryptSecret, encryptSecret } = await import("@/lib/secrets");
  const {
    deleteConnection, getConnection, saveConnection,
  } = await import("@/lib/data/caldav");
  const { buildExport } = await import("@/lib/backup");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { addDaysISO, todayISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const udb = forUser(OWNER);
  const mine = () =>
    udb.select(events, { where: eq(events.source, "apple_calendar") });

  // ---- 0. read-only guarantee (static) -------------------------------------
  const clientSrc = readFileSync("src/lib/caldav/client.ts", "utf8");
  for (const f of [
    "src/lib/caldav/client.ts", "src/lib/caldav/sync.ts",
    "src/lib/data/caldav.ts", "src/lib/secrets.ts",
  ]) {
    check(`boundary: ${f.split("/").pop()} is server-only`,
      readFileSync(f, "utf8").includes('import "server-only"'));
  }
  const WRITE_VERBS = ["PUT", "DELETE", "POST", "PATCH", "MKCALENDAR", "MKCOL", "MOVE", "COPY"];
  check("read-only: READ_METHODS contains no write verb",
    !READ_METHODS.some((m) => WRITE_VERBS.includes(m)), READ_METHODS.join(","));
  const offending = WRITE_VERBS.filter((v) =>
    new RegExp(`["'\`]${v}["'\`]`).test(
      // ignore the guard list that names the verbs precisely to block them
      clientSrc.replace(/const WRITE[\s\S]*?\];/g, ""),
    ),
  );
  check("read-only: no write verb appears as a method literal in client.ts",
    offending.length === 0, offending.join(","));
  check("read-only: every request funnels through the guarded dav() helper",
    (clientSrc.match(/\bfetch\(/g) ?? []).length === 1,
    `${(clientSrc.match(/\bfetch\(/g) ?? []).length} fetch call sites`);
  for (const other of ["src/lib/caldav/sync.ts", "src/lib/data/caldav.ts"]) {
    check(`read-only: ${other.split("/").pop()} makes no HTTP calls of its own`,
      !/\bfetch\(/.test(readFileSync(other, "utf8")));
  }

  // ---- 1. crypto round-trip -----------------------------------------------
  if (!process.env.CALDAV_ENCRYPTION_KEY) {
    console.error("\nCALDAV_ENCRYPTION_KEY is not set — add one to .env.local:");
    console.error("  CALDAV_ENCRYPTION_KEY=" + Buffer.from(
      Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
    ).toString("base64"));
    process.exit(2);
  }
  const sealed = encryptSecret(GOOD_PASSWORD);
  check("crypto: round-trips", decryptSecret(sealed) === GOOD_PASSWORD);
  check("crypto: ciphertext does not contain the plaintext",
    !sealed.includes(GOOD_PASSWORD));
  check("crypto: same input encrypts differently each time (random IV)",
    encryptSecret(GOOD_PASSWORD) !== encryptSecret(GOOD_PASSWORD));
  let tamperRejected = false;
  try {
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    decryptSecret(parts.join("."));
  } catch {
    tamperRejected = true;
  }
  check("crypto: tampered ciphertext is rejected, not silently garbage", tamperRejected);

  // ---- 2. iCal parsing ----------------------------------------------------
  const parsed = parseVEvents(
    ics("u1", "Timed", "20260720T090000Z", "20260720T103000Z"),
  );
  check("ical: timed event parsed with real duration",
    parsed.length === 1 && !parsed[0].allDay &&
    parsed[0].end.getTime() - parsed[0].start.getTime() === 90 * 60_000);
  const allDayParsed = parseVEvents(icsAllDay("u2", "Leave", "20260720", "20260721"));
  check("ical: DATE value is all-day", allDayParsed[0]?.allDay === true);
  check("ical: escaped text is unescaped",
    parseVEvents(ics("u3", "A\\, B\\; C", "20260720T090000Z", "20260720T100000Z"))[0]
      ?.summary === "A, B; C");
  check("ical: folded lines are unfolded",
    parseVEvents(
      "BEGIN:VEVENT\r\nUID:u4\r\nSUMMARY:Very long ti\r\n tle\r\nDTSTART:20260720T090000Z\r\nDTEND:20260720T100000Z\r\nEND:VEVENT",
    )[0]?.summary === "Very long title");
  check("ical: a malformed event is skipped, not thrown on",
    parseVEvents("BEGIN:VEVENT\r\nSUMMARY:no uid\r\nEND:VEVENT").length === 0);
  const occ = parseVEvents(
    ics("series", "S", "20260720T090000Z", "20260720T093000Z", "RECURRENCE-ID:20260720T090000Z\r\n"),
  );
  check("ical: RECURRENCE-ID joins the sync key so occurrences stay distinct",
    occ[0]?.externalId === "series::20260720T090000Z", occ[0]?.externalId);

  // ---- start the mock and connect ----------------------------------------
  const server = mockServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  await udb.delete(events, eq(events.source, "apple_calendar"));
  await deleteConnection(OWNER);
  await saveConnection(OWNER, { appleId: APPLE_ID, password: GOOD_PASSWORD, baseUrl });

  const stored = await getConnection(OWNER);
  check("connection: stored and readable", stored?.appleId === APPLE_ID);
  check("connection: public view carries no secret",
    stored !== null && !("secret" in (stored as Record<string, unknown>)));
  check("connection: starts healthy", stored?.status === "ok");

  // ---- 3. first sync creates events ---------------------------------------
  const first = await syncAppleCalendar(OWNER);
  check("sync 1: succeeded", first.ok === true,
    first.ok ? "" : `${first.reason}: ${first.message}`);
  if (!first.ok) {
    server.close();
    await closeDb();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }
  check("sync 1: discovered BOTH calendars (VTODO list + home skipped)",
    first.summary.calendars === 2, `${first.summary.calendars}`);
  check("sync 1: created every occurrence", first.summary.created === 5,
    `${first.summary.created}`);
  check("sync 1: updated nothing on a first run", first.summary.updated === 0);
  check("sync 1: no errors", first.summary.errors === 0);

  const afterFirst = await mine();
  check("sync 1: five rows in the database", afterFirst.length === 5,
    `${afterFirst.length}`);
  check("sync 1: all rows tagged source=apple_calendar",
    afterFirst.every((r) => r.source === "apple_calendar"));
  check("sync 1: every row carries an external_id",
    afterFirst.every((r) => Boolean(r.externalId)));
  check("sync 1: every row records which calendar it came from",
    afterFirst.every((r) => Boolean(r.externalCalendarId)));
  check("sync 1: the two recurring occurrences are separate rows",
    afterFirst.filter((r) => r.externalId?.startsWith("evt-standup")).length === 2);
  const dentist = afterFirst.find((r) => r.title === "Dentist");
  check("sync 1: title/start/end mapped", Boolean(dentist?.end) &&
    dentist!.end!.getTime() - dentist!.start.getTime() === 60 * 60_000);
  check("sync 1: all-day flag mapped",
    afterFirst.find((r) => r.title === "Annual leave")?.allDay === true);
  check("sync 1: timed events are not marked all-day", dentist?.allDay === false);

  // mirrored events must behave like ordinary calendar items
  const visible = await listEventsInRange(OWNER, todayISO(), addDaysISO(todayISO(), 10));
  check("sync 1: mirrored events appear on the unified calendar",
    visible.some((e) => e.title === "Dentist"));
  check("sync 1: the connection record itself never appears on the calendar",
    !visible.some((e) => e.title === "Apple Calendar connection"));

  // ---- 4. second sync must not duplicate ----------------------------------
  const second = await syncAppleCalendar(OWNER);
  check("sync 2: succeeded", second.ok === true);
  if (second.ok) {
    check("sync 2: created NOTHING (no duplicates)", second.summary.created === 0,
      `${second.summary.created}`);
    check("sync 2: updated the existing rows in place", second.summary.updated === 5,
      `${second.summary.updated}`);
  }
  const afterSecond = await mine();
  check("sync 2: still exactly five rows", afterSecond.length === 5, `${afterSecond.length}`);
  check("sync 2: row ids are unchanged (upsert, not delete+recreate)",
    JSON.stringify(afterFirst.map((r) => r.id).sort()) ===
      JSON.stringify(afterSecond.map((r) => r.id).sort()));

  // a changed title on iCloud should update, still not duplicate
  CALENDARS["/1234/calendars/home/"].items[0] = ics(
    "evt-dentist", "Dentist RESCHEDULED", stamp(inDays(4, 11)), stamp(inDays(4, 12)),
  );
  const third = await syncAppleCalendar(OWNER);
  check("sync 3: an edited iCloud event updates rather than duplicating",
    third.ok && third.summary.created === 0 && (await mine()).length === 5);
  check("sync 3: the new title landed",
    (await mine()).some((r) => r.title === "Dentist RESCHEDULED"));

  // owner-owned fields must survive a sync
  const target = (await mine()).find((r) => r.title === "Dentist RESCHEDULED")!;
  await udb.update(events, { domain: "health" }, eq(events.id, target.id));
  await syncAppleCalendar(OWNER);
  check("sync 4: an owner's re-domain is preserved across syncs",
    (await mine()).find((r) => r.id === target.id)?.domain === "health");

  // ---- 5. a revoked password surfaces the reconnect state -----------------
  validPassword = "revoked-now";
  const broken = await syncAppleCalendar(OWNER);
  check("bad password: sync reports failure rather than pretending to succeed",
    broken.ok === false && broken.reason === "auth-failed",
    broken.ok ? "reported ok" : broken.reason);
  const brokenConn = await getConnection(OWNER);
  check("bad password: connection is marked BROKEN (not silently retried)",
    brokenConn?.status === "broken", brokenConn?.status);
  check("bad password: a human-readable reason is recorded for Settings",
    Boolean(brokenConn?.lastError), brokenConn?.lastError);
  check("bad password: no events were destroyed by the failure",
    (await mine()).length === 5);

  validPassword = GOOD_PASSWORD;
  await saveConnection(OWNER, { appleId: APPLE_ID, password: GOOD_PASSWORD, baseUrl });
  const healed = await getConnection(OWNER);
  check("reconnect: saving fresh credentials clears the broken state",
    healed?.status === "ok" && !healed?.lastError);
  const afterReconnect = await syncAppleCalendar(OWNER);
  check("reconnect: syncing works again and still creates no duplicates",
    afterReconnect.ok && afterReconnect.summary.created === 0 &&
      (await mine()).length === 5);

  // ---- 6. the secret never leaves ----------------------------------------
  const dump = await buildExport();
  const dumpText = JSON.stringify(dump);
  check("backup: the encrypted secret is redacted from the export",
    !dumpText.includes('"secret"'), "found a secret field in the dump");
  check("backup: the plaintext password never appears in the export",
    !dumpText.includes(GOOD_PASSWORD));
  check("backup: the connection is still recorded (so a restore knows to reconnect)",
    dumpText.includes("secretRedacted"));

  // ---- 7. read-only, observed --------------------------------------------
  const uniqueMethods = [...new Set(methodsSeen)].sort();
  check("read-only: the server only ever saw PROPFIND/REPORT",
    uniqueMethods.every((m) => (READ_METHODS as readonly string[]).includes(m)),
    uniqueMethods.join(","));
  console.log(`      (methods observed by the mock iCloud: ${uniqueMethods.join(", ")})`);

  // ---- cleanup ------------------------------------------------------------
  await udb.delete(events, eq(events.source, "apple_calendar"));
  await deleteConnection(OWNER);
  const left = await udb.select(events, {
    where: and(eq(events.source, "apple_calendar")),
  });
  check("leave-no-trace: every synced row removed", left.length === 0);
  check("leave-no-trace: connection removed", (await getConnection(OWNER)) === null);

  server.close();
  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
