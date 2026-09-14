-- CreateTable
CREATE TABLE "ReaderFollow" (
    "followerId" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaderFollow_pkey" PRIMARY KEY ("followerId","readerId")
);

-- CreateIndex
CREATE INDEX "ReaderFollow_readerId_idx" ON "ReaderFollow"("readerId");

-- CreateIndex
CREATE INDEX "ReaderFollow_followerId_createdAt_idx" ON "ReaderFollow"("followerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReaderFollow" ADD CONSTRAINT "ReaderFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaderFollow" ADD CONSTRAINT "ReaderFollow_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
