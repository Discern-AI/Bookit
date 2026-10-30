CREATE TABLE "ReadingKit" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "makeDo" TEXT NOT NULL DEFAULT '',
  "budgetTier" TEXT NOT NULL DEFAULT 'comfortable',
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReadingKit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReadingKit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ReadingKit_userId_deletedAt_updatedAt_idx" ON "ReadingKit"("userId", "deletedAt", "updatedAt");
CREATE INDEX "ReadingKit_isPublic_deletedAt_updatedAt_idx" ON "ReadingKit"("isPublic", "deletedAt", "updatedAt");
CREATE TABLE "ReadingKitEntry" (
  "kitId" UUID NOT NULL,
  "workId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "ReadingKitEntry_pkey" PRIMARY KEY ("kitId", "workId"),
  CONSTRAINT "ReadingKitEntry_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ReadingKit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReadingKitEntry_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReadingKitEntry_kitId_position_key" ON "ReadingKitEntry"("kitId", "position");
CREATE INDEX "ReadingKitEntry_workId_idx" ON "ReadingKitEntry"("workId");
