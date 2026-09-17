CREATE TABLE "ReadingCycle" (
 "id" TEXT NOT NULL PRIMARY KEY, "userBookId" TEXT NOT NULL, "number" INTEGER NOT NULL,
 "isCurrent" BOOLEAN NOT NULL DEFAULT true, "dateStarted" TIMESTAMP(3), "dateFinished" TIMESTAMP(3),
 "version" INTEGER NOT NULL DEFAULT 0, "requestId" TEXT,
 CONSTRAINT "ReadingCycle_userBookId_fkey" FOREIGN KEY ("userBookId") REFERENCES "UserBook"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReadingCycle_userBookId_number_key" ON "ReadingCycle"("userBookId","number");
CREATE UNIQUE INDEX "ReadingCycle_requestId_key" ON "ReadingCycle"("requestId");
CREATE UNIQUE INDEX "ReadingCycle_one_current" ON "ReadingCycle"("userBookId") WHERE "isCurrent" = true;
ALTER TABLE "ReadingSession" ADD COLUMN "cycleId" TEXT;
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReadingCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "ReadingCycle" ("id","userBookId","number","dateStarted","dateFinished") SELECT 'legacy_' || "id", "id", 1, "dateStarted", "dateFinished" FROM "UserBook";
UPDATE "ReadingSession" SET "cycleId" = 'legacy_' || "userBookId";
