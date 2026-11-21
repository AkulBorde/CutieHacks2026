"use client";

// Shown to a responder after they accept: their live position, the walking
// route to the student, and the student's floor drawn on the map with their
// room highlighted. Leaflet touches `window` on import, so load this with
// next/dynamic and ssr: false.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { distanceMeters } from "@rollcall/backend/convex/lib/geo";
import { type CampusData, hallIndexOf } from "@/components/simulation/campusData";
import {
  cellForRoom,
  cellsOn,
  hallBuildingFor,
  parseRoom,
  planBuilding,
  roomLabel,
} from "@/components/simulation/floorPlan";
import { toLatLng } from "@/components/simulation/geo";

type LatLng = { lat: number; lng: number };
type Pt = [number, number];
type Route = { path: Pt[]; meters: number; minutes: number };

// Public OSRM server with a walking profile (fair-use, no key). If it is down
// we fall back to a straight dashed line so the destination is still clear.
const FOOT_ROUTER = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
// Ask for a new route only after walking this far, to go easy on the server.
const REROUTE_METERS = 20;
// A phone further than this from the student is probably not on campus
// (someone testing from home), so route from their saved spot instead.
const MAX_GPS_METERS = 5000;
// Zoom in on the floor plan once the responder is this close.
const NEAR_METERS = 60;
const ROOMS_ZOOM = 18;
const LABELS_ZOOM = 20;

