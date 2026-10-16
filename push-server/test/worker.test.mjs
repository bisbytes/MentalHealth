import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import worker from "../src/index.js";
import { vapidHeader, b64urlEncode, b64urlDecode } from "../src/webpush.js";

async function makeVapid() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64urlEncode(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey, jwk, verifyKey: pair.publicKey };
}

function memoryKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}

test("VAPID token verifies with the public key", async () => {
  const v = await makeVapid();
  const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", { publicKey: v.publicKey, privateJwk: v.jwk, subject: "https://example.com" });
  const [, token] = header.match(/^vapid t=([^,]+), k=/);
  const [h, c, s] = token.split(".");
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, v.verifyKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok);
  assert.equal(JSON.parse(new TextDecoder().decode(b64urlDecode(c))).aud, "https://fcm.googleapis.com");
});

test("subscribe, then cron sends once per slot", async () => {
  const v = await makeVapid();
  const env = { SUBS: memoryKV(), ALLOWED_ORIGINS: "https://mentalhealth.bisbytes.com", VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(v.jwk), VAPID_SUBJECT: "https://mentalhealth.bisbytes.com" };
  const ua = createECDH("prime256v1"); ua.generateKeys();
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/xyz", keys: { p256dh: b64urlEncode(ua.getPublicKey()), auth: b64urlEncode(randomBytes(16)) } };
  const post = (path, body, origin = "https://mentalhealth.bisbytes.com") => worker.fetch(new Request("https://w.dev" + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env);

  assert.equal((await post("/subscribe", { subscription, schedule: { every: 120, start: 9, end: 21, tz: "America/Detroit" } }, "https://evil.example")).status, 403);
  const res = await post("/subscribe", { subscription, schedule: { every: 120, start: 9, end: 21, tz: "America/Detroit" } });
  assert.equal(res.status, 200);

  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(url); return new Response(null, { status: 201 }); };
  try {
    const run = async (iso) => { let p; await worker.scheduled({ scheduledTime: Date.parse(iso) }, env, { waitUntil: (x) => { p = x; } }); await p; };
    await run("2026-10-16T15:00:00Z"); // 11:00 in Detroit, a slot
    await run("2026-10-16T15:00:30Z"); // same slot again, no repeat
    await run("2026-10-16T16:00:00Z"); // 12:00, not a slot
    await run("2026-10-17T02:00:00Z"); // 22:00, after the window
    await run("2026-10-16T17:00:00Z"); // 13:00, next slot
    assert.equal(sent.length, 2);
  } finally { globalThis.fetch = realFetch; }

  assert.equal((await post("/unsubscribe", { subscription })).status, 200);
  assert.equal(env.SUBS.m.size, 0);
});
