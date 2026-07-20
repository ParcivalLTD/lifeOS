import "server-only";

import { parseVEvents, type VEvent } from "./ical";

/**
 * Read-only CalDAV client for iCloud (RFC 4791).
 *
 * ── READ-ONLY GUARANTEE ───────────────────────────────────────────────────
 * Helm mirrors iCloud; it never writes back. That is enforced structurally,
 * not by convention:
 *
 *   1. EVERY request in this file goes through `dav()`.
 *   2. `dav()` accepts only the methods in READ_METHODS and throws on
 *      anything else, so a future edit that tries PUT/DELETE/MKCALENDAR/POST
 *      fails at runtime instead of silently mutating the user's calendar.
 *   3. `scripts/verify-caldav.ts` greps this file for write verbs and asserts
 *      READ_METHODS contains no mutating method.
 *
 * Adding a write path means deliberately defeating all three.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** The only HTTP methods this integration may ever issue. */
export const READ_METHODS = ["PROPFIND", "REPORT", "GET"] as const;
type ReadMethod = (typeof READ_METHODS)[number];

export const ICLOUD_CALDAV_URL = "https://caldav.icloud.com";

/** Auth was rejected — the app-specific password was revoked or changed. */
export class CalDavAuthError extends Error {
  constructor(message = "iCloud rejected the Apple ID or app-specific password") {
    super(message);
    this.name = "CalDavAuthError";
  }
}

export class CalDavError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalDavError";
  }
}

export type CalDavCredentials = {
  appleId: string;
  /** App-specific password, already decrypted. Never logged. */
  password: string;
  /** Overridable for tests; defaults to iCloud. */
  baseUrl?: string;
};

export type RemoteCalendar = {
  /** Absolute URL of the calendar collection. */
  url: string;
  displayName: string;
};

// --- transport ---------------------------------------------------------------

async function dav(
  creds: CalDavCredentials,
  method: ReadMethod,
  url: string,
  opts: { body?: string; depth?: "0" | "1"; contentType?: string } = {},
): Promise<{ status: number; text: string }> {
  // The read-only gate. Do not weaken.
  if (!READ_METHODS.includes(method)) {
    throw new CalDavError(`blocked non-read CalDAV method: ${method}`);
  }

  const auth = Buffer.from(`${creds.appleId}:${creds.password}`).toString("base64");
  const headers: Record<string, string> = {
    authorization: `Basic ${auth}`,
    "user-agent": "Helm/0.1 (personal calendar mirror)",
  };
  if (opts.depth) headers.depth = opts.depth;
  if (opts.body) headers["content-type"] = opts.contentType ?? 'application/xml; charset="utf-8"';

  const res = await fetch(url, { method, headers, body: opts.body, redirect: "follow" });
  const text = await res.text();

  if (res.status === 401 || res.status === 403) throw new CalDavAuthError();
  if (res.status >= 400) {
    throw new CalDavError(`CalDAV ${method} ${url} failed: ${res.status}`);
  }
  return { status: res.status, text };
}

// --- tolerant XML helpers ----------------------------------------------------
// CalDAV replies are namespace-heavy (D:, C:, cs:…) and otherwise simple, so
// we strip prefixes and pull out the few elements we need rather than pulling
// in an XML parser dependency.

const stripNs = (xml: string): string => xml.replace(/<(\/?)[a-zA-Z0-9_.-]+:/g, "<$1");

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const responses = (xml: string): string[] =>
  [...stripNs(xml).matchAll(/<response[\s>][\s\S]*?<\/response>/gi)].map((m) => m[0]);

const tagText = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1].trim()) : null;
};

const hasTag = (xml: string, tag: string): boolean =>
  new RegExp(`<${tag}[\\s/>]`, "i").test(xml);

const absolute = (base: string, href: string): string =>
  href.startsWith("http") ? href : new URL(href, base).toString();

// --- discovery ---------------------------------------------------------------

