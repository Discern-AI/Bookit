CREATE TABLE "CardProject" (
 "id" UUID NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "format" TEXT NOT NULL, "theme" TEXT NOT NULL,
 "caption" TEXT NOT NULL DEFAULT '', "quote" TEXT NOT NULL DEFAULT '',
 "reference" TEXT NOT NULL DEFAULT '', "heading" TEXT NOT NULL DEFAULT '',
 "includeByline" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 1,
 "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CardProject_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CardProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "CardProjectBook" (
 "projectId" UUID NOT NULL, "workId" TEXT NOT NULL, "editionId" TEXT NOT NULL, "position" INTEGER NOT NULL,
 CONSTRAINT "CardProjectBook_pkey" PRIMARY KEY ("projectId", "workId"),
 CONSTRAINT "CardProjectBook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CardProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "CardProjectBook_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CardProject_userId_deletedAt_updatedAt_idx" ON "CardProject"("userId", "deletedAt", "updatedAt");
CREATE UNIQUE INDEX "CardProjectBook_projectId_position_key" ON "CardProjectBook"("projectId", "position");
CREATE INDEX "CardProjectBook_workId_idx" ON "CardProjectBook"("workId");
