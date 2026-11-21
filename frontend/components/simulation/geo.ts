// Owner: simulation
//
// Converts lat/lng to local scene metres. The scene's origin is the UCR Bell
// Tower. +x is east, -z is north (three.js looks down -z by default), y is up.

export const ORIGIN = { lat: 33.97366, lng: -117.32808 };

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export type LatLng = { lat: number; lng: number };

export function toScene(lat: number, lng: number): [number, number] {
  const x = (lng - ORIGIN.lng) * M_PER_DEG_LNG;
  const z = -(lat - ORIGIN.lat) * M_PER_DEG_LAT;
  return [x, z];
}

export function toLatLng(x: number, z: number): LatLng {
  return {
    lat: ORIGIN.lat - z / M_PER_DEG_LAT,
    lng: ORIGIN.lng + x / M_PER_DEG_LNG,
  };
}
