// Owner: simulation
//
// Dev-only: the first time /sim loads without public/ucr/campus.json, the
// browser downloads UCR from OpenStreetMap and POSTs it here, and we save it
// so every later load (and the live demo) works without the internet.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ ok: false, reason: "dev only" }, { status: 403 });
  }
  const data = await request.json();
  if (!data || data.version !== 1 || !Array.isArray(data.buildings) || data.buildings.length < 50) {
    return Response.json({ ok: false, reason: "not campus data" }, { status: 400 });
  }
  const dir = path.join(process.cwd(), "public", "ucr");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "campus.json"), JSON.stringify(data));
  return Response.json({ ok: true, buildings: data.buildings.length });
}
