/*
  Warnings:

  - Changed the type of `request_from` on the `SongRequest` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "RequestFrom" AS ENUM ('CHAT', 'WEBSITE');

-- AlterTable
ALTER TABLE "SongRequest" DROP COLUMN "request_from",
ADD COLUMN     "request_from" "RequestFrom" NOT NULL;
