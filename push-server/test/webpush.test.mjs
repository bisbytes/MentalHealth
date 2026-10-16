import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { encryptPayload, b64urlEncode } from "../src/webpush.js";
import { slots, localTime, validSchedule } from "../src/index.js";

const require = createRequire(import.meta.url);

test("payload decrypts with an independent aes128gcm implementation", async (t) => {
  let ece;
  try { ece = require("http_ece"); } catch { t.skip("http_ece not installed"); return; }
  const { createECDH, randomBytes } = await import("node:crypto");
  const ua = createECDH("prime256v1"); ua.generateKeys();
  const auth = randomBytes(16);
  const sub = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: b64urlEncode(ua.getPublicKey()), auth: b64urlEncode(auth) } };
  const body = await encryptPayload(sub, '{"title":"Three Circles","body":"hi"}');
  const plain = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: ua, authSecret: auth });
  assert.equal(plain.toString(), '{"title":"Three Circles","body":"hi"}');
});

test("slots run from start to end inclusive", () => {
  assert.deepEqual(slots({ every: 120, start: 9, end: 21 }), [540, 660, 780, 900, 1020, 1140, 1260]);
  assert.deepEqual(slots({ every: 30, start: 9, end: 10 }), [540, 570, 600]);
});

test("local time follows the time zone", () => {
  const t = localTime(new Date("2026-10-16T23:00:00Z"), "America/Detroit");
  assert.deepEqual(t, { date: "2026-10-16", minutes: 19 * 60 });
});

test("schedule validation", () => {
  assert.ok(validSchedule({ every: 60, start: 8, end: 20, tz: "America/Chicago" }));
  assert.equal(validSchedule({ every: 7, start: 8, end: 20, tz: "UTC" }), null);
  assert.equal(validSchedule({ every: 60, start: 20, end: 8, tz: "UTC" }), null);
  assert.equal(validSchedule({ every: 60, start: 8, end: 20, tz: "Mars/Base" }), null);
});
