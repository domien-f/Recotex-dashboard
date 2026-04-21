-- CreateTable
CREATE TABLE "budget_forecasts" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL DEFAULT '',
    "month" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_forecasts_month_idx" ON "budget_forecasts"("month");

-- CreateIndex
CREATE INDEX "budget_forecasts_category_idx" ON "budget_forecasts"("category");

-- CreateIndex
CREATE UNIQUE INDEX "budget_forecasts_category_subcategory_month_key" ON "budget_forecasts"("category", "subcategory", "month");