const PROP = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><prop>${inner}</prop></propfind>`;

/**
 * Walk iCloud's discovery chain: root → current-user-principal →
 * calendar-home-set. iCloud puts the account under a numeric principal path,
 * so this cannot be hard-coded.
 */
async function calendarHome(creds: CalDavCredentials, baseUrl: string): Promise<string> {
  const root = await dav(creds, "PROPFIND", `${baseUrl}/`, {
    depth: "0",
    body: PROP("<current-user-principal/>"),
  });
  // the href INSIDE <current-user-principal>, not the response's own href
  const principalHref = tagText(
    stripNs(root.text).match(
      /<current-user-principal>[\s\S]*?<\/current-user-principal>/i,
    )?.[0] ?? "",
    "href",
  );
  if (!principalHref) throw new CalDavError("could not discover the iCloud principal");

  const principalUrl = absolute(baseUrl, principalHref);
  const home = await dav(creds, "PROPFIND", principalUrl, {
    depth: "0",
    body: PROP("<c:calendar-home-set/>"),
  });
  const homeHref = tagText(
    stripNs(home.text).match(/<calendar-home-set>[\s\S]*?<\/calendar-home-set>/i)?.[0] ?? "",
    "href",
  );
  if (!homeHref) throw new CalDavError("could not discover the iCloud calendar home");
  return absolute(baseUrl, homeHref);
}

/** Every calendar collection on the account that holds events. */
export async function listCalendars(creds: CalDavCredentials): Promise<RemoteCalendar[]> {
  const baseUrl = creds.baseUrl ?? ICLOUD_CALDAV_URL;
  const home = await calendarHome(creds, baseUrl);

  const res = await dav(creds, "PROPFIND", home, {
    depth: "1",
    body: PROP(
      "<resourcetype/><displayname/><c:supported-calendar-component-set/>",
    ),
  });

  const out: RemoteCalendar[] = [];
  for (const r of responses(res.text)) {
    if (!hasTag(r, "calendar")) continue; // resourcetype must include <calendar>
    // Skip collections that exist but hold no events (e.g. VTODO-only lists).
    const comps = r.match(/<comp\b[^>]*name="([^"]+)"/gi) ?? [];
    if (comps.length > 0 && !comps.some((c) => /name="VEVENT"/i.test(c))) continue;

    const href = tagText(r, "href");
    if (!href) continue;
    const url = absolute(baseUrl, href);
    if (url.replace(/\/$/, "") === home.replace(/\/$/, "")) continue; // the home itself

    out.push({ url, displayName: tagText(r, "displayname") || "Calendar" });
  }
  return out;
}

// --- events ------------------------------------------------------------------

const icalTime = (d: Date): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;

/**
 * Occurrences in [from, to) from one calendar.
 *
 * `<expand>` asks the SERVER to flatten recurring series into concrete dated
 * instances, so we never interpret RRULE/EXDATE ourselves — each returned
 * VEVENT is one occurrence, keyed by UID + RECURRENCE-ID.
 */
export async function listEvents(
  creds: CalDavCredentials,
  calendarUrl: string,
  from: Date,
  to: Date,
): Promise<VEvent[]> {
  const range = `<c:time-range start="${icalTime(from)}" end="${icalTime(to)}"/>`;
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<c:calendar-query xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
    `<prop><getetag/><c:calendar-data><c:expand start="${icalTime(from)}" end="${icalTime(to)}"/></c:calendar-data></prop>` +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">${range}</c:comp-filter></c:comp-filter></c:filter>` +
    `</c:calendar-query>`;

  const res = await dav(creds, "REPORT", calendarUrl, { depth: "1", body });

  const out: VEvent[] = [];
  for (const r of responses(res.text)) {
    const data = tagText(r, "calendar-data");
    if (data) out.push(...parseVEvents(data));
  }
  return out;
}

/**
 * Cheapest possible credential check: if discovery succeeds the Apple ID and
 * app-specific password are still valid. Throws CalDavAuthError if not.
 */
export async function verifyCredentials(creds: CalDavCredentials): Promise<number> {
  const calendars = await listCalendars(creds);
  return calendars.length;
}
