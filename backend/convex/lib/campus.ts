// Where a student is for a check: every place that puts a student on the map
// or sends a responder to them goes through `locate`, so they all agree.
import { CAMPUS_BUILDINGS, type Place } from "./campusPlaces";
import { whereIs } from "./places";
import { SIM_HALLS } from "./simData";

// Residence halls first, then the academic and service buildings.
export const CAMPUS_PLACES: Place[] = [
  ...SIM_HALLS.map(({ name, lat, lng }) => ({ name, lat, lng })),
  ...CAMPUS_BUILDINGS,
];

// Where they said they are on the call if that names a campus building,
// otherwise their dorm room. See whereIs in places.ts for the rule.
export function locate(
  check: { answers?: { location?: string } },
  student: { room: string },
  dorm: Place,
) {
  return whereIs(
    check.answers?.location,
    { name: dorm.name, lat: dorm.lat, lng: dorm.lng, room: student.room },
    CAMPUS_PLACES,
  );
}
