-- AlterTable
ALTER TABLE "BrokerReview" ADD COLUMN     "tripId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BrokerReview_tripId_key" ON "BrokerReview"("tripId");

-- AddForeignKey
ALTER TABLE "BrokerReview" ADD CONSTRAINT "BrokerReview_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
