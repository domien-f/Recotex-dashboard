import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  const { channel, type, dateFrom, dateTo } = req.query;

  const where: any = {};
  if (channel) where.channel = channel;
  if (type) where.type = type;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom as string);
    if (dateTo) where.date.lte = new Date(dateTo as string);
  }

  const costs = await prisma.cost.findMany({
    where,
    orderBy: { date: "desc" },
    include: { invoice: { select: { filename: true, vendor: true } } },
  });

  res.json(costs);
});

router.get("/summary", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const where: any = {};
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom as string);
    if (dateTo) where.date.lte = new Date(dateTo as string);
  }

  const [byChannel, byType, total, leadSpendTotal, algemeenTotal, hasEstimated] = await Promise.all([
    prisma.cost.groupBy({ by: ["channel"], where, _sum: { amount: true } }),
    prisma.cost.groupBy({ by: ["type"], where, _sum: { amount: true } }),
    prisma.cost.aggregate({ where, _sum: { amount: true } }),
    prisma.cost.aggregate({ where: { ...where, category: "lead_spend" }, _sum: { amount: true } }),
    prisma.cost.aggregate({ where: { ...where, category: "algemeen" }, _sum: { amount: true } }),
    prisma.cost.count({ where: { ...where, isEstimated: true } }),
  ]);

  res.json({
    total: total._sum.amount || 0,
    leadSpendTotal: leadSpendTotal._sum.amount || 0,
    algemeenTotal: algemeenTotal._sum.amount || 0,
    hasEstimatedCosts: hasEstimated > 0,
    estimatedCount: hasEstimated,
    byChannel: byChannel.map((c) => ({ channel: c.channel, amount: c._sum.amount || 0 })),
    byType: byType.map((t) => ({ type: t.type, amount: t._sum.amount || 0 })),
  });
});

// Create or update manual cost
router.post("/", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { channel, amount, date, type, description, source } = req.body;

  if (!channel || amount === undefined || !date || !type) {
    res.status(400).json({ error: "channel, amount, date, and type are required" });
    return;
  }

  const cost = await prisma.cost.create({
    data: {
      channel,
      amount,
      date: new Date(date),
      type,
      description,
      source: source || "manual",
    },
  });

  res.status(201).json(cost);
});

// Upsert cost for a channel/month (for manual entry grid)
router.put("/channel-month", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { channel, month, amount, description } = req.body;

  if (!channel || !month || amount === undefined) {
    res.status(400).json({ error: "channel, month (YYYY-MM), and amount are required" });
    return;
  }

  const [year, m] = month.split("-").map(Number);
  const monthStart = new Date(year, m - 1, 1);
  const monthEnd = new Date(year, m, 1);

  // Find existing manual cost for this channel/month
  const existing = await prisma.cost.findFirst({
    where: {
      channel,
      source: "manual",
      date: { gte: monthStart, lt: monthEnd },
    },
  });

  if (existing) {
    if (amount === 0 || amount === null) {
      // Delete if amount is 0
      await prisma.cost.delete({ where: { id: existing.id } });
      res.json({ message: "Deleted", id: existing.id });
    } else {
      const updated = await prisma.cost.update({
        where: { id: existing.id },
        data: { amount, description, source: "manual" },
      });
      res.json(updated);
    }
  } else if (amount > 0) {
    const cost = await prisma.cost.create({
      data: {
        channel,
        amount,
        date: monthStart,
        type: "MANUAL",
        description: description || `${channel} ${month}`,
        source: "manual",
      },
    });
    res.json(cost);
  } else {
    res.json({ message: "Nothing to save" });
  }
});

// Delete a cost
router.delete("/:id", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  await prisma.cost.delete({ where: { id: req.params.id as string } });
  res.json({ message: "Kost verwijderd" });
});

