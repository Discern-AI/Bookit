ALTER TABLE "ReadingKit" ADD COLUMN "publicDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReadingKit" ADD COLUMN "publicModerationStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "ReadingKit" ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE TABLE "ReadingKitReport" (
    "id" TEXT NOT NULL,
    "kitId" UUID NOT NULL,
    "reporterId" TEXT NOT NULL,
    "kitVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "publicDescription" TEXT NOT NULL,
    "publicContent" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decisionVersion" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReadingKitReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadingKitReport_kitId_reporterId_kitVersion_key" ON "ReadingKitReport"("kitId", "reporterId", "kitVersion");
CREATE INDEX "ReadingKitReport_status_createdAt_idx" ON "ReadingKitReport"("status", "createdAt");
ALTER TABLE "ReadingKitReport" ADD CONSTRAINT "ReadingKitReport_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ReadingKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingKitReport" ADD CONSTRAINT "ReadingKitReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
