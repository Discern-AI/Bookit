CREATE TABLE "FollowedAuthor" (
  "userId" TEXT NOT NULL,
  "authorKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowedAuthor_pkey" PRIMARY KEY ("userId", "authorKey"),
  CONSTRAINT "FollowedAuthor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FollowedAuthor_userId_createdAt_idx" ON "FollowedAuthor"("userId", "createdAt");
