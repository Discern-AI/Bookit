CREATE TABLE "VideoProjectReport" (
  "id" TEXT NOT NULL,
  "projectId" UUID NOT NULL,
  "reporterId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "publicDescription" TEXT NOT NULL,
  "linkedWorkIds" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decisionVersion" INTEGER,
  "note" TEXT NOT NULL DEFAULT '',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoProjectReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoProjectReport_projectId_reporterId_version_key" ON "VideoProjectReport"("projectId", "reporterId", "version");
CREATE INDEX "VideoProjectReport_status_createdAt_idx" ON "VideoProjectReport"("status", "createdAt");

ALTER TABLE "VideoProjectReport" ADD CONSTRAINT "VideoProjectReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoProjectReport" ADD CONSTRAINT "VideoProjectReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
