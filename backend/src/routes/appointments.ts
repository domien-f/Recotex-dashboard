import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { readFileSync } from "fs";
import path from "path";

// Load Belgian postcode → lat/lng lookup
const postcodeMap = new Map<string, { lat: number; lng: number; name: string }>();
try {
  const csvPath = path.resolve(process.cwd(), "src/data/be-postcodes.csv");
  const csv = readFileSync(csvPath, "utf-8");
  for (const line of csv.split("\n")) {
    const [pc, name, lng, lat] = line.split(",");
    if (pc && lat && lng) {
      postcodeMap.set(pc.trim(), { lat: parseFloat(lat), lng: parseFloat(lng), name: name?.trim() || "" });
    }
  }
  console.log(`[Postcodes] Loaded ${postcodeMap.size} Belgian postcodes`);
} catch { /* file not found */ }

const router = Router();

router.use(authenticate);

// Helper: build date filter on scheduledAt (fallback to date)
function scheduledDateFilter(dateFrom?: string, dateTo?: string): any {
  if (!dateFrom && !dateTo) return {};
  // Use raw SQL approach via OR for scheduledAt with fallback
  const conditions: any[] = [];
  if (dateFrom || dateTo) {
    const scheduled: any = {};
    const fallback: any = {};
    if (dateFrom) { scheduled.gte = new Date(dateFrom); fallback.gte = new Date(dateFrom); }
    if (dateTo) { scheduled.lte = new Date(dateTo); fallback.lte = new Date(dateTo); }
    return {
      OR: [
        { scheduledAt: scheduled },
        { scheduledAt: null, date: fallback },
      ],
    };
  }
  return {};
}

router.get("/", async (req: AuthRequest, res: Response) => {
  const { channel, dateFrom, dateTo, outcome } = req.query;

  const where: any = {
    ...scheduledDateFilter(dateFrom as string, dateTo as string),
  };
  if (channel) where.channel = channel;
  if (outcome) where.outcome = outcome;

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: { date: "desc" },
    include: { deal: { include: { contact: true } } },
  });

  res.json(appointments);
});

router.get("/stats", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const where: any = scheduledDateFilter(dateFrom as string, dateTo as string);

  const [total, byOutcome, byChannel, costSum] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.groupBy({ by: ["outcome"], where, _count: true }),
    prisma.appointment.groupBy({ by: ["channel"], where, _count: true, _sum: { cost: true } }),
    prisma.appointment.aggregate({ where, _sum: { cost: true } }),
  ]);

  const won = byOutcome.find((o) => o.outcome === "WON")?._count || 0;
  const cancelled = byOutcome.find((o) => o.outcome === "CANCELLED")?._count || 0;
  const active = total - cancelled;

  res.json({
    total,
    active,
    cancelled,
    won,
    winRate: active > 0 ? ((won / active) * 100).toFixed(1) : "0.0",
    totalCost: costSum._sum.cost || 0,
    avgCost: active > 0 ? Number(costSum._sum.cost || 0) / active : 0,
    byOutcome: byOutcome.map((o) => ({ outcome: o.outcome, count: o._count })),
    byChannel: byChannel.map((c) => ({
      channel: c.channel || "Unknown",
      count: c._count,
      totalCost: c._sum.cost || 0,
    })),
  });
});

// Appointments per postcode (for map)
router.get("/geo", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;
  const where: any = scheduledDateFilter(dateFrom as string, dateTo as string);

  const appointments = await prisma.appointment.findMany({
    where,
    select: {
      date: true,
      channel: true,
      deal: { select: { contact: { select: { postcode: true, city: true } } } },
    },
  });

  const grouped: Record<string, { postcode: string; city: string; count: number; lat: number; lng: number }> = {};
  for (const a of appointments) {
    const pc = a.deal?.contact?.postcode;
    if (!pc) continue;
    if (!grouped[pc]) {
      const coords = postcodeMap.get(pc.trim());
      if (!coords) continue;
      grouped[pc] = { postcode: pc, city: a.deal?.contact?.city || coords.name || "", count: 0, lat: coords.lat, lng: coords.lng };
    }
    grouped[pc].count++;
  }

  res.json(Object.values(grouped).sort((a, b) => b.count - a.count));
});

// Appointments trend (per month, by scheduledAt)
router.get("/trend", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;
  const where: any = scheduledDateFilter(dateFrom as string, dateTo as string);

  const appointments = await prisma.appointment.findMany({
    where,
    select: { date: true, scheduledAt: true, outcome: true },
  });

  const monthMap: Record<string, { active: number; cancelled: number }> = {};
  for (const a of appointments) {
    const d = a.scheduledAt || a.date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { active: 0, cancelled: 0 };
    if (a.outcome === "CANCELLED") monthMap[key].cancelled++;
    else monthMap[key].active++;
  }

  res.json(
    Object.entries(monthMap)
      .map(([month, data]) => ({ month, ...data, total: data.active + data.cancelled }))
      .sort((a, b) => a.month.localeCompare(b.month))
  );
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { dealId, date, cost, outcome, channel, notes } = req.body;
  if (!dealId || !date) { res.status(400).json({ error: "dealId and date are required" }); return; }
  const appointment = await prisma.appointment.create({
    data: { dealId, date: new Date(date), cost, outcome, channel, notes },
  });
  res.status(201).json(appointment);
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const appointment = await prisma.appointment.update({
    where: { id: req.params.id as string },
    data: req.body,
  });
  res.json(appointment);
});

export default router;
