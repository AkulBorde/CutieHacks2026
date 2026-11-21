// Owner: simulation
//
// Dev-only: downloads UCR's published floor maps into public/ucr/floorplans/
// so the 3D cutaway can show the real plan, and the demo works offline:
//  - classroom maps from https://classrooms.ucr.edu/
//  - residence hall community maps and room plans from https://housing.ucr.edu/
// Open http://localhost:3000/api/sim/floorplans once while `npm run dev` runs.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://classrooms.ucr.edu/sites/g/files/rcwecm5746/files";
// Residence halls: Housing Services community maps (PDF) and double-room plans.
const HOUSING: Record<string, string> = {
  "ai-community.pdf": "http://auxiliarydocs.ucr.edu/housing/map/community-map_AI.pdf",
  "lo-community.pdf": "http://auxiliarydocs.ucr.edu/housing/map/community-map_LO.pdf",
  "ph-community.pdf": "http://auxiliarydocs.ucr.edu/housing/map/community-map_PH.pdf",
  "ai-double.jpg": "https://housing.ucr.edu/sites/default/files/ai-double.jpg",
  "lothian-double.jpg": "https://housing.ucr.edu/sites/g/files/rcwecm2301/files/lothian-double.jpg",
};

const PLANS: Record<string, string> = {
  dundee: "https://classrooms.ucr.edu/sites/default/files/2023-12/DUNDEE-FFP.-UPDATEDpng%20%281%29.png",
  "north-district": "https://classrooms.ucr.edu/sites/default/files/2023-11/nd-updated_1.png",
  pierce: `${BASE}/2021-07/piercefloormap.png`,
  bourns: `${BASE}/2021-06/bourns.png`,
  watkins: `${BASE}/2021-07/watkins.png`,
  sproul: `${BASE}/2021-07/sproulfloormap.png`,
  olmsted: `${BASE}/2021-09/olmsted.png`,
  physics: `${BASE}/2021-09/physics.png`,
  boyce: `${BASE}/2021-06/boyce.png`,
  chung: `${BASE}/2021-06/chung.png`,
  mse: `${BASE}/2021-06/mse.png`,
  skye: `${BASE}/2021-07/skye.png`,
  spieth: `${BASE}/2021-07/spieth.png`,
  unlh: `${BASE}/2021-07/unlh.png`,
  ssc: "https://classrooms.ucr.edu/sites/default/files/2023-11/3-ssc-ffp.png",
  hmnss: `${BASE}/2021-06/hmnss.png`,
  "life-sciences": `${BASE}/2021-06/lifesciencesWhite.png`,
  "chass-north": `${BASE}/2021-06/chassN.png`,
  "chass-south": `${BASE}/2021-06/ints.png`,
};

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ ok: false, reason: "dev only" }, { status: 403 });
  }
  const dir = path.join(process.cwd(), "public", "ucr", "floorplans");
  await mkdir(dir, { recursive: true });
  const results: Record<string, string> = {};
  await Promise.all(
    [...Object.entries(PLANS).map(([k, u]) => [`${k}.png`, u]), ...Object.entries(HOUSING)].map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        await writeFile(path.join(dir, key), Buffer.from(await res.arrayBuffer()));
        results[key] = "saved";
      } catch (e) {
        results[key] = `failed: ${e}`;
      }
    }),
  );
  return Response.json({ ok: true, dir: "public/ucr/floorplans", results });
}
