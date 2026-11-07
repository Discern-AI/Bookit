ALTER TABLE "MarketplaceListing" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'active';

CREATE TABLE "MarketplaceReport" (
    "id" TEXT NOT NULL,
    "listingId" UUID NOT NULL,
    "reporterId" TEXT NOT NULL,
    "listingVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "makeDoAlternative" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "budgetTier" TEXT NOT NULL,
    "workId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decisionVersion" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceReport_listingId_reporterId_listingVersion_key" ON "MarketplaceReport"("listingId", "reporterId", "listingVersion");
CREATE INDEX "MarketplaceReport_status_createdAt_idx" ON "MarketplaceReport"("status", "createdAt");
ALTER TABLE "MarketplaceReport" ADD CONSTRAINT "MarketplaceReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReport" ADD CONSTRAINT "MarketplaceReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
