// Run with: npm test -w @rollcall/backend
import assert from "node:assert/strict";
import { test } from "node:test";
import { CAMPUS_BUILDINGS } from "../convex/lib/campusPlaces.ts";
import { resolvePlace, whereIs } from "../convex/lib/places.ts";
import { SIM_HALLS } from "../convex/lib/simData.ts";

// The same list convex/lib/campus.ts builds.
const PLACES = [
  ...SIM_HALLS.map(({ name, lat, lng }) => ({ name, lat, lng })),
  ...CAMPUS_BUILDINGS,
];
const DORM = { name: "Aberdeen-Inverness", lat: 33.9783, lng: -117.3255, room: "183" };

function resolved(text: string) {
  const found = resolvePlace(text, PLACES);
  return found ? [found.place.name, found.room] : null;
}

test("a building and room said on the call are found", () => {
  // The call that showed up at Aberdeen in testing.
  assert.deepEqual(resolved("Winston Chung Hall, room 127"), ["Winston Chung Hall", "127"]);
  assert.deepEqual(resolved("I'm in WCH 127"), ["Winston Chung Hall", "127"]);
  assert.deepEqual(resolved("Bourns A125"), ["Bourns Hall", "A125"]);
  assert.deepEqual(resolved("Lothian, room E210"), ["Lothian", "E210"]);
  assert.deepEqual(resolved("the rivera library"), ["Tomas Rivera Library", undefined]);
  assert.deepEqual(resolved("at the HUB"), ["Highlander Union Building", undefined]);
  assert.deepEqual(resolved("Pentland 214"), ["Pentland Hills", "214"]);
});

test("the longer name wins when one name sits inside another", () => {
  assert.deepEqual(resolved("Watkins Hall"), ["Watkins Hall", undefined]);
  assert.deepEqual(resolved("Watkins 1000"), ["Watkins 1000", undefined]);
  assert.deepEqual(resolved("physics 2000"), ["Physics 2000", undefined]);
  assert.deepEqual(resolved("Humanities and Social Sciences"), ["Humanities and Social Sciences", undefined]);
  assert.deepEqual(resolved("School of Medicine"), ["School of Medicine", undefined]);
});

test("a room number is not mistaken for a building", () => {
  assert.deepEqual(resolved("Bourns Hall room 1000"), ["Bourns Hall", "1000"]);
  assert.deepEqual(resolved("Bourns 1000"), ["Bourns Hall", "1000"]);
});

test("anything unclear is left unmatched", () => {
  for (const text of [
    "the library", // two libraries
    "Anderson Hall", // Anderson Hall 1 or 2
    "on the plaza by Sproul", // two different places
    "in the parking lot",
    "off campus at my parents' house",
    "at school",
    "",
  ]) {
    assert.equal(resolved(text), null, text);
  }
});

test("whereIs sends help to where the student said they are", () => {
  const where = whereIs("Winston Chung Hall, room 127", DORM, PLACES);
  assert.equal(where.source, "stated");
  assert.equal(where.buildingName, "Winston Chung Hall");
  assert.equal(where.room, "127");
  assert.notEqual(where.lat, DORM.lat);
  assert.equal(where.unmatched, undefined);
});

test("whereIs falls back to the dorm, and says when it is guessing", () => {
  // Said nothing, or never answered.
  assert.deepEqual(whereIs(undefined, DORM, PLACES), {
    buildingName: DORM.name, room: "183", lat: DORM.lat, lng: DORM.lng, source: "dorm",
  });

  // Said something we cannot place: still the dorm, with their words kept.
  const lost = whereIs("in the parking lot", DORM, PLACES);
  assert.equal(lost.source, "dorm");
  assert.equal(lost.buildingName, DORM.name);
  assert.equal(lost.unmatched, "in the parking lot");

  // "My room" is a clear answer, not a guess.
  const home = whereIs("I'm in my room", DORM, PLACES);
  assert.equal(home.source, "stated");
  assert.equal(home.room, "183");
  assert.equal(home.unmatched, undefined);

  // Their own hall keeps the database's position and their registered room.
  const own = whereIs("Aberdeen", DORM, PLACES);
  assert.deepEqual([own.source, own.lat, own.room], ["stated", DORM.lat, "183"]);
  assert.equal(whereIs("Aberdeen-Inverness room 240", DORM, PLACES).room, "240");
});
