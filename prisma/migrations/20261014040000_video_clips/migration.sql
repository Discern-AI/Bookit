CREATE TABLE "VideoClip" (
 "id" UUID NOT NULL, "projectId" UUID NOT NULL, "mimeType" TEXT NOT NULL,
 "data" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "VideoClip_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VideoClip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VideoClip_projectId_key" ON "VideoClip"("projectId");
