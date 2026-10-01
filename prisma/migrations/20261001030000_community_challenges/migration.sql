ALTER TABLE "ReadingChallenge"
 ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "shareVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "isCommunityCopy" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "sourceId" UUID;
ALTER TABLE "ReadingChallenge" ADD CONSTRAINT "ReadingChallenge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ReadingChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ReadingChallenge_isPublic_createdAt_idx" ON "ReadingChallenge"("isPublic","createdAt");
CREATE INDEX "ReadingChallenge_sourceId_userId_idx" ON "ReadingChallenge"("sourceId","userId");
