// Run with: npm test -w @rollcall/backend
import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceMeters, etaMinutes } from "../convex/lib/geo.ts";
import { BANNED_PHRASES, scan } from "../convex/lib/honesty.ts";
import {
  closingLine,
  deriveStatus,
  dispatchRank,
  needsResponder,
} from "../convex/lib/status.ts";

test("deriveStatus", () => {
  assert.equal(deriveStatus({ safe: true }), "safe");
  assert.equal(deriveStatus({ safe: false }), "needs_help");
  assert.equal(deriveStatus({ safe: true, needsHelpMoving: true }), "needs_help");
  assert.equal(deriveStatus({ safe: true, injured: true }), "urgent");
  assert.equal(deriveStatus({ lifeThreat: true }), "urgent");
  // An unfinished call counts as needs help.
  assert.equal(deriveStatus({}), "needs_help");
  assert.equal(deriveStatus({ location: "Lothian 214" }), "needs_help");
});

test("who gets a responder, and in what order", () => {
  for (const status of ["urgent", "needs_help", "no_answer"]) {
    assert.equal(needsResponder(status), true);
  }
  for (const status of ["pending", "calling", "safe"]) {
    assert.equal(needsResponder(status), false);
  }
  // Someone who asked for help is never queued behind a no-answer.
  assert.ok(dispatchRank("urgent") < dispatchRank("needs_help"));
  assert.ok(dispatchRank("needs_help") < dispatchRank("no_answer"));
});

test("closing lines never promise help", () => {
  for (const status of ["safe", "needs_help", "urgent"] as const) {
    assert.deepEqual(scan(closingLine(status)), []);
  }
});

test("scan finds banned phrases", () => {
  assert.deepEqual(scan("Don't worry, help is on the way."), ["on the way", "help is"]);
  assert.deepEqual(scan("We are SENDING   someone now"), ["sending someone"]);
  assert.deepEqual(scan("I've logged what you told me."), []);
  for (const phrase of BANNED_PHRASES) {
    assert.deepEqual(scan(`ok, ${phrase}.`).includes(phrase), true);
  }
});

test("distance and eta", () => {
  const lothian = { lat: 33.9757, lng: -117.3222 };
  assert.equal(distanceMeters(lothian, lothian), 0);
  // 0.001 degrees of latitude is about 111 m anywhere on Earth.
  const north = { lat: lothian.lat + 0.001, lng: lothian.lng };
  assert.ok(Math.abs(distanceMeters(lothian, north) - 111.2) < 1);

  assert.equal(etaMinutes(0), 2);
  assert.equal(etaMinutes(80), 2);
  assert.equal(etaMinutes(81), 3);
  assert.equal(etaMinutes(400), 6);
});
