-- CreateTable
CREATE TABLE "TripPoint" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripPoint_tripId_at_idx" ON "TripPoint"("tripId", "at");

-- AddForeignKey
ALTER TABLE "TripPoint" ADD CONSTRAINT "TripPoint_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
