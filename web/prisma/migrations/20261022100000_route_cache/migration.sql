-- Cache of truck-profile road routes from the routing service. Additive.
CREATE TABLE "RouteCache" (
    "key" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "reason" TEXT,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "tollShare" DOUBLE PRECISION,
    "path" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'ors',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RouteCache_createdAt_idx" ON "RouteCache"("createdAt");
