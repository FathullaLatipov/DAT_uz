import type { BodyType, CargoType, Currency, PaymentTerm, QualityLevel } from "../domain/enums";

/**
 * What an adapter extracts from its source — still in the source's vocabulary
 * ("Ташкент", "Тент", "20 т", "руб"). The shared normalizer turns it into a NormalizedOffer.
 */
export interface ParsedListing {
  externalId: string;
  sourceUrl?: string;
  origin: string;
  originCountry?: string;
  destination: string;
  destinationCountry?: string;
  loadingDate: string | Date;
  unloadingDate?: string | Date | null;
  cargo?: string;
  weight?: number | string; // "20 t", "20000", 20000
  weightUnit?: string;
  volume?: number | string;
  bodyType?: string;
  truckType?: string;
  rate?: number | string | null;
  currency?: string;
  paymentTerms?: string;
  broker?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  packaging?: string;
  requirements?: string[];
  postedAt?: string | Date;
  expiresAt?: string | Date;
  raw: unknown;
}

export interface NormalizedOffer {
  externalId: string;
  sourceUrl?: string;
  originCityId: string;
  destCityId: string;
  originCountry: string;
  destCountry: string;
  loadingDate: Date;
  unloadingDate: Date | null;
  cargoType: CargoType;
  weightKg: number;
  volumeM3: number | null;
  bodyType: BodyType;
  truckType: string | null;
  distanceKm: number;
  rate: number | null;
  currency: Currency | null;
  rateUsd: number | null;
  paymentTerms: PaymentTerm | null;
  brokerName: string | null;
  brokerKey: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  packaging: string | null;
  requirements: string[];
  postedAt: Date | null;
  expiresAt: Date;
}

export type IssueSeverity = "REJECT" | "WARN";
export interface QualityIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
}

export interface NormalizeResult {
  offer: NormalizedOffer | null;
  issues: QualityIssue[];
  quality: QualityLevel;
}

export type SourceKind = "API" | "FEED" | "MANUAL" | "DEMO" | "PARTNER" | "PLATFORM";

export interface SourceDescriptor {
  id: string;
  name: string;
  kind: SourceKind;
  isDemo: boolean;
  homepage?: string;
  /** Legal/technical status of automated access. Shown in the admin panel. */
  accessNotes: string;
}

export interface FreightSourceAdapter {
  descriptor: SourceDescriptor;
  /** False until credentials / a partner agreement exist. Unconfigured adapters never fetch. */
  isConfigured(): boolean;
  fetch(): Promise<ParsedListing[]>;
}
