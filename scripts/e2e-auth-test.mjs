/**
 * E2E auth + RLS test. Exercises the real stack end to end:
 * route gating, login/logout via the HTML form endpoints, PWA surface,
 * signup lockout, and row-level security through the API gateway.
 *
 * Prereqs: local Supabase stack running, migrations + seed applied,
 * owner created (npm run auth:create-owner), dev server on APP.
 * Reads .env.local; override via APP/API/ANON_KEY/SERVICE_KEY/OWNER_ID env.
 *
 * Usage: npm run test:auth
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const APP = process.env.APP ?? "http://localhost:3000";
const API = process.env.API ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
const OWNER_ID = process.env.OWNER_ID ?? process.env.SEED_USER_ID;

for (const [name, val] of Object.entries({ API, ANON, SERVICE, EMAIL, PASSWORD, OWNER_ID })) {
  if (!val) {
    console.error(`missing ${name} — fill .env.local (see .env.example)`);
    process.exit(2);
  }
}

let pass = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
};

// --- minimal cookie jar -------------------------------------------------------
const jar = new Map();
const absorb = (res) => {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const val = pair.slice(i + 1);
    if (val === "" || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) jar.delete(name);
    else jar.set(name, val);
  }
};
const cookies = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
const app = async (path, opts = {}) => {
  const res = await fetch(APP + path, {
    redirect: "manual",
    ...opts,
    headers: { ...(opts.headers ?? {}), cookie: cookies() },
  });
  absorb(res);
  return res;
};
const isRedirect = (r) => [303, 307, 308].includes(r.status);
const loc = (r) => new URL(r.headers.get("location") ?? "/none", APP).pathname;

// 1. Route protection ----------------------------------------------------------
let r = await app("/");
check("unauthenticated / redirects to /login", isRedirect(r) && loc(r) === "/login", `status=${r.status} loc=${loc(r)}`);

r = await app("/some/other/route");
check("unknown routes also gated", isRedirect(r) && loc(r) === "/login", `status=${r.status}`);

r = await app("/login");
const loginHtml = await r.text();
check("/login renders sign-in form", r.status === 200 && loginHtml.includes('action="/auth/login"') && loginHtml.includes("LIFEOS"), `status=${r.status}`);

r = await app("/manifest.webmanifest");
check("manifest public (PWA)", r.status === 200, `status=${r.status}`);
r = await app("/icons/icon-192.png");
check("icons public (PWA)", r.status === 200, `status=${r.status}`);

// 2. Login flow ----------------------------------------------------------------
r = await app("/auth/login", { method: "POST", body: new URLSearchParams({ email: EMAIL, password: "definitely-wrong" }) });
check("wrong password bounces with error flag", r.status === 303 && (r.headers.get("location") ?? "").includes("error=credentials"), `status=${r.status} loc=${r.headers.get("location")}`);

r = await app("/");
check("still gated after failed login", isRedirect(r) && loc(r) === "/login");

r = await app("/auth/login", { method: "POST", body: new URLSearchParams({ email: EMAIL, password: PASSWORD }) });
check("correct login redirects to /", r.status === 303 && loc(r) === "/", `status=${r.status} loc=${loc(r)}`);
check("session cookies set (sb-*)", [...jar.keys()].some((k) => k.startsWith("sb-")), `cookies=${[...jar.keys()].join(",")}`);

r = await app("/");
const homeHtml = await r.text();
// The home route is the Today dashboard (renders the app shell, not the email).
check(
  "/ renders the app for signed-in owner",
  r.status === 200 && homeHtml.includes("LIFEOS") && homeHtml.includes("TODAY"),
  `status=${r.status}`,
);

r = await app("/login");
check("/login redirects home when signed in", isRedirect(r) && loc(r) === "/");

// 3. Privileges + RLS through the API gateway (PostgREST) -----------------------
const anonHeaders = { apikey: ANON, Authorization: `Bearer ${ANON}` };
let res = await fetch(`${API}/rest/v1/tasks?select=title`, { headers: anonHeaders });
check("privileges: anon read rejected outright", !res.ok, `status=${res.status}`);

res = await fetch(`${API}/rest/v1/tasks`, {
  method: "POST",
  headers: { ...anonHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ title: "anon write", domain: "personal", user_id: OWNER_ID }),
});
check("privileges: anon insert rejected", !res.ok, `status=${res.status}`);

// public signup endpoint must be off (NG1)
res = await fetch(`${API}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "intruder@example.com", password: "intruder-pass-123" }),
});
check("public signup disabled", !res.ok, `status=${res.status}`);

// owner token sees own rows
res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const ownerToken = (await res.json()).access_token;
check("owner can obtain token", Boolean(ownerToken), `status=${res.status}`);

res = await fetch(`${API}/rest/v1/tasks?select=title`, { headers: { apikey: ANON, Authorization: `Bearer ${ownerToken}` } });
let rows = res.ok ? await res.json() : null;
check("RLS: owner reads seeded tasks (6)", res.ok && rows?.length === 6, `status=${res.status} rows=${rows?.length}`);

// a second authenticated user must see nothing and must not write as the owner
res = await fetch(`${API}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "second-user@example.com", password: "second-user-pass-123", email_confirm: true }),
});
const secondUser = await res.json();
const secondOk = res.ok || secondUser.error_code === "email_exists" || secondUser.code === "email_exists";
check("admin can create a second user (test fixture)", secondOk, `status=${res.status} body=${JSON.stringify(secondUser).slice(0, 120)}`);

res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "second-user@example.com", password: "second-user-pass-123" }),
});
const secondToken = (await res.json()).access_token;
const secondHeaders = { apikey: ANON, Authorization: `Bearer ${secondToken}` };

res = await fetch(`${API}/rest/v1/tasks?select=title`, { headers: secondHeaders });
rows = res.ok ? await res.json() : null;
check("RLS: second user reads 0 of owner's rows", res.ok && rows?.length === 0, `status=${res.status} rows=${rows?.length}`);

res = await fetch(`${API}/rest/v1/tasks`, {
  method: "POST",
  headers: { ...secondHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ title: "forged", domain: "personal", user_id: OWNER_ID }),
});
check("RLS: second user cannot write rows as owner", !res.ok, `status=${res.status}`);

res = await fetch(`${API}/rest/v1/tasks?user_id=eq.${OWNER_ID}`, {
  method: "PATCH",
  headers: { ...secondHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({ title: "defaced" }),
});
rows = res.ok ? await res.json() : null;
check("RLS: second user update touches 0 rows", !res.ok || rows?.length === 0, `status=${res.status} rows=${rows?.length}`);

// 4. Logout ---------------------------------------------------------------------
r = await app("/auth/logout", { method: "POST" });
check("logout redirects to /login", r.status === 303 && loc(r) === "/login", `status=${r.status}`);

r = await app("/");
check("gated again after logout", isRedirect(r) && loc(r) === "/login", `status=${r.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
