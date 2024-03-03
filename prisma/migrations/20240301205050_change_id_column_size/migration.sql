/*
  Warnings:

  - The primary key for the `SongRequest` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "SongRequest" DROP CONSTRAINT "SongRequest_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id");
