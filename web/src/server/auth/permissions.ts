export type Action =
  | "truck:write"
  | "truck:delete"
  | "trip:assign"
  | "settings:write"
  | "members:manage"
  | "billing:manage"
  | "loads:read"
  | "platform:admin";

const MATRIX: Record<string, Action[]> = {
  OWNER_OPERATOR: ["truck:write", "truck:delete", "trip:assign", "settings:write", "members:manage", "billing:manage", "loads:read"],
  COMPANY_ADMIN: ["truck:write", "truck:delete", "trip:assign", "settings:write", "members:manage", "billing:manage", "loads:read"],
  FLEET_MANAGER: ["truck:write", "truck:delete", "trip:assign", "settings:write", "loads:read"],
  DISPATCHER: ["trip:assign", "loads:read"],
  // Brokers post loads, not trucks — no truck:write/delete or trip:assign (nothing to claim with).
  BROKER: ["settings:write", "members:manage", "billing:manage", "loads:read"],
};

export function can(s: { role: string; platformRole: string }, action: Action) {
  if (action === "platform:admin") return s.platformRole === "ADMIN";
  return MATRIX[s.role]?.includes(action) ?? false;
}

/** Plan gates — prepared for monetization; nothing is charged in the MVP. */
export const PLAN_FEATURES: Record<string, { maxTrucks: number; aiMatching: boolean; alerts: boolean; teamMembers: boolean; api: boolean }> = {
  FREE: { maxTrucks: 1, aiMatching: false, alerts: false, teamMembers: false, api: false },
  PRO: { maxTrucks: 3, aiMatching: true, alerts: true, teamMembers: false, api: false },
  FLEET: { maxTrucks: 100, aiMatching: true, alerts: true, teamMembers: true, api: false },
  ENTERPRISE: { maxTrucks: 10_000, aiMatching: true, alerts: true, teamMembers: true, api: true },
};
