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

  // Group forecasts by month (only category-level rows, subcategory="" for totals)
  const forecastByMonth: Record<string, number> = {};
  for (const f of forecasts) {
    if (f.subcategory && f.subcategory !== "") continue; // skip sub-items for monthly totals
    const ym = `${f.month.getFullYear()}-${String(f.month.getMonth() + 1).padStart(2, "0")}`;
    forecastByMonth[ym] = (forecastByMonth[ym] || 0) + Number(f.amount);
  }

  // Group actual costs by month (only mapped channels)
  const actualByMonth: Record<string, number> = {};
  for (const c of costs) {
    if (!CHANNEL_TO_CATEGORY[c.channel]) continue;
    const ym = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    actualByMonth[ym] = (actualByMonth[ym] || 0) + Number(c.amount);
  }

  // Build monthly comparison
  const allMonths = new Set([...Object.keys(forecastByMonth), ...Object.keys(actualByMonth)]);
  const comparison = Array.from(allMonths).sort().map((month) => {
    const forecast = forecastByMonth[month] || 0;
    const actual = actualByMonth[month] || 0;
    return {
      month,
      forecast,
      actual,
      variance: actual - forecast,
      variancePercent: forecast > 0 ? ((actual - forecast) / forecast) * 100 : 0,
    };
  });

  // Subcategory (channel) totals — the actual per-channel breakdown
  const channelTotals: Record<string, { forecast: number; actual: number; category: string }> = {};

  // Forecasts per subcategory
  for (const f of forecasts) {
    if (!f.subcategory || f.subcategory === "") continue; // skip category totals
    const key = f.subcategory;
    if (!channelTotals[key]) channelTotals[key] = { forecast: 0, actual: 0, category: f.category };
    channelTotals[key].forecast += Number(f.amount);
  }

  // Actual costs per channel mapped to subcategory
  for (const c of costs) {
    const sub = CHANNEL_TO_SUBCATEGORY[c.channel];
    if (!sub) continue;
    if (!channelTotals[sub]) {
      channelTotals[sub] = { forecast: 0, actual: 0, category: CHANNEL_TO_CATEGORY[c.channel] || "Overig" };
    }
    channelTotals[sub].actual += Number(c.amount);
  }

  res.json({ comparison, channelTotals });
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

// Map actual cost channel names → budget subcategory names
const CHANNEL_TO_SUBCATEGORY: Record<string, string> = {
  "Solvari": "Solvari",
  "Red Pepper": "Social Ads (Meta, Tiktok, Youtube)",
  "PPA": "RedPepper PPA",
  "META Leads": "Social Ads (Meta, Tiktok, Youtube)",
  "GOOGLE": "SEA (Google/Bing zoekcampagnes)",
  "Google Leads": "SEA (Google/Bing zoekcampagnes)",
  "Renocheck": "Renocheck",
  "Serieus Verbouwen": "Serieus Verbouwen",
  "Bouw En Reno": "Bouw en Reno",
  "Bis Beurs": "BIS BEURS 2026",
  "Scopr": "Scopr",
  "TestAannemer": "TestAannemer",
};

// Map cost channel → budget category
const CHANNEL_TO_CATEGORY: Record<string, string> = {
  "Solvari": "Lead Kanalen",
  "Red Pepper": "Lead Kanalen",
  "PPA": "Lead Kanalen",
  "META Leads": "Lead Kanalen",
  "GOOGLE": "Lead Kanalen",
  "Google Leads": "Lead Kanalen",
  "Renocheck": "Lead Kanalen",
  "Serieus Verbouwen": "Lead Kanalen",
  "Scopr": "Lead Kanalen",
  "TestAannemer": "Lead Kanalen",
  "Bouw En Reno": "Beurzen",
  "Bis Beurs": "Beurzen",
};

export default router;
