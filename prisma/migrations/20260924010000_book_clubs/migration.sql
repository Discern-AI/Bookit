CREATE TABLE "BookClub" (
 "id" UUID PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "isPublic" BOOLEAN NOT NULL DEFAULT false,
 "inviteHash" TEXT, "version" INTEGER NOT NULL DEFAULT 0, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BookClub_inviteHash_key" ON "BookClub"("inviteHash");
CREATE INDEX "BookClub_isPublic_createdAt_idx" ON "BookClub"("isPublic","createdAt");
CREATE TABLE "BookClubMember" (
 "clubId" UUID NOT NULL REFERENCES "BookClub"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "alias" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "blocked" BOOLEAN NOT NULL DEFAULT false,
 "version" INTEGER NOT NULL DEFAULT 0, "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("clubId","userId")
);
CREATE INDEX "BookClubMember_userId_active_idx" ON "BookClubMember"("userId","active");
CREATE TABLE "BookClubReading" (
 "id" UUID PRIMARY KEY, "clubId" UUID NOT NULL REFERENCES "BookClub"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "workId" TEXT NOT NULL REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "startsOn" TIMESTAMP(3), "endsOn" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 0,
 "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BookClubReading_clubId_startsOn_idx" ON "BookClubReading"("clubId","startsOn");
CREATE INDEX "BookClubReading_workId_clubId_idx" ON "BookClubReading"("workId","clubId");
CREATE TABLE "BookClubPost" (
 "id" UUID PRIMARY KEY, "readingId" UUID NOT NULL REFERENCES "BookClubReading"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "authorAlias" TEXT NOT NULL, "body" TEXT NOT NULL, "spoilerPage" INTEGER, "version" INTEGER NOT NULL DEFAULT 0,
 "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BookClubPost_readingId_createdAt_idx" ON "BookClubPost"("readingId","createdAt");
CREATE INDEX "BookClubPost_userId_readingId_idx" ON "BookClubPost"("userId","readingId");