// Lead-spend status matrix: channel × month — only category=lead_spend rows
router.get("/status-matrix", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  // Get all channels that have deals (excluding non-lead sources)
  const EXCLUDED_HERKOMST = ["EXTRA WERKEN"];
  const dealChannels = await prisma.deal.groupBy({
    by: ["herkomst"],
    where: { herkomst: { notIn: EXCLUDED_HERKOMST } },
    _count: true,
    orderBy: { _count: { herkomst: "desc" } },
  });

  const channels = dealChannels
    .filter((d) => d.herkomst)
    .map((d) => d.herkomst!);

  // Get lead-spend costs only (algemeen rows live in their own matrix)
  const costWhere: any = { category: "lead_spend" };
  if (dateFrom || dateTo) {
    costWhere.date = {};
    if (dateFrom) costWhere.date.gte = new Date(dateFrom as string);
    if (dateTo) costWhere.date.lte = new Date(dateTo as string);
  }

  const costs = await prisma.cost.findMany({
    where: costWhere,
    select: { channel: true, amount: true, date: true, source: true, updatedAt: true, type: true },
    orderBy: { date: "asc" },
  });

  // Build matrix
  const matrix: Record<string, Record<string, {
    amount: number;
    source: string | null;
    updatedAt: string | null;
    type: string;
  }>> = {};

  for (const ch of channels) {
    matrix[ch] = {};
  }

  for (const c of costs) {
    const month = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    if (!matrix[c.channel]) matrix[c.channel] = {};
    matrix[c.channel][month] = {
      amount: Number(c.amount),
      source: c.source,
      updatedAt: c.updatedAt?.toISOString() || null,
      type: c.type,
    };
  }

  // Generate months in range
  const start = dateFrom ? new Date(dateFrom as string) : new Date("2025-09-01");
  const end = dateTo ? new Date(dateTo as string) : new Date();
  const months: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }

  res.json({ channels, months, matrix });
});

// ─── Algemeen kosten matrix (overhead — non-lead-spend) ────────────────────
// Keyed on (category, subcategory) instead of channel. Returns the same
// shape as status-matrix so the frontend can reuse the same renderer.
router.get("/algemeen-matrix", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const costWhere: any = { category: "algemeen" };
  if (dateFrom || dateTo) {
    costWhere.date = {};
    if (dateFrom) costWhere.date.gte = new Date(dateFrom as string);
    if (dateTo) costWhere.date.lte = new Date(dateTo as string);
  }

  // Pull all algemene cost rows + all algemene budget rows so we can show
  // every line item that exists in either source — even rows where no actual
  // cost has been logged yet (those still appear with a budget but empty cells).
  const [costs, budgetRows] = await Promise.all([
    prisma.cost.findMany({
      where: costWhere,
      select: { channel: true, category: true, subcategory: true, amount: true, date: true, source: true, updatedAt: true, type: true, description: true },
      orderBy: { date: "asc" },
    }),
    prisma.budgetForecast.findMany({
      where: {
        category: { notIn: ["Lead Kanalen"] },          // algemeen = anything that isn't lead spend
        subcategory: { not: "" },                        // skip category headers
      },
      select: { category: true, subcategory: true, month: true, amount: true },
    }),
  ]);

  // Map: "Category — Subcategory" → row key (so the matrix renders one row per line item)
  const rowKey = (c: string, s: string | null) => `${c} — ${s || "(geen subcategorie)"}`;
  const lineItems = new Set<string>();
  const lineMeta = new Map<string, { category: string; subcategory: string }>();

  for (const b of budgetRows) {
    const k = rowKey(b.category, b.subcategory);
    lineItems.add(k);
    if (!lineMeta.has(k)) lineMeta.set(k, { category: b.category, subcategory: b.subcategory });
  }
  for (const c of costs) {
    const k = rowKey(c.category, c.subcategory);
    lineItems.add(k);
    if (!lineMeta.has(k)) lineMeta.set(k, { category: c.category, subcategory: c.subcategory || "" });
  }

  // Generate months in range
  const start = dateFrom ? new Date(dateFrom as string) : new Date("2025-09-01");
  const end = dateTo ? new Date(dateTo as string) : new Date();
  const months: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }

  // Build matrix with budget + actual cells
  const matrix: Record<string, Record<string, {
    amount: number;
    budget: number | null;
    source: string | null;
    updatedAt: string | null;
    type: string;
  }>> = {};

  for (const k of lineItems) {
    matrix[k] = {};
  }

  // Lay down budget values
  for (const b of budgetRows) {
    const k = rowKey(b.category, b.subcategory);
    const m = `${b.month.getFullYear()}-${String(b.month.getMonth() + 1).padStart(2, "0")}`;
    if (!matrix[k][m]) matrix[k][m] = { amount: 0, budget: Number(b.amount), source: null, updatedAt: null, type: "MANUAL" };
    else matrix[k][m].budget = Number(b.amount);
  }

  // Overlay actual costs
  for (const c of costs) {
    const k = rowKey(c.category, c.subcategory);
    const m = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    if (!matrix[k][m]) matrix[k][m] = { amount: 0, budget: null, source: null, updatedAt: null, type: c.type };
    matrix[k][m].amount += Number(c.amount);
    matrix[k][m].source = c.source;
    matrix[k][m].updatedAt = c.updatedAt?.toISOString() || null;
    matrix[k][m].type = c.type;
  }

  // Sort line items: by category first (alpha), then subcategory
  const sortedLineItems = Array.from(lineItems).sort((a, b) => {
    const ma = lineMeta.get(a)!;
    const mb = lineMeta.get(b)!;
    if (ma.category !== mb.category) return ma.category.localeCompare(mb.category);
    return ma.subcategory.localeCompare(mb.subcategory);
  });

  res.json({
    lineItems: sortedLineItems,
    lineMeta: Object.fromEntries(lineMeta),
    months,
    matrix,
  });
});

