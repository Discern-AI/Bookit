CREATE TABLE "VideoProject" (
 "id" UUID NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "platform" TEXT NOT NULL DEFAULT 'other', "status" TEXT NOT NULL DEFAULT 'idea',
 "script" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '', "publishedUrl" TEXT NOT NULL DEFAULT '',
 "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VideoProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "VideoProjectBook" (
 "projectId" UUID NOT NULL, "workId" TEXT NOT NULL, "position" INTEGER NOT NULL,
 CONSTRAINT "VideoProjectBook_pkey" PRIMARY KEY ("projectId", "workId"),
 CONSTRAINT "VideoProjectBook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "VideoProjectBook_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VideoProject_userId_deletedAt_updatedAt_idx" ON "VideoProject"("userId", "deletedAt", "updatedAt");
CREATE UNIQUE INDEX "VideoProjectBook_projectId_position_key" ON "VideoProjectBook"("projectId", "position");
CREATE INDEX "VideoProjectBook_workId_idx" ON "VideoProjectBook"("workId");
