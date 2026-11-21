// Run with: npm test -w @rollcall/backend
import assert from "node:assert/strict";
import { test } from "node:test";
import { toE164 } from "../convex/lib/phone.ts";

test("US numbers get +1", () => {
  assert.equal(toE164("9095551234"), "+19095551234");
  assert.equal(toE164("(909) 555-1234"), "+19095551234");
  assert.equal(toE164("909.555.1234"), "+19095551234");
  assert.equal(toE164("1 909 555 1234"), "+19095551234");
  assert.equal(toE164("  +1 909-555-1234 "), "+19095551234");
});

test("international numbers keep their country code", () => {
  assert.equal(toE164("+44 20 7946 0958"), "+442079460958");
});

test("things that are not phone numbers", () => {
  assert.equal(toE164(""), null);
  assert.equal(toE164("555-1234"), null);
  assert.equal(toE164("909555123456"), null);
  assert.equal(toE164("call me maybe"), null);
  assert.equal(toE164("909-555-1234 ext 5"), null);
  assert.equal(toE164("+1234567"), null);
  assert.equal(toE164("+1234567890123456"), null);
});
