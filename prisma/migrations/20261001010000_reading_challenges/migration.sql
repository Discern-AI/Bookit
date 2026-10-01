CREATE TABLE "ReadingChallenge" (
 "id" UUID PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "target" INTEGER NOT NULL, "startsOn" TEXT NOT NULL, "endsOn" TEXT NOT NULL,
 "genre" TEXT, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ReadingChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ReadingChallenge_userId_createdAt_idx" ON "ReadingChallenge"("userId", "createdAt");
