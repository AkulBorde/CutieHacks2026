// Students share their building's coordinates, so their dots would stack.
// This spreads them in a small circle around the building. The offset is
// derived from the id, so a dot stays put between renders.
const MAX_OFFSET_DEGREES = 0.0007; // roughly 75 m

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function jitter(id: string, lat: number, lng: number): [number, number] {
  const h = hash(id);
  const angle = ((h % 360) * Math.PI) / 180;
  // sqrt spreads the dots evenly over the circle instead of bunching in the middle
  const distance = Math.sqrt(((h >>> 9) % 1000) / 1000) * MAX_OFFSET_DEGREES;
  return [lat + Math.sin(angle) * distance, lng + Math.cos(angle) * distance];
}
