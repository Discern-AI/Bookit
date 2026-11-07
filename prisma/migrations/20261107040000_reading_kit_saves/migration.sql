CREATE TABLE "ReadingKitSave" (
    "kitId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReadingKitSave_pkey" PRIMARY KEY ("kitId", "userId")
);

CREATE INDEX "ReadingKitSave_userId_createdAt_idx" ON "ReadingKitSave"("userId", "createdAt");
ALTER TABLE "ReadingKitSave" ADD CONSTRAINT "ReadingKitSave_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ReadingKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingKitSave" ADD CONSTRAINT "ReadingKitSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
