ALTER TABLE "ReadingKit" ADD COLUMN "creatorEssay" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReadingKit" ADD COLUMN "playlistUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReadingKit" ADD COLUMN "suggestedOrder" TEXT NOT NULL DEFAULT '';

CREATE TABLE "ReadingKitItem" (
    "kitId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "externalUrl" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ReadingKitItem_pkey" PRIMARY KEY ("kitId", "position")
);

ALTER TABLE "ReadingKitItem" ADD CONSTRAINT "ReadingKitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ReadingKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
