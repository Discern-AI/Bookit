ALTER TABLE "BookDiscussion" ADD COLUMN "communityId" TEXT;
CREATE INDEX "BookDiscussion_communityId_parentId_createdAt_idx" ON "BookDiscussion"("communityId", "parentId", "createdAt");
