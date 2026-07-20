/**
 * Minimal iCalendar (RFC 5545) reader — only what a one-way calendar mirror
 * needs: VEVENT summary, start, end, all-day flag, UID and RECURRENCE-ID.
 *
 * Deliberately NOT a general parser and deliberately not recurrence-aware:
 * the CalDAV query asks the server to EXPAND recurrences into concrete
 * instances (see client.ts), so every VEVENT that reaches here is already a
 * single dated occurrence. That keeps RRULE/EXDATE/RDATE arithmetic — the
 * part everyone gets wrong — on Apple's side rather than ours.
 *
 * Pure functions over strings; no I/O.
 */

export type VEvent = {
  uid: string;
  /** UID plus RECURRENCE-ID when present: the stable per-OCCURRENCE key. */
  externalId: string;
  summary: string;
  start: Date;
  /** Exclusive end. Always present — derived from DTEND, DURATION, or a default. */
  end: Date;
  allDay: boolean;
  cancelled: boolean;
};

type Line = { name: string; params: Record<string, string>; value: string };

/** Undo RFC 5545 line folding: CRLF (or LF) followed by a space or tab. */
export const unfold = (text: string): string => text.replace(/\r?\n[ \t]/g, "");

/** Unescape a TEXT value: \\ \; \, \N \n. */
const unescapeText = (v: string): string =>
  v.replace(/\\([\\;,nN])/g, (_, c: string) =>
    c === "n" || c === "N" ? "\n" : c,
  );

function parseLine(raw: string): Line | null {
  const colon = raw.indexOf(":");
  if (colon === -1) return null;
  const left = raw.slice(0, colon);
  const value = raw.slice(colon + 1);
  const [name, ...paramParts] = left.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * Offset (ms) of a zone at a given UTC instant. Uses the platform tz database
 * via Intl rather than shipping one: format the instant in the zone, read the
 * wall-clock back, and difference them.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUTC - utcMs;
}

/**
 * Interpret a wall-clock reading as an instant in `timeZone`. Two passes
 * because the offset itself depends on the instant (DST): guess with the
 * offset at the naive instant, then correct.
 */
function fromZonedWallClock(wall: number, timeZone: string): Date {
  let guess = wall - zoneOffsetMs(wall, timeZone);
  guess = wall - zoneOffsetMs(guess, timeZone);
  return new Date(guess);
}

/** Parse DTSTART/DTEND into an instant + whether it is a date-only value. */
export function parseDateValue(
  line: Line,
): { date: Date; dateOnly: boolean } | null {
  const v = line.value.trim();
  const dateOnly = line.params.VALUE === "DATE" || /^\d{8}$/.test(v);

  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "0", mi = "0", ss = "0", z] = m;

  if (dateOnly) {
    // An all-day value has no time zone; anchor it to local midnight so it
    // lands on the intended calendar day for the person reading it.
    return { date: new Date(Number(y), Number(mo) - 1, Number(d)), dateOnly: true };
  }

  const wall = Date.UTC(
    Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss),
  );
  if (z) return { date: new Date(wall), dateOnly: false }; // explicit UTC

  const tzid = line.params.TZID;
  if (tzid) {
    try {
      return { date: fromZonedWallClock(wall, tzid), dateOnly: false };
    } catch {
      // unknown zone id — fall through to floating
    }
  }
  // Floating time: means "same wall clock wherever you are" → local.
  return {
    date: new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss)),
    dateOnly: false,
  };
}

/** RFC 5545 DURATION (e.g. "PT1H30M", "P2D") → milliseconds. */
export function parseDuration(v: string): number | null {
  const m = v
    .trim()
    .match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    (Number(w ?? 0) * 604800 + Number(d ?? 0) * 86400 +
      Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

const DEFAULT_MS = 60 * 60 * 1000; // an event with neither DTEND nor DURATION

/** Every VEVENT in an iCalendar document. Malformed events are skipped, not
 * thrown on — one bad event must never abort a whole calendar's sync. */
export function parseVEvents(ics: string): VEvent[] {
  const text = unfold(ics);
  const out: VEvent[] = [];

  const blocks = text.split(/BEGIN:VEVENT/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0];
    const lines = body
      .split(/\r?\n/)
      .map((l) => parseLine(l.trim()))
      .filter((l): l is Line => l !== null);

    const get = (name: string) => lines.find((l) => l.name === name);

    const uid = get("UID")?.value.trim();
    const dtstart = get("DTSTART");
    if (!uid || !dtstart) continue; // not a usable occurrence

    const startParsed = parseDateValue(dtstart);
    if (!startParsed) continue;

    const dtend = get("DTEND");
    const duration = get("DURATION");
    let end: Date;
    if (dtend) {
      end = parseDateValue(dtend)?.date ?? new Date(startParsed.date.getTime() + DEFAULT_MS);
    } else if (duration) {
      const ms = parseDuration(duration.value);
      end = new Date(startParsed.date.getTime() + (ms && ms > 0 ? ms : DEFAULT_MS));
    } else if (startParsed.dateOnly) {
      end = new Date(startParsed.date.getTime() + 86_400_000); // one whole day
    } else {
      end = new Date(startParsed.date.getTime() + DEFAULT_MS);
    }
    if (end.getTime() <= startParsed.date.getTime()) {
      end = new Date(startParsed.date.getTime() + DEFAULT_MS);
    }

    // A recurring series expands to many VEVENTs sharing one UID; RECURRENCE-ID
    // is what distinguishes the occurrences, so it belongs in the sync key.
    const recurrenceId = get("RECURRENCE-ID")?.value.trim();

    out.push({
      uid,
      externalId: recurrenceId ? `${uid}::${recurrenceId}` : uid,
      summary: unescapeText(get("SUMMARY")?.value ?? "").trim() || "(untitled)",
      start: startParsed.date,
      end,
      allDay: startParsed.dateOnly,
      cancelled: (get("STATUS")?.value ?? "").trim().toUpperCase() === "CANCELLED",
    });
  }

  return out;
}
