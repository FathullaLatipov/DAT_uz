-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jobTitle" TEXT;
