import { Cloud, CloudOff } from "lucide-react";

import type { SchoolSyncState } from "./schoolApi";

const labels: Record<SchoolSyncState, string> = {
  loading: "Loading",
  saving: "Saving",
  synced: "Firebase synced",
  offline: "Local fallback",
};

export function SchoolSyncBadge({ state }: { state: SchoolSyncState }) {
  const Icon = state === "offline" ? CloudOff : Cloud;
  return (
    <span className={`school-sync-badge is-${state}`} role="status">
      <Icon size={11} />
      {labels[state]}
    </span>
  );
}
