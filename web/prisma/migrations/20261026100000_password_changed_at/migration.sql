-- When a person's password was last changed or reset; sessions signed in before it stop working. Additive.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
