CREATE TABLE "BookDiscussion" (
 "id" UUID PRIMARY KEY, "workId" TEXT NOT NULL, "userId" TEXT NOT NULL, "parentId" UUID,
 "title" TEXT NOT NULL DEFAULT '', "body" TEXT NOT NULL, "alias" TEXT NOT NULL,
 "spoilers" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 0,
 "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("parentId") REFERENCES "BookDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BookDiscussion_workId_parentId_createdAt_idx" ON "BookDiscussion"("workId","parentId","createdAt");
CREATE INDEX "BookDiscussion_userId_createdAt_idx" ON "BookDiscussion"("userId","createdAt");
CREATE TABLE "DiscussionReport" (
 "id" UUID PRIMARY KEY, "postId" UUID NOT NULL, "userId" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("postId") REFERENCES "BookDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DiscussionReport_postId_userId_key" ON "DiscussionReport"("postId","userId");
CREATE INDEX "DiscussionReport_status_createdAt_idx" ON "DiscussionReport"("status","createdAt");
