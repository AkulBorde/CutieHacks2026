// Plain functions, no Convex imports, so tests can import them directly.
//
// Works out where a student is from what they said on the call ("Winston
// Chung Hall, room 127"). The rule is cautious on purpose: a wrong building
// sends a responder to the wrong place, so anything unclear is left
// unmatched and the dispatcher sees the student's own words instead.
import type { Place } from "./campusPlaces";

// Words that say nothing about which building it is.
const IGNORED = new Set([
  "a", "an", "the", "of", "and", "at", "in", "on", "by", "near",
  "hall", "building", "bldg", "room", "rm", "floor", "ucr",
]);

// What people call a building when it is not its name on the map.
const NICKNAMES: [phrase: string, name: string][] = [
  ["wch", "Winston Chung Hall"],
  ["hub", "Highlander Union Building"],
  ["src", "Student Recreation Center South"],
  ["rec center", "Student Recreation Center South"],
  ["recreation center", "Student Recreation Center South"],
  ["student health", "Student Health and Counseling Center"],
  ["health center", "Student Health and Counseling Center"],
  ["bell tower", "University of California Riverside Bell Tower"],
  ["ucpd", "UC Police Department"],
  ["police department", "UC Police Department"],
  ["police station", "UC Police Department"],
  ["mse", "Materials Science and Engineering"],
  ["a i", "Aberdeen-Inverness"],
];

const ROOM_PHRASE = /\b(?:room|rm|number)\s*#?\s*([a-z]?\d{1,4}[a-z]?)\b/;
const ROOM_TOKEN = /^[a-z]?\d{2,4}[a-z]?$/;
const OWN_ROOM = /\bmy (?:own )?(?:dorm|room|bedroom|suite|apartment)\b|\bdorm room\b/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokensOf(text: string): string[] {
  return normalize(text).split(" ").filter((t) => t && !IGNORED.has(t));
}

type Indexed = { place: Place; tokens: string[] };
type Index = { entries: Indexed[]; weight: Map<string, number> };

// A word found in one building's name is worth 1; a word shared by four
// buildings ("sciences") is worth a quarter.
const indexes = new WeakMap<Place[], Index>();
function indexOf(places: Place[]): Index {
  let index = indexes.get(places);
  if (!index) {
    const entries = places.map((place) => ({
      place,
      tokens: [...new Set(tokensOf(place.name))],
    }));
    const count = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tokens) count.set(t, (count.get(t) ?? 0) + 1);
    }
    const weight = new Map([...count].map(([t, n]) => [t, 1 / n]));
    index = { entries, weight };
    indexes.set(places, index);
  }
  return index;
}

function matchPlace(text: string, places: Place[]): Place | null {
  const padded = ` ${normalize(text)} `;
  const nicknamed = new Set(
    NICKNAMES.filter(([phrase]) => padded.includes(` ${phrase} `)).map(
      ([, name]) => name,
    ),
  );
  if (nicknamed.size > 1) return null;
  if (nicknamed.size === 1) {
    const [name] = nicknamed;
    return places.find((p) => p.name === name) ?? null;
  }

  const said = new Set(tokensOf(text));
  const { entries, weight } = indexOf(places);
  const w = (t: string) => weight.get(t) ?? 0;

  // A building is in the running if every word of its name was said, or a
  // word only it has was said. A bare number never counts on its own: "1000"
  // is as likely a room as it is "Watkins 1000".
  const running = [];
  for (const { place, tokens } of entries) {
    if (tokens.length === 0) continue;
    const matched = tokens.filter((t) => said.has(t));
    const all = matched.length === tokens.length;
    const own = matched.some((t) => w(t) === 1 && !/^\d+$/.test(t));
    if (!all && !own) continue;
    const got = matched.reduce((sum, t) => sum + w(t), 0);
    const total = tokens.reduce((sum, t) => sum + w(t), 0);
    running.push({ place, matched, got, score: got / total });
  }
  running.sort((a, b) => b.score - a.score || b.got - a.got);

  const best = running[0];
  if (!best || best.score < 0.5) return null;
  // Any other building in the running has to be the same match with fewer
  // words ("Watkins Hall" inside "Watkins 1000"). Two different buildings
  // means we cannot tell which one they meant.
  const clear = running.every((r) =>
    r.matched.every((t) => best.matched.includes(t)),
  );
  const tied = running[1]?.score === best.score && running[1]?.got === best.got;
  return clear && !tied ? best.place : null;
}

// The building and room in a sentence, or null if no single campus building
// can be picked out of it.
export function resolvePlace(
  text: string,
  places: Place[],
): { place: Place; room?: string } | null {
  const lower = text.toLowerCase();
  const phrase = lower.match(ROOM_PHRASE);
  // "room 1000" is taken out before looking for a building, so the number
  // cannot be mistaken for part of a building's name.
  const place = matchPlace(phrase ? lower.replace(phrase[0], " ") : lower, places);
  if (!place) return null;

  let room = phrase?.[1];
  if (!room) {
    // "Lothian 214": a number that is not part of the building's name.
    const inName = new Set(tokensOf(place.name));
    room = tokensOf(lower).filter((t) => ROOM_TOKEN.test(t) && !inName.has(t)).pop();
  }
  return { place, room: room?.toUpperCase() };
}

export type Where = {
  buildingName: string;
  room?: string;
  lat: number;
  lng: number;
  // "stated": where the student said they are. "dorm": their registered room.
  source: "stated" | "dorm";
  // Their words, when they said where they are and it could not be matched
  // to a building. The dorm is only a fallback then, not a known position.
  unmatched?: string;
};

// Where to look for a student: where they said they are if that can be
// matched to a building, otherwise their dorm room.
export function whereIs(
  stated: string | undefined,
  dorm: Place & { room: string },
  places: Place[],
): Where {
  const atDorm: Where = {
    buildingName: dorm.name,
    room: dorm.room,
    lat: dorm.lat,
    lng: dorm.lng,
    source: "dorm",
  };
  const said = stated?.trim();
  if (!said) return atDorm;

  const found = resolvePlace(said, places);
  if (found?.place.name === dorm.name) {
    return { ...atDorm, room: found.room ?? dorm.room, source: "stated" };
  }
  if (found) {
    return {
      buildingName: found.place.name,
      room: found.room,
      lat: found.place.lat,
      lng: found.place.lng,
      source: "stated",
    };
  }
  if (OWN_ROOM.test(said.toLowerCase())) return { ...atDorm, source: "stated" };
  return { ...atDorm, unmatched: said };
}
