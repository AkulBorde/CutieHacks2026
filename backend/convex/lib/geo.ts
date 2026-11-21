// Plain functions, no Convex imports, so tests can import them directly.

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_METERS = 6_371_000;
const WALKING_METERS_PER_MINUTE = 80;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

// Straight-line (haversine) distance between two points.
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

// Walking time rounded up, plus 1 minute to get moving, never less than 2.
export function etaMinutes(meters: number): number {
  return Math.max(2, Math.ceil(meters / WALKING_METERS_PER_MINUTE) + 1);
}