async function fetchWalkingRoute(from: LatLng, to: LatLng): Promise<Route> {
  const url = `${FOOT_ROUTER}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`router ${res.status}`);
  const data = await res.json();
  const r = data.routes?.[0];
  if (!r) throw new Error("no route");
  return {
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
    path: r.geometry.coordinates.map(([lng, lat]: Pt) => [lat, lng]),
    meters: r.distance,
    minutes: Math.max(1, Math.round(r.duration / 60)),
  };
}

type Gps =
  | { state: "waiting" | "denied" | "unsupported" }
  | { state: "on"; pos: LatLng; accuracy: number };

// The phone's live position. Browsers only allow this on https or localhost.
function useGps(): Gps {
  const [gps, setGps] = useState<Gps>(() =>
    typeof navigator !== "undefined" && "geolocation" in navigator
      ? { state: "waiting" }
      : { state: "unsupported" },
  );
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) =>
        setGps({
          state: "on",
          pos: { lat: p.coords.latitude, lng: p.coords.longitude },
          accuracy: p.coords.accuracy,
        }),
      () => setGps({ state: "denied" }),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return gps;
}

type Room = {
  outline: Pt[][]; // the building's outer wall, then any courtyards
  cells: { pts: Pt[]; label: string; kind: string }[];
  target: { pts: Pt[]; center: LatLng; label: string };
  floor: number;
  floors: number;
};

const sceneToPt = ([x, z]: [number, number]): Pt => {
  const p = toLatLng(x, z);
  return [p.lat, p.lng];
};
const ringToPts = (r: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < r.length; i += 2) out.push(sceneToPt([r[i], r[i + 1]]));
  return out;
};

// The student's floor plan in lat/lng, from the same campus data and room
// layout the 3D view uses. Null until loaded, or if the hall isn't mapped.
function useRoom(buildingName: string, checkId: string, room: string) {
  const [result, setResult] = useState<Room | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/ucr/campus.json")
      .then((r) => (r.ok ? (r.json() as Promise<CampusData>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const ids = hallIndexOf(data).get(buildingName);
        if (!ids?.length) return;
        const b = data.buildings[hallBuildingFor(checkId, room, ids, data)];
        const plan = planBuilding(b, parseRoom(room)?.wing ?? "");
        const { cell, floor } = cellForRoom(plan, room);
        const center = toLatLng(cell.center[0], cell.center[1]);
        setResult({
          outline: [b.outer, ...b.holes].map(ringToPts),
          cells: cellsOn(plan, floor)
            .filter((c) => c !== cell)
            .map((c) => ({
              pts: c.corners.map(sceneToPt),
              // Short, so labels fit inside 12 ft rooms.
              label: c.kind === "bath" ? "WC" : roomLabel(plan, c, floor),
              kind: c.kind,
            })),
          target: { pts: cell.corners.map(sceneToPt), center, label: room },
          floor,
          floors: plan.floors,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [buildingName, checkId, room]);
  return result;
}

// Room outlines only make sense zoomed in; numbers only closer still.
function useZoom(initial: number) {
  const [zoom, setZoom] = useState(initial);
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  return zoom;
}

function FloorPlanLayer({ room }: { room: Room }) {
  const zoom = useZoom(17);
  return (
    <>
      <Polygon
        positions={room.outline}
        pathOptions={{ color: "#57534e", weight: 2, fillColor: "#f5f5f4", fillOpacity: 0.85 }}
      />
      {zoom >= ROOMS_ZOOM &&
        room.cells.map((c, i) => (
          <Polygon
            key={i}
            positions={c.pts}
            pathOptions={{
              color: "#78716c",
              weight: 1,
              fillColor: c.kind === "room" ? "#ffffff" : "#e7e5e4",
              fillOpacity: 1,
            }}
          >
            {zoom >= LABELS_ZOOM && c.label && (
              <Tooltip permanent direction="center" className="room-label">
                {c.label}
              </Tooltip>
            )}
          </Polygon>
        ))}
      <Polygon
        positions={room.target.pts}
        pathOptions={{ color: "#991b1b", weight: 2, fillColor: "#dc2626", fillOpacity: 0.9 }}
      >
        {/* Zoomed out: a callout. Zoomed in on the plan: just its number,
            so it doesn't cover the rooms around it. */}
        {zoom >= LABELS_ZOOM ? (
          // Keys force a fresh tooltip: Leaflet ignores class changes.
          <Tooltip key="num" permanent direction="center" className="room-label room-label-target">
            {room.target.label}
          </Tooltip>
        ) : (
          <Tooltip key="callout" permanent direction="top" offset={[0, -6]}>
            Room {room.target.label} · floor {room.floor} of {room.floors}
          </Tooltip>
        )}
      </Polygon>
    </>
  );
}

export default function RouteMap({
  from,
  to,
  checkId,
  buildingName,
  room: roomCode,
  label,
}: {
  from: LatLng; // the responder's saved location
  to: LatLng; // the building
  checkId: string;
  buildingName: string;
  room: string;
  label: string;
}) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const gps = useGps();
  const room = useRoom(buildingName, checkId, roomCode);
  const dest = room?.target.center ?? to;

  // Where the route starts: the phone if it has a fix near campus, else the
  // saved spot.
  const gpsUsable =
    gps.state === "on" && distanceMeters(gps.pos, dest) < MAX_GPS_METERS;
  const here = gpsUsable ? gps.pos : from;

  // Re-route only after moving a bit, not on every GPS tick. (Updating state
  // while rendering is React's way to derive it from a changing input.)
  const [origin, setOrigin] = useState<LatLng>(from);
  if (distanceMeters(origin, here) >= REROUTE_METERS) setOrigin(here);

  const [route, setRoute] = useState<Route | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchWalkingRoute(origin, dest)
      .then((r) => {
        if (cancelled) return;
        setRoute(r);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, dest.lat, dest.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const herePt: Pt = [here.lat, here.lng];
  const destPt: Pt = [dest.lat, dest.lng];
  // The router stops on the nearest path; finish the last few metres to the
  // room with a dashed line. Without a route, a dashed line all the way.
  const path = useMemo<Pt[]>(
    () => (route ? route.path : [herePt, destPt]),
    [route, herePt[0], herePt[1], destPt[0], destPt[1]], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const last = path[path.length - 1];

  const near = gpsUsable && distanceMeters(here, dest) < NEAR_METERS;
  const showRoute = () =>
    map?.fitBounds([herePt, ...path, destPt], {
      paddingTopLeft: [40, 80],
      paddingBottomRight: [40, 40],
    });
  // Close to the room, keep the responder's own dot in frame too.
  // The automatic jump (animate = false) is instant: the responder didn't ask
  // for it, so don't make them watch it.
  const showRoom = (animate = true) =>
    near
      ? map?.fitBounds([herePt, destPt], { padding: [40, 40], maxZoom: LABELS_ZOOM, animate })
      : map?.setView(destPt, LABELS_ZOOM, { animate });

  // Frame the whole route once it first loads, and again when GPS takes over
  // as the start. After that the responder controls the view.
  const framed = useRef<string | null>(null);
  const frameKey = `${route ? "route" : "line"}-${gpsUsable ? "gps" : "saved"}`;
  useEffect(() => {
    if (!map || framed.current === frameKey) return;
    if (!route && !failed) return;
    // Already at the building: the floor plan view below wins.
    if (near) return;
    framed.current = frameKey;
    showRoute();
  });

  // Close to the building: switch to the floor plan, once.
  const zoomedIn = useRef(false);
  useEffect(() => {
    if (near && map && !zoomedIn.current) {
      zoomedIn.current = true;
      showRoom(false);
    }
  });

  const gpsNote =
    gps.state === "on"
      ? gpsUsable
        ? `Following your location (±${Math.round(gps.accuracy)} m).`
        : "You look far from campus, so the route starts from your saved spot."
      : gps.state === "waiting"
        ? "Finding your location..."
        : "Location is off, so the route starts from your saved spot. Allow location access to follow along.";

  return (
    <div className="flex flex-col gap-2">
      <MapContainer
        ref={setMap}
        center={destPt}
        zoom={17}
        maxZoom={21}
        className="h-[60vh] min-h-[320px] w-full rounded-lg"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxNativeZoom={19}
          maxZoom={21}
        />
        {room && <FloorPlanLayer room={room} />}
        <Polyline
          positions={path}
          pathOptions={{
            color: "#2563eb",
            weight: 6,
            opacity: 0.85,
            dashArray: route ? undefined : "8 10",
          }}
        />
        {route && (
          <Polyline
            positions={[last, destPt]}
            pathOptions={{ color: "#2563eb", weight: 4, dashArray: "4 8" }}
          />
        )}
        {!room && (
          <CircleMarker
            center={destPt}
            radius={12}
            pathOptions={{ color: "#fff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {label}
            </Tooltip>
          </CircleMarker>
        )}
        {gpsUsable && gps.state === "on" && (
          <Circle
            center={herePt}
            radius={gps.accuracy}
            pathOptions={{ color: "#2563eb", weight: 1, fillOpacity: 0.12 }}
          />
        )}
        <CircleMarker
          center={herePt}
          radius={8}
          pathOptions={{
            color: "#fff",
            weight: 3,
            fillColor: gpsUsable ? "#2563eb" : "#64748b",
            fillOpacity: 1,
          }}
        >
          <Tooltip>{gpsUsable ? "You" : "Your saved location"}</Tooltip>
        </CircleMarker>
      </MapContainer>

      <div className="flex gap-2">
        <button
          onClick={() => showRoute()}
          className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium"
        >
          Whole route
        </button>
        <button
          onClick={() => showRoom()}
          className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium"
        >
          Floor plan
        </button>
      </div>

      <p className="text-sm text-zinc-600">
        {route
          ? `${Math.round(route.meters)} m walk, about ${route.minutes} min.`
          : failed
            ? "Couldn't load walking directions. The dashed line points straight to the room."
            : "Loading walking route..."}{" "}
        {gpsNote}
      </p>
      {room && (
        <p className="text-sm text-zinc-600">
          Room {room.target.label} is on floor {room.floor} of {room.floors},
          shown in red. Tap Floor plan to see the rooms around it.
        </p>
      )}
    </div>
  );
}
