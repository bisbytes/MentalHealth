// Three Circles reminder server.
// Stores a push subscription with a reminder schedule, and a cron trigger
// (every 15 minutes) sends a gentle check-in notification at each scheduled time.
// It stores no check-ins, notes or names: only the push address, schedule and time zone.

import { sendPush } from "./webpush.js";

const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
const EVERY_OPTIONS = [30, 60, 120, 180, 240];
const MAX_SUBSCRIPTIONS = 20;
const BOOST_MESSAGES = [
  "Long breath out. Which circle are you in?",
  "You're not alone in this. How are you right now?",
  "Feet on the floor, shoulders down. Where are you now?",
  "Be gentle with yourself. Which circle feels closest?",
];
const MAX_BOOST_MS = 48 * 3600 * 1000;
const MESSAGES = [
  "Which circle are you in right now?",
  "A gentle pause. How are you feeling?",
  "Take a breath. Red, drive or green?",
  "Checking in with yourself for a moment.",
  "Notice how you feel, without judging it.",
];

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!cors["Access-Control-Allow-Origin"]) return json({ error: "Origin not allowed" }, 403, cors);
    if (request.method !== "POST") return json({ error: "Not found" }, 404, cors);

    const path = new URL(request.url).pathname;
    let body;
    try { body = await request.json(); } catch { return json({ error: "Expected JSON" }, 400, cors); }
    const sub = body && body.subscription;
    if (!validSubscription(sub)) return json({ error: "Invalid subscription" }, 400, cors);
    const key = "sub:" + (await sha256(sub.endpoint));

    if (path === "/subscribe") {
      const schedule = validSchedule(body.schedule);
      if (!schedule) return json({ error: "Invalid schedule" }, 400, cors);
      const existing = await env.SUBS.get(key, "json");
      if (!existing) {
        const { keys } = await env.SUBS.list({ prefix: "sub:" });
        if (keys.length >= MAX_SUBSCRIPTIONS) return json({ error: "Too many devices" }, 429, cors);
      }
      await env.SUBS.put(key, JSON.stringify({
        subscription: { endpoint: sub.endpoint, keys: sub.keys },
        ...schedule,
        last: existing ? existing.last : null,
      }));
      return json({ ok: true, slots: slots(schedule) }, 200, cors);
    }

    if (path === "/unsubscribe") {
      await env.SUBS.delete(key);
      return json({ ok: true }, 200, cors);
    }

    if (path === "/test") {
      const record = await env.SUBS.get(key, "json");
      if (!record) return json({ error: "Reminders aren't turned on for this device" }, 404, cors);
      const status = await sendPush(record.subscription, notification("This is how your reminders will look."), vapid(env));
      if (status === 404 || status === 410) await env.SUBS.delete(key);
      return json({ ok: status < 300, status }, status < 300 ? 200 : 502, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDue(env, new Date(event.scheduledTime)));
  },
};

async function sendDue(env, now) {
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    for (const { name } of page.keys) {
      const record = await env.SUBS.get(name, "json");
      if (!record) continue;
      const local = localTime(now, record.tz);
      const boosted = isBoosted(record, now);
      const slot = slots(boosted ? { ...record, every: record.boostEvery } : record).find((s) => local.minutes >= s && local.minutes < s + 15);
      if (slot === undefined) continue;
      const stamp = `${local.date} ${slot}`;
      if (record.last === stamp) continue;
      const status = await sendPush(record.subscription, notification(null, boosted), vapid(env));
      if (status === 404 || status === 410) { await env.SUBS.delete(name); continue; }
      if (status < 300) await env.SUBS.put(name, JSON.stringify({ ...record, last: stamp }));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

// Minutes after midnight for each reminder, from start hour to end hour inclusive.
function slots({ every, start, end }) {
  const out = [];
  for (let m = start * 60; m <= end * 60; m += every) out.push(m);
  return out;
}

function localTime(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Reminders come more often while the app reports a red trend. The server only
// sees the faster interval and when it ends, never the check-ins themselves.
function isBoosted(record, now) {
  return Boolean(record.boostEvery && record.boostUntil && now.getTime() < record.boostUntil);
}

function notification(body, boosted) {
  const pool = boosted ? BOOST_MESSAGES : MESSAGES;
  return JSON.stringify({
    title: "Three Circles",
    body: body || pool[Math.floor(Math.random() * pool.length)],
  });
}

function vapid(env) {
  return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), subject: env.VAPID_SUBJECT };
}

function validSubscription(sub) {
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys) return false;
  if (typeof sub.keys.p256dh !== "string" || typeof sub.keys.auth !== "string") return false;
  try {
    const url = new URL(sub.endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch { return false; }
}

function validSchedule(s) {
  if (!s) return null;
  const every = Number(s.every), start = Number(s.start), end = Number(s.end);
  if (!EVERY_OPTIONS.includes(every)) return null;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 23 || start > end) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: s.tz }); } catch { return null; }
  if (typeof s.tz !== "string") return null;
  const out = { every, start, end, tz: s.tz };
  if (s.boostEvery != null && s.boostUntil != null) {
    const boostEvery = Number(s.boostEvery), boostUntil = Number(s.boostUntil);
    const now = Date.now();
    if (!EVERY_OPTIONS.includes(boostEvery) || boostEvery > every) return null;
    if (!Number.isFinite(boostUntil) || boostUntil > now + MAX_BOOST_MS) return null;
    if (boostUntil > now) Object.assign(out, { boostEvery, boostUntil });
  }
  return out;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
  const headers = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export { slots, localTime, validSchedule, isBoosted };
