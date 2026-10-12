// Canonical vocabularies. The DB stores these as strings (portable across SQLite/Postgres);
// everything entering the system is validated against these lists.

export const BODY_TYPES = [
  "CURTAINSIDER",
  "BOX",
  "REFRIGERATED",
  "FLATBED",
  "OPEN",
  "TANKER",
  "CONTAINER",
  "CAR_CARRIER",
  "LOWBED",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const TRUCK_TYPES = ["SEMI", "RIGID", "VAN", "ROAD_TRAIN"] as const;
export type TruckType = (typeof TRUCK_TYPES)[number];

export const TRUCK_STATUSES = [
  "AVAILABLE",
  "LOADING",
  "IN_TRANSIT",
  "UNLOADING",
  "MAINTENANCE",
  "OFFLINE",
] as const;
export type TruckStatus = (typeof TRUCK_STATUSES)[number];

export const CARGO_TYPES = [
  "GENERAL",
  "FOOD",
  "PRODUCE",
  "TEXTILES",
  "COTTON",
  "CONSTRUCTION",
  "EQUIPMENT",
  "CHEMICALS",
  "FUEL",
  "VEHICLES",
  "ELECTRONICS",
  "FURNITURE",
  "METAL",
] as const;
export type CargoType = (typeof CARGO_TYPES)[number];

export const CURRENCIES = ["USD", "UZS", "EUR", "RUB", "KZT", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PAYMENT_TERMS = [
  "PREPAID",
  "ON_LOADING",
  "ON_UNLOADING",
  "NET_7",
  "NET_14",
  "NET_30",
] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

export const ORG_ROLES = [
  "OWNER_OPERATOR",
  "FLEET_MANAGER",
  "DISPATCHER",
  "COMPANY_ADMIN",
  "BROKER",
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ACCOUNT_TYPES = [
  "TRUCK_OWNER",
  "OWNER_OPERATOR",
  "FLEET_MANAGER",
  "DISPATCHER",
  "LOGISTICS_COMPANY",
  "BROKER",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Account types that own/operate trucks — they get Fleet and can claim loads. */
export const CARRIER_ACCOUNT_TYPES: readonly AccountType[] = ["TRUCK_OWNER", "OWNER_OPERATOR", "FLEET_MANAGER", "DISPATCHER", "LOGISTICS_COMPANY"];

/** The org permission role a fresh single-member org gets for each account type. */
export const ROLE_FOR: Record<AccountType, OrgRole> = {
  TRUCK_OWNER: "OWNER_OPERATOR",
  OWNER_OPERATOR: "OWNER_OPERATOR",
  FLEET_MANAGER: "FLEET_MANAGER",
  DISPATCHER: "DISPATCHER",
  LOGISTICS_COMPANY: "COMPANY_ADMIN",
  BROKER: "BROKER",
};

export const PLANS = ["FREE", "PRO", "FLEET", "ENTERPRISE"] as const;
export type Plan = (typeof PLANS)[number];

export const QUALITY_LEVELS = ["VERIFIED", "PARTIAL", "UNVERIFIED"] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const LABELS: Record<string, string> = {
  CURTAINSIDER: "Curtainsider",
  BOX: "Box / Van",
  REFRIGERATED: "Refrigerated",
  FLATBED: "Flatbed",
  OPEN: "Open body",
  TANKER: "Tanker",
  CONTAINER: "Container",
  CAR_CARRIER: "Car carrier",
  LOWBED: "Lowbed",
  SEMI: "Semi truck",
  RIGID: "Rigid truck",
  VAN: "Van",
  ROAD_TRAIN: "Road train",
  AVAILABLE: "Available",
  LOADING: "Loading",
  IN_TRANSIT: "In transit",
  UNLOADING: "Unloading",
  MAINTENANCE: "Maintenance",
  OFFLINE: "Offline",
  PLANNED: "Planned",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  GENERAL: "General cargo",
  FOOD: "Food products",
  PRODUCE: "Fresh produce",
  TEXTILES: "Textiles",
  COTTON: "Cotton",
  CONSTRUCTION: "Construction materials",
  EQUIPMENT: "Equipment",
  CHEMICALS: "Chemicals",
  FUEL: "Fuel",
  VEHICLES: "Vehicles",
  ELECTRONICS: "Electronics",
  FURNITURE: "Furniture",
  METAL: "Metal products",
  PREPAID: "Prepaid",
  ON_LOADING: "On loading",
  ON_UNLOADING: "On unloading",
  NET_7: "Net 7 days",
  NET_14: "Net 14 days",
  NET_30: "Net 30 days",
  OWNER_OPERATOR: "Owner-operator",
  FLEET_MANAGER: "Fleet manager",
  DISPATCHER: "Dispatcher",
  COMPANY_ADMIN: "Company admin",
  TRUCK_OWNER: "Truck owner",
  LOGISTICS_COMPANY: "Logistics company",
  BROKER: "Broker",
  VERIFIED: "Verified",
  PARTIAL: "Partially verified",
  UNVERIFIED: "Unverified",
};

export const label = (code: string | null | undefined) =>
  code ? (LABELS[code] ?? code) : "—";

export function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}
