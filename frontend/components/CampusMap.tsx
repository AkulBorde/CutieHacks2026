"use client";

// Leaflet touches `window` on import, so this file must only load in the
// browser. page.tsx pulls it in with next/dynamic and ssr: false.
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Doc, Id } from "@rollcall/backend/convex/_generated/dataModel";

// Roughly the middle of the UCR residence halls.
const CAMPUS_CENTER: [number, number] = [33.9765, -117.3245];

export default function CampusMap({
  buildings,
  selectedIds,
  onToggle,
}: {
  buildings: Doc<"buildings">[];
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
      {/* TODO one dot per student, coloured with STATUS_COLORS from lib/status */}
    </MapContainer>
  );
}
