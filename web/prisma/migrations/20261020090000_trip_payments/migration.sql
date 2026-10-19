-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "shipperPaidAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "disputeNote" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "remindCount" INTEGER NOT NULL DEFAULT 0;
