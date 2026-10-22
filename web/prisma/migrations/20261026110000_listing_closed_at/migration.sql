-- A source listing that was reported gone (the Telegram ad was deleted, edited to "taken", or answered "взяли").
-- The row stays, so a new ad from the same source is never merged into the closed load. Additive.
ALTER TABLE "FreightListing" ADD COLUMN "closedAt" TIMESTAMP(3);
