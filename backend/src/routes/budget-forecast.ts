import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.use(authenticate);

// Get all forecasts grouped by category
router.get("/", async (_req: AuthRequest, res: Response) => {
  const forecasts = await prisma.budgetForecast.findMany({
    orderBy: [{ category: "asc" }, { subcategory: "asc" }, { month: "asc" }],
  });
  res.json(forecasts);
});

// Get forecast vs actual comparison for a date range
router.get("/comparison", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const forecastWhere: any = {};
  const costWhere: any = {};

  if (dateFrom || dateTo) {
    forecastWhere.month = {};
    costWhere.date = {};
    if (dateFrom) {
      const d = new Date(dateFrom as string);
      forecastWhere.month.gte = new Date(d.getFullYear(), d.getMonth(), 1);
      costWhere.date.gte = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    if (dateTo) {
      const d = new Date(dateTo as string);
      forecastWhere.month.lte = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      costWhere.date.lte = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }
  }

  const [forecasts, costs] = await Promise.all([
    prisma.budgetForecast.findMany({ where: forecastWhere, orderBy: [{ category: "asc" }, { month: "asc" }] }),
    prisma.cost.findMany({ where: costWhere, select: { channel: true, amount: true, date: true } }),
  ]);

  // Group forecasts by month
  const forecastByMonth: Record<string, { total: number; byCategory: Record<string, number> }> = {};
  for (const f of forecasts) {
    const ym = `${f.month.getFullYear()}-${String(f.month.getMonth() + 1).padStart(2, "0")}`;
    if (!forecastByMonth[ym]) forecastByMonth[ym] = { total: 0, byCategory: {} };
    forecastByMonth[ym].total += Number(f.amount);
    forecastByMonth[ym].byCategory[f.category] = (forecastByMonth[ym].byCategory[f.category] || 0) + Number(f.amount);
  }

  // Group actual costs by month
  const actualByMonth: Record<string, number> = {};
  for (const c of costs) {
    const ym = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    actualByMonth[ym] = (actualByMonth[ym] || 0) + Number(c.amount);
  }

  // Build comparison
  const allMonths = new Set([...Object.keys(forecastByMonth), ...Object.keys(actualByMonth)]);
  const comparison = Array.from(allMonths).sort().map((month) => {
    const forecast = forecastByMonth[month]?.total || 0;
    const actual = actualByMonth[month] || 0;
    return {
      month,
      forecast,
      actual,
      variance: actual - forecast,
      variancePercent: forecast > 0 ? ((actual - forecast) / forecast) * 100 : 0,
      byCategory: forecastByMonth[month]?.byCategory || {},
    };
  });

  // Category totals
  const categoryTotals: Record<string, { forecast: number; actual: number }> = {};
  for (const f of forecasts) {
    if (!categoryTotals[f.category]) categoryTotals[f.category] = { forecast: 0, actual: 0 };
    categoryTotals[f.category].forecast += Number(f.amount);
  }

  // Map costs to forecast categories using channel-to-category mapping
  const channelCategoryMap = buildChannelCategoryMap(forecasts);
  for (const c of costs) {
    const cat = channelCategoryMap[c.channel] || "Overig";
    if (!categoryTotals[cat]) categoryTotals[cat] = { forecast: 0, actual: 0 };
    categoryTotals[cat].actual += Number(c.amount);
  }

  res.json({ comparison, categoryTotals });
});

// Get all categories (for the admin form)
router.get("/categories", async (_req: AuthRequest, res: Response) => {
  const cats = await prisma.budgetForecast.findMany({
    select: { category: true, subcategory: true },
    distinct: ["category", "subcategory"],
    orderBy: [{ category: "asc" }, { subcategory: "asc" }],
  });
  res.json(cats);
});

// Upsert forecasts for a category+subcategory across months
router.put("/", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { category, subcategory, months } = req.body as {
    category: string;
    subcategory: string | null;
    months: { month: string; amount: number }[];
  };

  if (!category || !months?.length) {
    res.status(400).json({ error: "category and months[] required" });
    return;
  }

  const sub = subcategory || "";

  const results = await Promise.all(
    months.map(({ month, amount }) => {
      const monthDate = new Date(month + "-01");
      return prisma.budgetForecast.upsert({
        where: { category_sub_month: { category, subcategory: sub, month: monthDate } },
        update: { amount },
        create: { category, subcategory: sub, month: monthDate, amount },
      });
    })
  );

  res.json(results);
});

// Bulk import (for CSV import)
router.post("/import", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { rows } = req.body as {
    rows: { category: string; subcategory: string | null; month: string; amount: number }[];
  };

  if (!rows?.length) {
    res.status(400).json({ error: "rows[] required" });
    return;
  }

  let upserted = 0;
  for (const row of rows) {
    const monthDate = new Date(row.month + "-01");
    const sub = row.subcategory || "";
    await prisma.budgetForecast.upsert({
      where: { category_sub_month: { category: row.category, subcategory: sub, month: monthDate } },
      update: { amount: row.amount },
      create: { category: row.category, subcategory: sub, month: monthDate, amount: row.amount },
    });
    upserted++;
  }

  res.json({ upserted });
});

// Delete a specific row
router.delete("/:id", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  await prisma.budgetForecast.delete({ where: { id: req.params.id as string } });
  res.json({ message: "Deleted" });
});

// Helper: map cost channels to budget categories based on subcategory names
function buildChannelCategoryMap(forecasts: { category: string; subcategory: string | null }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of forecasts) {
    if (f.subcategory) {
      // Direct subcategory name as channel
      map[f.subcategory] = f.category;
    }
  }
  // Explicit overrides for known channel names → budget categories
  map["Solvari"] = "Lead Kanalen";
  map["Red Pepper"] = "Lead Kanalen";
  map["Renocheck"] = "Lead Kanalen";
  map["PPA"] = "Lead Kanalen";
  map["META Leads"] = "Lead Kanalen";
  map["GOOGLE"] = "Lead Kanalen";
  map["Serieus Verbouwen"] = "Lead Kanalen";
  map["Bouw En Reno"] = "Beurzen";
  map["Bis Beurs"] = "Beurzen";
  map["Website"] = "Lead Kanalen";
  map["Eigen lead medewerker"] = "Lead Kanalen";
  map["Referentie (van de klant)"] = "Lead Kanalen";
  return map;
}

export default router;
