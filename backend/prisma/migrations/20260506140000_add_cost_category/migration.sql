-- AlterTable
ALTER TABLE "costs" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'lead_spend',
ADD COLUMN     "subcategory" TEXT;

-- CreateIndex
CREATE INDEX "costs_category_idx" ON "costs"("category");

