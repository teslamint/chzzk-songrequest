-- CreateEnum
CREATE TYPE "SongService" AS ENUM ('YOUTUBE', 'SOUNDCLOUD');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'PLAYING', 'FINISHED');

-- CreateTable
CREATE TABLE "SongRequest" (
    "id" CHAR(16) NOT NULL,
    "service" "SongService" NOT NULL,
    "url" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "play_time" INTEGER NOT NULL,
    "channel_id" TEXT NOT NULL,
    "request_from" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongRequest_channel_id_idx" ON "SongRequest"("channel_id");

-- CreateIndex
CREATE INDEX "SongRequest_requested_by_idx" ON "SongRequest"("requested_by");

-- CreateIndex
CREATE UNIQUE INDEX "SongRequest_channel_id_url_key" ON "SongRequest"("channel_id", "url");
