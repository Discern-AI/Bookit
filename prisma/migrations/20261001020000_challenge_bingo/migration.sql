ALTER TABLE "ReadingChallenge" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'count';
CREATE TABLE "ChallengeSquare" (
 "id" TEXT PRIMARY KEY, "challengeId" UUID NOT NULL, "position" INTEGER NOT NULL,
 "prompt" TEXT NOT NULL, "workId" TEXT, "version" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "ChallengeSquare_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "ReadingChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChallengeSquare_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChallengeSquare_challengeId_position_key" ON "ChallengeSquare"("challengeId","position");
CREATE UNIQUE INDEX "ChallengeSquare_challengeId_workId_key" ON "ChallengeSquare"("challengeId","workId");
