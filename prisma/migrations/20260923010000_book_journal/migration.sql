ALTER TABLE "User" ADD COLUMN "showUpNext" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserBook" ADD COLUMN "shelfPinned" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "BookEntry" (
  "id" UUID NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "workId" TEXT,
  "kind" TEXT NOT NULL, "role" TEXT, "conversationId" UUID,
  "text" TEXT NOT NULL, "url" TEXT, "version" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookEntry_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookEntry_kind_check" CHECK ("kind" IN ('note','link','chat'))
);
CREATE INDEX "BookEntry_userId_workId_createdAt_idx" ON "BookEntry"("userId","workId","createdAt");
CREATE INDEX "BookEntry_userId_conversationId_createdAt_idx" ON "BookEntry"("userId","conversationId","createdAt");
