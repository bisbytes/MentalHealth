// One-time setup: creates the storage, makes notification keys, deploys the
// reminder server to Cloudflare, and writes ../threecircles/config.js.
// Run after `pnpm exec wrangler login`. Safe to run again; it keeps existing keys.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const TOML = new URL("../wrangler.toml", import.meta.url);
const CONFIG = new URL("../../threecircles/config.js", import.meta.url);
const run = (cmd, input) => execSync(cmd, { encoding: "utf8", input, stdio: [input ? "pipe" : "inherit", "pipe", "inherit"] });
const b64url = (buf) => Buffer.from(buf).toString("base64url");

let toml = readFileSync(TOML, "utf8");

if (toml.includes("REPLACE_WITH_KV_ID")) {
  console.log("Creating storage for reminder schedules…");
  const out = run("pnpm exec wrangler kv namespace create SUBS");
  const id = (out.match(/id\s*[=:]\s*"?([0-9a-f]{32})"?/) || [])[1];
  if (!id) { console.error(out); throw new Error("Couldn't read the new KV namespace id from wrangler's output."); }
  toml = toml.replace("REPLACE_WITH_KV_ID", id);
  writeFileSync(TOML, toml);
}

let newKeys = null;
if (/VAPID_PUBLIC_KEY = ""/.test(toml)) {
  console.log("Making notification keys…");
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  newKeys = { publicKey, privateJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }) };
  toml = toml.replace('VAPID_PUBLIC_KEY = ""', `VAPID_PUBLIC_KEY = "${publicKey}"`);
  writeFileSync(TOML, toml);
}

console.log("Deploying…");
const deployOut = run("pnpm exec wrangler deploy");
process.stdout.write(deployOut);
const url = (deployOut.match(/https:\/\/[\w.-]+\.workers\.dev/) || [])[0];

if (newKeys) {
  console.log("Saving the private key as a secret…");
  run("pnpm exec wrangler secret put VAPID_PRIVATE_JWK", newKeys.privateJwk);
}

const publicKey = toml.match(/VAPID_PUBLIC_KEY = "([^"]+)"/)[1];
if (url) {
  writeFileSync(CONFIG, `// Reminder server for push notifications. Written by push-server/scripts/setup.mjs.
window.THREE_CIRCLES_PUSH = {
  server: "${url}",
  publicKey: "${publicKey}"
};
`);
  console.log(`\nDone. The reminder server is at ${url}`);
  console.log("Commit and push threecircles/config.js and push-server/wrangler.toml so the app can find it.");
} else {
  console.log("\nDeployed, but I couldn't find the server address in wrangler's output.");
  console.log(`Put it in threecircles/config.js by hand, with publicKey "${publicKey}".`);
}
