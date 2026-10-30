CREATE TABLE "BookshopOutcome" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "workId" TEXT,
  "shopName" TEXT NOT NULL DEFAULT '',
  "outcome" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "externalUrl" TEXT NOT NULL DEFAULT '',
  "visitedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "BookshopOutcome_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookshopOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookshopOutcome_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "BookshopOutcome_userId_deletedAt_createdAt_idx" ON "BookshopOutcome"("userId", "deletedAt", "createdAt");
CREATE INDEX "BookshopOutcome_workId_idx" ON "BookshopOutcome"("workId");
