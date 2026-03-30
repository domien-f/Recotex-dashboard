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

  const [byChannel, byType, total, hasEstimated] = await Promise.all([
    prisma.cost.groupBy({ by: ["channel"], where, _sum: { amount: true } }),
    prisma.cost.groupBy({ by: ["type"], where, _sum: { amount: true } }),
    prisma.cost.aggregate({ where, _sum: { amount: true } }),
    prisma.cost.count({ where: { ...where, isEstimated: true } }),
  ]);

  res.json({
    total: total._sum.amount || 0,
    hasEstimatedCosts: hasEstimated > 0,
    estimatedCount: hasEstimated,
    byChannel: byChannel.map((c) => ({ channel: c.channel, amount: c._sum.amount || 0 })),
    byType: byType.map((t) => ({ type: t.type, amount: t._sum.amount || 0 })),
  });
});

// Create or update manual cost
router.post("/", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
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
router.put("/channel-month", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
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
router.delete("/:id", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  await prisma.cost.delete({ where: { id: req.params.id as string } });
  res.json({ message: "Kost verwijderd" });
});

// Status matrix: per channel per month
router.get("/status-matrix", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  // Get all channels that have deals
  const dealChannels = await prisma.deal.groupBy({
    by: ["herkomst"],
    _count: true,
    orderBy: { _count: { herkomst: "desc" } },
  });

  const channels = dealChannels
    .filter((d) => d.herkomst)
    .map((d) => d.herkomst!);

  // Get all costs
  const costWhere: any = {};
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

export default router;
