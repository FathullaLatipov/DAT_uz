-- Diesel price by country (admin-editable) and a per-truck switch to use it. Additive.
ALTER TABLE "Truck" ADD COLUMN "fuelByCountry" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "FuelPrice" (
    "country" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "FuelPrice_pkey" PRIMARY KEY ("country")
);

-- Starting values are planning estimates (round numbers); an admin replaces them with current prices.
INSERT INTO "FuelPrice" ("country", "priceUsd") VALUES
  ('UZ', 0.95), ('KZ', 0.60), ('KG', 0.85), ('TJ', 1.05), ('TM', 0.30), ('RU', 0.80),
  ('BY', 0.85), ('AZ', 0.65), ('TR', 1.40), ('CN', 1.00), ('GE', 1.20), ('AM', 1.10);
