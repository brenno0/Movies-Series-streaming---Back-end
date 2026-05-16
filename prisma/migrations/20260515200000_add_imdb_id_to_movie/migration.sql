-- AlterTable
ALTER TABLE "Movie" ADD COLUMN "imdbId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Movie_imdbId_key" ON "Movie"("imdbId");
