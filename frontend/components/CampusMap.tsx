"use client";

// Leaflet touches `window` on import, so this file must only load in the
// browser. page.tsx pulls it in with next/dynamic and ssr: false.
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Doc, Id } from "@rollcall/backend/convex/_generated/dataModel";
import { jitter } from "@/lib/jitter";
import { STATUS_COLORS, STATUS_LABELS, type CheckStatus } from "@/lib/status";

// Roughly the middle of the UCR residence halls.
const CAMPUS_CENTER: [number, number] = [33.9765, -117.3245];

// One student's check in the current incident, placed at their building.
// One row of api.checks.listForIncident.
export type StudentDot = {
  checkId: Id<"checks">;
  studentName: string;
  status: CheckStatus;
  isReal: boolean;
  lat: number;
  lng: number;
};

export default function CampusMap({
  buildings,
  students,
  selectedIds,
  onToggle,
}: {
  buildings: Doc<"buildings">[];
  students: StudentDot[];
  selectedIds: Id<"buildings">[];
  onToggle: (id: Id<"buildings">) => void;
}) {
  return (
    <MapContainer
      center={CAMPUS_CENTER}
      zoom={16}
      className="h-[480px] w-full rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {buildings.map((b) => {
        const selected = selectedIds.includes(b._id);
        return (
          <CircleMarker
            key={b._id}
            center={[b.lat, b.lng]}
            radius={selected ? 14 : 10}
            pathOptions={{
              color: selected ? "#1d4ed8" : "#3f3f46",
              fillColor: selected ? "#3b82f6" : "#a1a1aa",
              fillOpacity: 0.8,
            }}
            eventHandlers={{ click: () => onToggle(b._id) }}
          >
            <Tooltip>{b.name}</Tooltip>
          </CircleMarker>
        );
      })}
      {students.map((s) => (
        <CircleMarker
          key={s.checkId}
          center={jitter(s.checkId, s.lat, s.lng)}
          radius={5}
          // Simulated students get a hollow dot.
          pathOptions={{
            color: STATUS_COLORS[s.status],
            weight: 2,
            fillColor: STATUS_COLORS[s.status],
            fillOpacity: s.isReal ? 0.9 : 0,
          }}
        >
          <Tooltip>
            {s.studentName}: {STATUS_LABELS[s.status]}
            {s.isReal ? "" : " (simulated)"}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
