import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { readFileSync } from "fs";
import path from "path";

// Load Belgian postcode → lat/lng lookup
const postcodeMap = new Map<string, { lat: number; lng: number; name: string }>();
try {
  // Try multiple paths to find the CSV
  const candidates = [
    path.resolve(__dirname, "../data/be-postcodes.csv"),
    path.resolve(process.cwd(), "backend/src/data/be-postcodes.csv"),
    path.resolve(process.cwd(), "src/data/be-postcodes.csv"),
  ];
  const csvPath = candidates.find((p) => { try { readFileSync(p); return true; } catch { return false; } }) || candidates[0];
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

// ─── Bezetting per verkoper per week ────────────────────────────────────────────
// Per verantwoordelijke per week:
//   ingepland   = total appointments scheduled in that week
//   doorgegaan  = outcome ∈ {WON, LOST}  (the appointment actually took place)
//   geannuleerd = outcome = CANCELLED
//   pending     = outcome = PENDING (still open)
//   won         = outcome = WON
//   target      = weekly target from AppointmentTarget (latest active row)
//   bezettingsgraad = doorgegaan / target × 100

const EXCLUDED_HERKOMST = ["EXTRA WERKEN"];

function isoWeekStart(d: Date): Date {
  // Monday-start ISO week
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;          // Sun=0 → 7
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date;
}

function isoWeekKey(d: Date): { weekStart: Date; weekEnd: Date; key: string } {
  const start = isoWeekStart(d);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  // ISO week number
  const tmp = new Date(start);
  tmp.setUTCDate(tmp.getUTCDate() + 3); // Thursday of this week
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return {
    weekStart: start,
    weekEnd: end,
    key: `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
  };
}

router.get("/bezetting", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, verantwoordelijke } = req.query;

  const apptWhere: any = {};
  if (dateFrom || dateTo) {
    const cond: any = {};
    if (dateFrom) cond.gte = new Date(dateFrom as string);
    if (dateTo) cond.lte = new Date(dateTo as string);
    apptWhere.OR = [
      { scheduledAt: cond },
      { scheduledAt: null, date: cond },
    ];
  }

  // Tracked verkopers = bouwadviseurs (those with an active AppointmentTarget).
  // Admin opts a verkoper in by setting a target in KPI Targets; without that
  // they're invisible to the bezetting view (e.g. junior staff, inactive Excel names).
  //
  // EXCEPTION: if no targets exist at all, show everyone — admins haven't
  // configured the dashboard yet, so the filter would just hide all data.
  const trackedTargets = await prisma.appointmentTarget.findMany({
    where: { effectiveUntil: null },
    select: { verantwoordelijke: true, teamleaderUserId: true },
  });
  const noTargetsConfigured = trackedTargets.length === 0;
  const trackedNames = new Set(trackedTargets.map((t) => t.verantwoordelijke));
  const trackedTlIds = new Set(trackedTargets.map((t) => t.teamleaderUserId).filter(Boolean) as string[]);

  // Get appointments + their parent deal's verantwoordelijke (which is the verkoper)
  const appointments = await prisma.appointment.findMany({
    where: apptWhere,
    select: {
      id: true,
      date: true,
      scheduledAt: true,
      outcome: true,
      cancelledAt: true,
      responsibleUserName: true,
      responsibleUserId: true,
      deal: { select: { verantwoordelijke: true, herkomst: true } },
    },
  });

  // Resolve verkoper name: webhook sets responsibleUserName, Excel uses deal.verantwoordelijke
  type Bucket = {
    verantwoordelijke: string;
    weekKey: string;
    weekStart: Date;
    weekEnd: Date;
    ingepland: number;
    doorgegaan: number;       // WON+LOST OR (past AND not cancelled) — see comment below
    geannuleerd: number;
    pending: number;          // future-pending only
    won: number;
    futurePending: number;    // for pacing context — meetings still to happen
  };
  const buckets = new Map<string, Bucket>();
  const now = new Date();

  for (const a of appointments) {
    if (a.deal?.herkomst && EXCLUDED_HERKOMST.includes(a.deal.herkomst)) continue;
    const verkoper = a.responsibleUserName || a.deal?.verantwoordelijke;
    if (!verkoper) continue;
    if (verantwoordelijke && verkoper !== verantwoordelijke) continue;

    // BOUWADVISEUR FILTER: only count appointments whose verkoper has been
    // explicitly opted in (has an active AppointmentTarget). Skipped entirely
    // when no targets are configured — show everyone so admins can discover
    // who's in the data before opting them in.
    if (!noTargetsConfigured) {
      const isTracked =
        trackedNames.has(verkoper) ||
        (a.responsibleUserId !== null && a.responsibleUserId !== undefined && trackedTlIds.has(a.responsibleUserId));
      if (!isTracked) continue;
    }

    const dt = a.scheduledAt || a.date;
    const wk = isoWeekKey(dt);
    const bucketKey = `${verkoper}__${wk.key}`;

    let b = buckets.get(bucketKey);
    if (!b) {
      b = {
        verantwoordelijke: verkoper,
        weekKey: wk.key,
        weekStart: wk.weekStart,
        weekEnd: wk.weekEnd,
        ingepland: 0,
        doorgegaan: 0,
        geannuleerd: 0,
        pending: 0,
        won: 0,
        futurePending: 0,
      };
      buckets.set(bucketKey, b);
    }

    b.ingepland++;
    const isPast = (a.date && a.date < now) || (a.scheduledAt && a.scheduledAt < now);

    // Doorgegaan = "the meeting actually happened":
    //   1. Explicit outcome WON or LOST (webhook-fed truth)
    //   2. OR scheduledAt is in the past AND not cancelled (pragmatic Excel inference)
    if (a.outcome === "WON" || a.outcome === "LOST") {
      b.doorgegaan++;
    } else if (a.outcome !== "CANCELLED" && isPast) {
      b.doorgegaan++;
    }

    if (a.outcome === "WON") b.won++;
    if (a.outcome === "CANCELLED") b.geannuleerd++;
    if (a.outcome === "PENDING") {
      if (isPast) {
        // counted in doorgegaan above (time-based) — don't double-count
      } else {
        b.pending++;
        b.futurePending++;
      }
    }
  }

  // Lookup the latest target per verkoper
  const verkoperNames = Array.from(new Set(Array.from(buckets.values()).map((b) => b.verantwoordelijke)));
  const targets = await prisma.appointmentTarget.findMany({
    where: { verantwoordelijke: { in: verkoperNames } },
    orderBy: { effectiveFrom: "desc" },
  });
  // Most recent target per verkoper (we collapse history for display, even though
  // we kept the row history in DB so historical bezetting could be re-derived if needed)
  const targetMap = new Map<string, number>();
  for (const t of targets) {
    if (!targetMap.has(t.verantwoordelijke)) targetMap.set(t.verantwoordelijke, t.weeklyTarget);
  }

  const rows = Array.from(buckets.values())
    .map((b) => {
      const target = targetMap.get(b.verantwoordelijke) ?? null;
      const bezettingsgraad = target && target > 0 ? Math.round((b.doorgegaan / target) * 1000) / 10 : null;
      const closed = b.doorgegaan + b.geannuleerd; // settled outcomes
      const doorgangsRatio = closed > 0 ? Math.round((b.doorgegaan / closed) * 1000) / 10 : null;
      const annulatieRatio = closed > 0 ? Math.round((b.geannuleerd / closed) * 1000) / 10 : null;
      return { ...b, target, bezettingsgraad, doorgangsRatio, annulatieRatio };
    })
    .sort((a, b) => {
      if (a.weekKey !== b.weekKey) return a.weekKey < b.weekKey ? 1 : -1; // newest week first
      return a.verantwoordelijke.localeCompare(b.verantwoordelijke);
    });

  // Also return per-week totals across all verkopers
  const weekTotals = new Map<string, {
    weekKey: string; weekStart: Date; weekEnd: Date;
    ingepland: number; doorgegaan: number; geannuleerd: number; pending: number; won: number; futurePending: number;
  }>();
  for (const b of buckets.values()) {
    let w = weekTotals.get(b.weekKey);
    if (!w) {
      w = { weekKey: b.weekKey, weekStart: b.weekStart, weekEnd: b.weekEnd, ingepland: 0, doorgegaan: 0, geannuleerd: 0, pending: 0, won: 0, futurePending: 0 };
      weekTotals.set(b.weekKey, w);
    }
    w.ingepland += b.ingepland;
    w.doorgegaan += b.doorgegaan;
    w.geannuleerd += b.geannuleerd;
    w.pending += b.pending;
    w.won += b.won;
    w.futurePending += b.futurePending;
  }

  // Aggregate ratios across all rows
  const totalIngepland = Array.from(buckets.values()).reduce((s, b) => s + b.ingepland, 0);
  const totalDoorgegaan = Array.from(buckets.values()).reduce((s, b) => s + b.doorgegaan, 0);
  const totalGeannuleerd = Array.from(buckets.values()).reduce((s, b) => s + b.geannuleerd, 0);
  const totalClosed = totalDoorgegaan + totalGeannuleerd;
  const overallDoorgangsRatio = totalClosed > 0 ? Math.round((totalDoorgegaan / totalClosed) * 1000) / 10 : null;
  const overallAnnulatieRatio = totalClosed > 0 ? Math.round((totalGeannuleerd / totalClosed) * 1000) / 10 : null;

  res.json({
    rows,
    weekTotals: Array.from(weekTotals.values()).sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1)),
    targets: Object.fromEntries(targetMap),
    summary: {
      totalIngepland,
      totalDoorgegaan,
      totalGeannuleerd,
      doorgangsRatio: overallDoorgangsRatio,
      annulatieRatio: overallAnnulatieRatio,
    },
  });
});

// List appointments with the same filters used by AppointmentsDrillModal
router.get("/list", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, verantwoordelijke, outcome, week } = req.query;

  const where: any = {};
  if (outcome) {
    where.outcome = (outcome as string).includes(",") ? { in: (outcome as string).split(",") } : outcome;
  }

  // Date filter — week takes priority if provided
  if (week) {
    // week format: "2026-W18" → compute Mon..Sun range
    const [yearStr, wStr] = (week as string).split("-W");
    const year = parseInt(yearStr);
    const w = parseInt(wStr);
    if (year && w) {
      // Find first Monday of given ISO week
      const jan4 = new Date(Date.UTC(year, 0, 4));
      const jan4Day = jan4.getUTCDay() || 7;
      const week1Monday = new Date(jan4);
      week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
      const monday = new Date(week1Monday);
      monday.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 7);
      where.OR = [
        { scheduledAt: { gte: monday, lt: sunday } },
        { scheduledAt: null, date: { gte: monday, lt: sunday } },
      ];
    }
  } else if (dateFrom || dateTo) {
    const cond: any = {};
    if (dateFrom) cond.gte = new Date(dateFrom as string);
    if (dateTo) cond.lte = new Date(dateTo as string);
    where.OR = [
      { scheduledAt: cond },
      { scheduledAt: null, date: cond },
    ];
  }

  let rows = await prisma.appointment.findMany({
    where,
    orderBy: [{ scheduledAt: "desc" }, { date: "desc" }],
    take: 500,
    include: { deal: { include: { contact: true } } },
  });

  // Filter on verkoper post-fetch (since it's resolved from two sources)
  if (verantwoordelijke) {
    rows = rows.filter((a) => {
      const v = a.responsibleUserName || a.deal?.verantwoordelijke;
      return v === verantwoordelijke;
    });
  } else {
    // Team-wide drill: limit to tracked bouwadviseurs so totals match the
    // KPI cards on the bezetting page. Skipped when no targets are configured.
    const tracked = await prisma.appointmentTarget.findMany({
      where: { effectiveUntil: null },
      select: { verantwoordelijke: true, teamleaderUserId: true },
    });
    if (tracked.length > 0) {
      const trackedNames = new Set(tracked.map((t) => t.verantwoordelijke));
      const trackedTlIds = new Set(tracked.map((t) => t.teamleaderUserId).filter(Boolean) as string[]);
      rows = rows.filter((a) => {
        const v = a.responsibleUserName || a.deal?.verantwoordelijke;
        return (v && trackedNames.has(v)) || (a.responsibleUserId && trackedTlIds.has(a.responsibleUserId));
      });
    }
  }

  // Filter out EXTRA WERKEN
  rows = rows.filter((a) => !a.deal?.herkomst || !EXCLUDED_HERKOMST.includes(a.deal.herkomst));

  res.json({ appointments: rows, total: rows.length });
});

export default router;
