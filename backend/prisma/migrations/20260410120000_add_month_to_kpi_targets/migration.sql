-- AlterTable
ALTER TABLE "kpi_targets" ADD COLUMN "month" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "kpi_targets_metric_month_key" ON "kpi_targets"("metric", "month");
