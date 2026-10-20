-- Drivers on board (1 or a team of 2): drives the driving-hours part of the trip time. Additive.
ALTER TABLE "Truck" ADD COLUMN "crew" INTEGER NOT NULL DEFAULT 1;
