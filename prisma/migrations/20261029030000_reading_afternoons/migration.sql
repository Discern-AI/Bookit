CREATE TABLE "ReadingAfternoon" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "workId" TEXT,
  "kitId" UUID,
  "date" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "place" TEXT NOT NULL,
  "weather" TEXT NOT NULL,
  "pace" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'planned',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ReadingAfternoon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReadingAfternoon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReadingAfternoon_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReadingAfternoon_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ReadingKit"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ReadingAfternoon_userId_deletedAt_date_idx" ON "ReadingAfternoon"("userId", "deletedAt", "date");
