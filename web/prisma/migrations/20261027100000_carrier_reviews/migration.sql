-- A shipper's review of the carrier that delivered their load (one per trip). Additive.
CREATE TABLE "CarrierReview" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "carrierOrgId" TEXT NOT NULL,
    "shipperOrgId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "onTime" BOOLEAN,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarrierReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CarrierReview_tripId_key" ON "CarrierReview"("tripId");
CREATE INDEX "CarrierReview_carrierOrgId_idx" ON "CarrierReview"("carrierOrgId");
CREATE INDEX "CarrierReview_shipperOrgId_idx" ON "CarrierReview"("shipperOrgId");

ALTER TABLE "CarrierReview" ADD CONSTRAINT "CarrierReview_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarrierReview" ADD CONSTRAINT "CarrierReview_carrierOrgId_fkey" FOREIGN KEY ("carrierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarrierReview" ADD CONSTRAINT "CarrierReview_shipperOrgId_fkey" FOREIGN KEY ("shipperOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