// Upsert algemeen cost for a (category, subcategory, month) cell — manual entry
router.put("/category-month", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { category, subcategory, month, amount, description } = req.body as {
    category: string;
    subcategory?: string | null;
    month: string;
    amount: number | null;
    description?: string;
  };

  if (!category || !month || amount === undefined) {
    res.status(400).json({ error: "category, month (YYYY-MM), and amount are required" });
    return;
  }

  const sub = subcategory || "";
  const [year, m] = month.split("-").map(Number);
  const monthStart = new Date(year, m - 1, 1);
  const monthEnd = new Date(year, m, 1);

  // Find existing manual algemeen cost for this (category, subcategory, month)
  const existing = await prisma.cost.findFirst({
    where: {
      category: "algemeen",
      subcategory: sub,
      channel: sub || category,                          // see channel convention below
      source: "manual",
      date: { gte: monthStart, lt: monthEnd },
    },
  });

  if (existing) {
    if (amount === 0 || amount === null) {
      await prisma.cost.delete({ where: { id: existing.id } });
      res.json({ message: "Deleted", id: existing.id });
      return;
    }
    const updated = await prisma.cost.update({
      where: { id: existing.id },
      data: { amount, description, source: "manual" },
    });
    res.json(updated);
    return;
  }

  if (amount && amount !== 0) {
    // For algemene kosten the `channel` field has no real meaning; we mirror
    // the subcategory there so existing channel-based queries still work
    // (they filter by category=algemeen elsewhere when relevant).
    const cost = await prisma.cost.create({
      data: {
        channel: sub || category,
        category: "algemeen",
        subcategory: sub,
        amount,
        date: monthStart,
        type: "MANUAL",
        description: description || `${category}${sub ? " — " + sub : ""} · ${month}`,
        source: "manual",
      },
    });
    res.json(cost);
    return;
  }

  res.json({ message: "Nothing to save" });
});

export default router;
