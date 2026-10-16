import { getCity } from "@/server/domain/geo";

/** English city name for server code that has no request language; components use useI18n().city. */
export const cityLabel = (id: string) => getCity(id)?.name ?? id;

// Translated display pieces live in parts-shared.tsx (client components that read the language).
export { CountryTag, Freshness, LoadCard, QualityBadge, RouteLabel, Sources } from "./parts-shared";
