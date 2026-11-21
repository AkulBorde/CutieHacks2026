import type { Doc } from "@rollcall/backend/convex/_generated/dataModel";

export type IncidentType = Doc<"incidents">["type"];

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  earthquake: "Earthquake",
  outage: "Power outage",
  evacuation: "Evacuation",
  air_quality: "Air quality",
};
