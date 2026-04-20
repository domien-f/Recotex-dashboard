import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
const EXCLUDED_HERKOMST = ["EXTRA WERKEN"];

router.use(authenticate);

// List deals with filters
router.get("/", async (req: AuthRequest, res: Response) => {
  const { status, herkomst, dateFrom, dateTo, dateMode, search, page = "1", limit = "50", reclamation, typeWerken, verantwoordelijke } = req.query;

  const where: any = {};
  if (status) where.status = (status as string).includes(",") ? { in: (status as string).split(",") } : status;
  if (herkomst) where.herkomst = (herkomst as string).includes(",") ? { in: (herkomst as string).split(",") } : herkomst;
  else where.herkomst = { notIn: EXCLUDED_HERKOMST };
  if (typeWerken) where.typeWerken = (typeWerken as string).includes(",") ? { in: (typeWerken as string).split(",") } : typeWerken;
  if (verantwoordelijke) where.verantwoordelijke = (verantwoordelijke as string).includes(",") ? { in: (verantwoordelijke as string).split(",") } : verantwoordelijke;
  if (reclamation === "true") where.OR = [{ reclamatieRedenen: { isEmpty: false } }, { phase: { startsWith: "Reclamaties" } }];
  if (reclamation === "false") { where.reclamatieRedenen = { isEmpty: true }; where.NOT = { phase: { startsWith: "Reclamaties" } }; }
  if (dateFrom || dateTo) {
    const dateField = dateMode === "won" ? "wonAt" : "dealCreatedAt";
    where[dateField] = {};
    if (dateFrom) where[dateField].gte = new Date(dateFrom as string);
    if (dateTo) where[dateField].lte = new Date(dateTo as string);
  }
  if (search) {
    where.OR = [
      { title: { contains: search as string, mode: "insensitive" } },
      { contact: { name: { contains: search as string, mode: "insensitive" } } },
      { contact: { email: { contains: search as string, mode: "insensitive" } } },
    ];
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { dealCreatedAt: "desc" },
      skip,
      take: parseInt(limit as string),
      include: { contact: true },
    }),
    prisma.deal.count({ where }),
  ]);

  res.json({ deals, total, page: parseInt(page as string), limit: parseInt(limit as string) });
});

// Deal stats
router.get("/stats", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, herkomst } = req.query;

  const where: any = {};
  if (herkomst) where.herkomst = herkomst;
  else where.herkomst = { notIn: EXCLUDED_HERKOMST };
  if (dateFrom || dateTo) {
    where.dealCreatedAt = {};
    if (dateFrom) where.dealCreatedAt.gte = new Date(dateFrom as string);
    if (dateTo) where.dealCreatedAt.lte = new Date(dateTo as string);
  }

  const [total, byStatus, byHerkomst, uniqueContacts] = await Promise.all([
    prisma.deal.count({ where }),
    prisma.deal.groupBy({ by: ["status"], where, _count: true }),
    prisma.deal.groupBy({ by: ["herkomst"], where, _count: true, _sum: { revenue: true } }),
    prisma.deal.findMany({
      where,
      select: { contactId: true },
      distinct: ["contactId"],
    }),
  ]);

  const won = byStatus.find((s) => s.status === "WON")?._count || 0;

  res.json({
    total,
    uniqueContacts: uniqueContacts.length,
    won,
    winRate: total > 0 ? ((won / total) * 100).toFixed(1) : "0.0",
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
    byHerkomst: byHerkomst.map((h) => ({
      herkomst: h.herkomst || "Onbekend",
      count: h._count,
      revenue: h._sum.revenue || 0,
    })),
  });
});

// Create deal
router.post("/", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { contactId, title, herkomst, status, revenue, typeWerken } = req.body;

  if (!contactId) {
    res.status(400).json({ error: "contactId is required" });
    return;
  }

  const deal = await prisma.deal.create({
    data: { contactId, title, herkomst, status, revenue, typeWerken },
    include: { contact: true },
  });

  res.status(201).json(deal);
});

// Update deal
router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data: any = { ...req.body };

  if (data.status === "WON" && !data.wonAt) {
    data.wonAt = new Date();
  }

  const deal = await prisma.deal.update({
    where: { id: id as string },
    data,
    include: { contact: true },
  });
  res.json(deal);
});

// Filter options (MUST be before /:id)
router.get("/filter-options", async (_req: AuthRequest, res: Response) => {
  const [channels, statuses, typeWerken, verantwoordelijken] = await Promise.all([
    prisma.deal.findMany({ select: { herkomst: true }, distinct: ["herkomst"], where: { herkomst: { not: null, notIn: EXCLUDED_HERKOMST } }, orderBy: { herkomst: "asc" } }),
    prisma.deal.findMany({ select: { status: true }, distinct: ["status"] }),
    prisma.deal.findMany({ select: { typeWerken: true }, distinct: ["typeWerken"], where: { typeWerken: { not: null } }, orderBy: { typeWerken: "asc" } }),
    prisma.deal.findMany({ select: { verantwoordelijke: true }, distinct: ["verantwoordelijke"], where: { verantwoordelijke: { not: null } }, orderBy: { verantwoordelijke: "asc" } }),
  ]);
  res.json({
    channels: channels.map((c) => c.herkomst).filter(Boolean),
    statuses: statuses.map((s) => s.status),
    typeWerken: typeWerken.map((t) => t.typeWerken).filter(Boolean),
    verantwoordelijken: verantwoordelijken.map((v) => v.verantwoordelijke).filter(Boolean),
  });
});

// Get single deal
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const deal = await prisma.deal.findUnique({
    where: { id: req.params.id as string },
    include: {
      contact: true,
      appointments: { orderBy: { date: "desc" } },
    },
  });

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  res.json(deal);
});

export default router;
