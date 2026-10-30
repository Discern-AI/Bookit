ALTER TABLE "VideoProject" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VideoProject" ADD COLUMN "publicDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VideoProject" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "VideoProject" ADD COLUMN "publicModerationStatus" TEXT NOT NULL DEFAULT 'active';
CREATE INDEX "VideoProject_isPublic_publicModerationStatus_publishedAt_idx" ON "VideoProject"("isPublic", "publicModerationStatus", "publishedAt");
