import test from "node:test";
import assert from "node:assert/strict";

process.env.MISSION_CONTROL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const { encryptSecret, decryptSecret } = await import("../artifacts/api-server/src/lib/security.ts");

test("encrypted secrets round-trip through the enc:v1 envelope", () => {
  const plain = "james-hermes-test-secret";
  const encrypted = encryptSecret(plain);

  assert.ok(encrypted);
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(encrypted.split(":").length, 5);
  assert.equal(decryptSecret(encrypted), plain);
});

test("plaintext legacy values remain readable", () => {
  assert.equal(decryptSecret("legacy-plaintext"), "legacy-plaintext");
});

test("malformed encrypted envelopes fail closed", () => {
  assert.throws(() => decryptSecret("enc:v1:not-valid"), /Invalid encrypted secret format/);
});
