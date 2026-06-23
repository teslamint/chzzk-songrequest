-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH');

-- CreateTable
CREATE TABLE "Channel" (
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "ChzzkToken" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChzzkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChzzkToken_channelId_key" ON "ChzzkToken"("channelId");

-- CreateIndex
CREATE INDEX "ChzzkToken_channelId_idx" ON "ChzzkToken"("channelId");

-- AddForeignKey
ALTER TABLE "ChzzkToken" ADD CONSTRAINT "ChzzkToken_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("channelId") ON DELETE CASCADE ON UPDATE CASCADE;
