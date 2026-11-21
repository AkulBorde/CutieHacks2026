// Owner: simulation
//
// Plain data, no Convex imports: the demo roster for every UCR housing
// community. Used by simSeed.ts (to fill the database) and by the 3D campus
// (to run an offline demo when no incident is live). All names are made up
// and nobody has a phone number, so nothing here can be dialled.

export type SimHall = {
  name: string;
  lat: number;
  lng: number;
  students: number;
  wings: string[];
};

// Coordinates are the OpenStreetMap positions of each community. Names match
// the labels on the 3D campus and the halls in seed.ts. Wing letters for A-I,
// Lothian and Pentland Hills are the real ones from the Housing community maps.
export const SIM_HALLS: SimHall[] = [
  { name: "Aberdeen-Inverness", lat: 33.97838, lng: -117.3257, students: 7, wings: ["A", "B", "D", "E"] },
  { name: "Lothian", lat: 33.97595, lng: -117.32275, students: 7, wings: ["A", "B", "D", "E", "F"] },
  { name: "Pentland Hills", lat: 33.97778, lng: -117.32265, students: 6, wings: ["A", "D", "E", "H", "J", "K", "L", "M", "N", "O", "P"] },
  { name: "Dundee", lat: 33.97875, lng: -117.3244, students: 6, wings: ["A", "B"] },
  { name: "North District", lat: 33.98003, lng: -117.32684, students: 6, wings: ["A", "B"] },
  { name: "Glen Mor", lat: 33.9779, lng: -117.32008, students: 5, wings: ["1", "2"] },
  { name: "Bannockburn", lat: 33.97752, lng: -117.33254, students: 4, wings: ["V"] },
  { name: "Falkirk", lat: 33.98025, lng: -117.33226, students: 4, wings: ["F"] },
  { name: "Oban", lat: 33.97878, lng: -117.3322, students: 3, wings: ["O"] },
  { name: "Plaza", lat: 33.97833, lng: -117.3337, students: 3, wings: ["P"] },
  { name: "Stonehaven", lat: 33.9839, lng: -117.3319, students: 4, wings: ["A", "C", "F"] },
];

const FIRST = [
  "Maya", "Jordan", "Priya", "Diego", "Hana", "Marcus", "Sofia", "Ethan", "Leila", "Noah",
  "Aaliyah", "Kenji", "Isabel", "Omar", "Chloe", "Mateo", "Nadia", "Tyler", "Grace", "Andre",
  "Yuna", "Elijah", "Zara", "Lucas", "Imani", "Ravi", "Camila", "Owen", "Mei", "Gabriel",
  "Ana", "Darius", "Elena", "Kai", "Fatima", "Julian", "Serena", "Malik", "Ivy", "Rafael",
  "Tessa", "Samir", "Lucia", "Devin", "Amara", "Theo", "Nina", "Hector", "Jada", "Felix",
  "Rosa", "Arjun", "Bella", "Xavier", "Lena",
];
const LAST = [
  "Nguyen", "Garcia", "Patel", "Kim", "Johnson", "Lopez", "Chen", "Williams", "Hernandez", "Singh",
  "Martinez", "Park", "Brown", "Ramirez", "Tran", "Davis", "Flores", "Ali", "Wong", "Rivera",
  "Okafor", "Torres", "Shah", "Morales", "Lee", "Castillo", "Huang", "Reyes", "Baker", "Cruz",
];

export type SimStudent = { name: string; hall: string; room: string; accessibilityNotes?: string };

/** The made-up students for one hall, numbered from `start` across all halls. */
export function studentsFor(hall: SimHall, start: number): SimStudent[] {
  const out: SimStudent[] = [];
  for (let i = 0; i < hall.students; i++) {
    const n = start + i;
    const wing = hall.wings[i % hall.wings.length];
    const floor = 1 + (n % 4);
    out.push({
      name: `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`,
      hall: hall.name,
      room: `${wing}${floor}${String(10 + ((n * 13) % 40)).padStart(2, "0")}`,
      ...(n % 11 === 4 ? { accessibilityNotes: "Uses a wheelchair" } : {}),
    });
  }
  return out;
}

export function allSimStudents(): SimStudent[] {
  const out: SimStudent[] = [];
  let n = 0;
  for (const h of SIM_HALLS) {
    out.push(...studentsFor(h, n));
    n += h.students;
  }
  return out;
}

export const SIM_RESPONDERS = [
  { name: "Alex Moreno", role: "RA" as const, lat: 33.9781, lng: -117.3253 },
  { name: "Jamie Okafor", role: "RA" as const, lat: 33.97575, lng: -117.32235 },
  { name: "Sam Whitfield", role: "RA" as const, lat: 33.9776, lng: -117.3222 },
  { name: "Officer Dana Reyes", role: "CSO" as const, lat: 33.9743, lng: -117.3288 },
  { name: "Chris Tanaka", role: "volunteer" as const, lat: 33.9786, lng: -117.3247 },
];

// ---------- the simulated outcome mix, shared by Convex and the offline demo ----------

export type SimOutcome = "safe" | "needs_help" | "urgent" | "no_answer";

/** Deterministic 0..1 from an id, so a re-run of the demo looks the same. */
export function seeded(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Mostly safe, a few need help, one or two urgent, some never pick up.
const MIX: [SimOutcome, number][] = [
  ["safe", 72],
  ["needs_help", 12],
  ["urgent", 4],
  ["no_answer", 12],
];

export function simulatedOutcome(id: string): SimOutcome {
  const roll = seeded(id, 1) * 100;
  let acc = 0;
  for (const [o, w] of MIX) {
    acc += w;
    if (roll < acc) return o;
  }
  return "safe";
}

/** Random-looking delay between 4 and 40 seconds. */
export function simulatedDelayMs(id: string): number {
  return Math.round(4000 + seeded(id, 7) * 36000);
}

/** The answers a simulated student "gives" for an outcome. */
export function simulatedAnswers(outcome: SimOutcome, location: string, id: string) {
  const r = seeded(id, 3);
  switch (outcome) {
    case "safe":
      return { safe: true, location, injured: false, lifeThreat: false, needsHelpMoving: false };
    case "needs_help":
      return {
        safe: false,
        location,
        injured: false,
        lifeThreat: false,
        needsHelpMoving: true,
        ...(r < 0.3 ? { othersNearby: "Roommate isn't answering" } : {}),
      };
    case "urgent":
      return { safe: false, location, injured: true, lifeThreat: r < 0.5, needsHelpMoving: true };
    default:
      return undefined;
  }
}
