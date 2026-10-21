-- Indexes on the foreign keys and filters the app queries by (Postgres does not index foreign keys on its own).
-- Without them every offer list joined FreightListing by a full scan, every page counted unread notifications by a full scan,
-- and every delete that cascades (offer purge, repost merge) scanned the child tables. Additive; IF NOT EXISTS keeps it re-runnable.
CREATE INDEX IF NOT EXISTS "FreightListing_offerId_idx" ON "FreightListing"("offerId");
CREATE INDEX IF NOT EXISTS "FreightOffer_brokerId_idx" ON "FreightOffer"("brokerId");
CREATE INDEX IF NOT EXISTS "FreightOffer_status_createdAt_idx" ON "FreightOffer"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Trip_orgId_status_idx" ON "Trip"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Trip_truckId_status_idx" ON "Trip"("truckId", "status");
CREATE INDEX IF NOT EXISTS "Trip_offerId_idx" ON "Trip"("offerId");
CREATE INDEX IF NOT EXISTS "Recommendation_orgId_createdAt_idx" ON "Recommendation"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "Recommendation_offerId_idx" ON "Recommendation"("offerId");
CREATE INDEX IF NOT EXISTS "Recommendation_truckId_idx" ON "Recommendation"("truckId");
CREATE INDEX IF NOT EXISTS "TruckLocation_truckId_idx" ON "TruckLocation"("truckId");
CREATE INDEX IF NOT EXISTS "Favorite_offerId_idx" ON "Favorite"("offerId");
CREATE INDEX IF NOT EXISTS "Favorite_orgId_idx" ON "Favorite"("orgId");
CREATE INDEX IF NOT EXISTS "BrokerReview_brokerId_idx" ON "BrokerReview"("brokerId");
CREATE INDEX IF NOT EXISTS "BrokerReview_orgId_idx" ON "BrokerReview"("orgId");
CREATE INDEX IF NOT EXISTS "SavedSearch_userId_idx" ON "SavedSearch"("userId");
CREATE INDEX IF NOT EXISTS "SavedSearch_orgId_idx" ON "SavedSearch"("orgId");
CREATE INDEX IF NOT EXISTS "Driver_orgId_idx" ON "Driver"("orgId");
