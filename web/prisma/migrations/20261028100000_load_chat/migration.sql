-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "carrierOrgId" TEXT NOT NULL,
    "shipperOrgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "carrierReadAt" TIMESTAMP(3),
    "shipperReadAt" TIMESTAMP(3),

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderOrgId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatThread_carrierOrgId_lastMessageAt_idx" ON "ChatThread"("carrierOrgId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatThread_shipperOrgId_lastMessageAt_idx" ON "ChatThread"("shipperOrgId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_offerId_carrierOrgId_shipperOrgId_key" ON "ChatThread"("offerId", "carrierOrgId", "shipperOrgId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "FreightOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_carrierOrgId_fkey" FOREIGN KEY ("carrierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_shipperOrgId_fkey" FOREIGN KEY ("shipperOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

