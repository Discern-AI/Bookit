CREATE TABLE "MarketplaceListing" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "makeDoAlternative" TEXT NOT NULL,
    "budgetTier" TEXT NOT NULL DEFAULT 'comfortable',
    "pricePence" INTEGER,
    "externalUrl" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceSave" (
    "userId" TEXT NOT NULL,
    "listingId" UUID NOT NULL,
    "workId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceSave_pkey" PRIMARY KEY ("userId", "listingId")
);

CREATE INDEX "MarketplaceListing_isPublished_deletedAt_updatedAt_idx" ON "MarketplaceListing"("isPublished", "deletedAt", "updatedAt");
CREATE INDEX "MarketplaceListing_userId_deletedAt_updatedAt_idx" ON "MarketplaceListing"("userId", "deletedAt", "updatedAt");
CREATE INDEX "MarketplaceListing_workId_idx" ON "MarketplaceListing"("workId");
CREATE INDEX "MarketplaceSave_workId_idx" ON "MarketplaceSave"("workId");
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketplaceSave" ADD CONSTRAINT "MarketplaceSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceSave" ADD CONSTRAINT "MarketplaceSave_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceSave" ADD CONSTRAINT "MarketplaceSave_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;
