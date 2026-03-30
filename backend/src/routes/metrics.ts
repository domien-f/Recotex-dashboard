import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

// Overview: all key metrics
router.get("/overview", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const dealWhere: any = {};
  const costWhere: any = {};
  if (herkomst) dealWhere.herkomst = herkomst;
  if (status) dealWhere.status = status;
  if (typeWerken) dealWhere.typeWerken = typeWerken;
  if (verantwoordelijke) dealWhere.verantwoordelijke = verantwoordelijke;

  if (dateFrom || dateTo) {
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom as string);
    if (dateTo) dateFilter.lte = new Date(dateTo as string);
    dealWhere.dealCreatedAt = dateFilter;
    // Costs are stored per first-of-month, so expand range to include full months
    const costFilter: any = {};
    if (dateFrom) {
      const d = new Date(dateFrom as string);
      costFilter.gte = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    if (dateTo) {
      const d = new Date(dateTo as string);
      costFilter.lte = new Date(d.getFullYear(), d.getMonth() + 1, 0); // last day of month
    }
    costWhere.date = costFilter;
  }

  const [
    totalDeals,
    wonDeals,
    totalRevenue,
    totalCost,
    totalAppointments,
    wonAppointments,
    uniqueContacts,
    estimatedCosts,
  ] = await Promise.all([
    prisma.deal.count({ where: dealWhere }),
    prisma.deal.count({ where: { ...dealWhere, status: "WON" } }),
    prisma.deal.aggregate({ where: { ...dealWhere, status: "WON" }, _sum: { revenue: true } }),
    prisma.cost.aggregate({ where: costWhere, _sum: { amount: true } }),
    prisma.appointment.count({
      where: dateFrom || dateTo ? {
        OR: [
          { scheduledAt: dealWhere.dealCreatedAt },
          { scheduledAt: null, date: dealWhere.dealCreatedAt },
        ],
        outcome: { not: "CANCELLED" },
      } : { outcome: { not: "CANCELLED" } },
    }),
    prisma.appointment.count({
      where: {
        ...(dateFrom || dateTo ? {
          OR: [
            { scheduledAt: dealWhere.dealCreatedAt },
            { scheduledAt: null, date: dealWhere.dealCreatedAt },
          ],
        } : {}),
        outcome: "WON",
      },
    }),
    prisma.deal.findMany({ where: dealWhere, select: { contactId: true }, distinct: ["contactId"] }),
    prisma.cost.count({ where: { ...costWhere, isEstimated: true } }),
  ]);

  const revenue = Number(totalRevenue._sum.revenue || 0);
  const cost = Number(totalCost._sum.amount || 0);

  res.json({
    totalDeals,
    uniqueContacts: uniqueContacts.length,
    wonDeals,
    winRateGlobal: totalDeals > 0 ? ((wonDeals / totalDeals) * 100).toFixed(1) : "0.0",
    totalRevenue: revenue,
    totalCost: cost,
    netResult: revenue - cost,
    costVsRevenuePercent: revenue > 0 ? ((cost / revenue) * 100).toFixed(1) : "0.0",
    returnMarketingCost: cost > 0 ? (((revenue - cost) / cost) * 100).toFixed(1) : "0.0",
    cpl: totalDeals > 0 ? (cost / totalDeals).toFixed(2) : "0.00",
    kpa: totalAppointments > 0 ? (cost / totalAppointments).toFixed(2) : "0.00",
    coa: wonDeals > 0 ? (cost / wonDeals).toFixed(2) : "0.00",
    roi: cost > 0 ? (revenue / cost).toFixed(2) : "0.00",
    avgRevenuePerDeal: wonDeals > 0 ? (revenue / wonDeals).toFixed(2) : "0.00",
    totalAppointments,
    wonAppointments,
    appointmentWinRate: totalAppointments > 0 ? ((wonAppointments / totalAppointments) * 100).toFixed(1) : "0.0",
    hasEstimatedCosts: estimatedCosts > 0,
  });
});

// Per channel (herkomst) breakdown
router.get("/channels", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const dateFilter: any = {};
  if (dateFrom) dateFilter.gte = new Date(dateFrom as string);
  if (dateTo) dateFilter.lte = new Date(dateTo as string);

  const dealWhere: any = dateFrom || dateTo ? { dealCreatedAt: dateFilter } : {};
  if (herkomst) dealWhere.herkomst = herkomst;
  if (status) dealWhere.status = status;
  if (typeWerken) dealWhere.typeWerken = typeWerken;
  if (verantwoordelijke) dealWhere.verantwoordelijke = verantwoordelijke;
  // Expand cost date filter to full months
  const costDateFilter: any = {};
  if (dateFrom) { const d = new Date(dateFrom as string); costDateFilter.gte = new Date(d.getFullYear(), d.getMonth(), 1); }
  if (dateTo) { const d = new Date(dateTo as string); costDateFilter.lte = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  const costWhere: any = dateFrom || dateTo ? { date: costDateFilter } : {};

  const [dealsByChannel, costsByChannel, wonByChannel, revenueByChannel, appointmentsByChannel] = await Promise.all([
    prisma.deal.groupBy({ by: ["herkomst"], where: dealWhere, _count: true }),
    prisma.cost.groupBy({ by: ["channel"], where: costWhere, _sum: { amount: true } }),
    prisma.deal.groupBy({ by: ["herkomst"], where: { ...dealWhere, status: "WON" }, _count: true }),
    prisma.deal.groupBy({ by: ["herkomst"], where: { ...dealWhere, status: "WON" }, _sum: { revenue: true } }),
    prisma.appointment.groupBy({
      by: ["channel"],
      where: {
        ...(dateFrom || dateTo ? {
          OR: [
            { scheduledAt: dateFilter },
            { scheduledAt: null, date: dateFilter },
          ],
        } : {}),
        outcome: { not: "CANCELLED" },
      },
      _count: true,
    }),
  ]);

  const channels = new Set([
    ...dealsByChannel.map((d) => d.herkomst || "Onbekend"),
    ...costsByChannel.map((c) => c.channel),
  ]);

  // Calculate months in range for cost coverage
  const rangeStart = dateFrom ? new Date(dateFrom as string) : new Date("2025-09-01");
  const rangeEnd = dateTo ? new Date(dateTo as string) : new Date();
  const totalMonthsInRange = Math.max(1, (rangeEnd.getFullYear() - rangeStart.getFullYear()) * 12 + rangeEnd.getMonth() - rangeStart.getMonth() + 1);

  // Get cost records per channel to check coverage
  const costRecords = await prisma.cost.findMany({
    where: costWhere,
    select: { channel: true, date: true },
  });

  // Count distinct months with costs per channel
  const costMonthsByChannel: Record<string, Set<string>> = {};
  for (const c of costRecords) {
    const key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    if (!costMonthsByChannel[c.channel]) costMonthsByChannel[c.channel] = new Set();
    costMonthsByChannel[c.channel].add(key);
  }

  // Invoice date range coverage per channel
  const invoices = await prisma.invoice.findMany({
    where: { status: "CONFIRMED", channel: { not: null } },
    select: { channel: true, parsedData: true, date: true },
  });

  const invoiceCoverageByChannel: Record<string, { from: string; to: string; gaps: string[] }[]> = {};

  // Group invoices by channel, find covered date ranges and gaps per month
  for (const inv of invoices) {
    const ch = inv.channel!;
    const parsed = inv.parsedData as any;
    const from = parsed?.dateRangeFrom;
    const to = parsed?.dateRangeTo;
    if (!from || !to) continue;

    if (!invoiceCoverageByChannel[ch]) invoiceCoverageByChannel[ch] = [];
    invoiceCoverageByChannel[ch].push({ from, to, gaps: [] });
  }

  // For each channel, find gaps in coverage per month
  for (const [ch, ranges] of Object.entries(invoiceCoverageByChannel)) {
    // Sort by from date
    ranges.sort((a, b) => a.from.localeCompare(b.from));

    // Find gaps between ranges
    const gaps: string[] = [];
    for (let i = 0; i < ranges.length - 1; i++) {
      const endCurrent = new Date(ranges[i].to);
      const startNext = new Date(ranges[i + 1].from);
      const diffDays = Math.round((startNext.getTime() - endCurrent.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) {
        const gapStart = new Date(endCurrent.getTime() + 86400000);
        const gapEnd = new Date(startNext.getTime() - 86400000);
        gaps.push(`${gapStart.toISOString().slice(0, 10)} t/m ${gapEnd.toISOString().slice(0, 10)}`);
      }
    }

    // Check if first invoice starts after range start
    if (ranges.length > 0) {
      const firstFrom = new Date(ranges[0].from);
      if (firstFrom > rangeStart) {
        gaps.unshift(`${rangeStart.toISOString().slice(0, 10)} t/m ${new Date(firstFrom.getTime() - 86400000).toISOString().slice(0, 10)}`);
      }
    }

    // Store gaps back
    invoiceCoverageByChannel[ch] = [{ from: ranges[0]?.from || "", to: ranges[ranges.length - 1]?.to || "", gaps }];
  }

  const result = Array.from(channels).map((channel) => {
    const deals = dealsByChannel.find((d) => (d.herkomst || "Onbekend") === channel)?._count || 0;
    const cost = Number(costsByChannel.find((c) => c.channel === channel)?._sum.amount || 0);
    const won = wonByChannel.find((w) => (w.herkomst || "Onbekend") === channel)?._count || 0;
    const revenue = Number(revenueByChannel.find((r) => (r.herkomst || "Onbekend") === channel)?._sum.revenue || 0);
    const appointments = appointmentsByChannel.find((a) => a.channel === channel)?._count || 0;

    return {
      channel,
      deals,
      won,
      appointments,
      lost: deals - won,
      winRate: deals > 0 ? ((won / deals) * 100).toFixed(1) : "0.0",
      cost,
      revenue,
      cpl: deals > 0 ? (cost / deals).toFixed(2) : "0.00",
      kpa: appointments > 0 ? (cost / appointments).toFixed(2) : "0.00",       // Kost Per Afspraak
      coa: won > 0 ? (cost / won).toFixed(2) : "0.00",                         // Cost Of Acquisition (per won deal)
      roi: cost > 0 ? (revenue / cost).toFixed(2) : "0.00",
      avgRevenuePerDeal: won > 0 ? (revenue / won).toFixed(2) : "0.00",
      costMonths: costMonthsByChannel[channel]?.size || 0,
      totalMonths: totalMonthsInRange,
      costComplete: (costMonthsByChannel[channel]?.size || 0) >= totalMonthsInRange,
      missingMonths: (() => {
        const covered = costMonthsByChannel[channel] || new Set();
        const missing: string[] = [];
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
        const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
        while (d <= end) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!covered.has(key)) missing.push(key);
          d.setMonth(d.getMonth() + 1);
        }
        return missing;
      })(),
      invoiceCoverage: invoiceCoverageByChannel[channel] || [],
    };
  });

  res.json(result);
});

// Cost vs Revenue over time
router.get("/cost-vs-revenue", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const costWhere: any = {};
  const dealWhere: any = {};
  if (dateFrom || dateTo) {
    const df: any = {};
    if (dateFrom) df.gte = new Date(dateFrom as string);
    if (dateTo) df.lte = new Date(dateTo as string);
    costWhere.date = df;
    dealWhere.wonAt = df;
  }

  const [costs, wonDeals] = await Promise.all([
    prisma.cost.findMany({ where: costWhere, select: { amount: true, date: true, isEstimated: true } }),
    prisma.deal.findMany({
      where: { ...dealWhere, status: "WON", wonAt: dealWhere.wonAt || { not: null } },
      select: { revenue: true, wonAt: true },
    }),
  ]);

  const grouped: Record<string, { cost: number; revenue: number; hasEstimated: boolean }> = {};

  for (const c of costs) {
    const key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    if (!grouped[key]) grouped[key] = { cost: 0, revenue: 0, hasEstimated: false };
    grouped[key].cost += Number(c.amount);
    if (c.isEstimated) grouped[key].hasEstimated = true;
  }

  for (const d of wonDeals) {
    if (!d.wonAt) continue;
    const key = `${d.wonAt.getFullYear()}-${String(d.wonAt.getMonth() + 1).padStart(2, "0")}`;
    if (!grouped[key]) grouped[key] = { cost: 0, revenue: 0, hasEstimated: false };
    grouped[key].revenue += Number(d.revenue || 0);
  }

  const result = Object.entries(grouped)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));

  res.json(result);
});

// Lead sources detail
router.get("/lead-sources", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const where: any = {};
  if (dateFrom || dateTo) {
    where.dealCreatedAt = {};
    if (dateFrom) where.dealCreatedAt.gte = new Date(dateFrom as string);
    if (dateTo) where.dealCreatedAt.lte = new Date(dateTo as string);
  }
  if (herkomst) where.herkomst = herkomst;
  if (status) where.status = status;
  if (typeWerken) where.typeWerken = typeWerken;
  if (verantwoordelijke) where.verantwoordelijke = verantwoordelijke;

  const [byChannel, wonByChannel] = await Promise.all([
    prisma.deal.groupBy({ by: ["herkomst"], where, _count: true, _sum: { revenue: true } }),
    prisma.deal.groupBy({ by: ["herkomst"], where: { ...where, status: "WON" }, _count: true }),
  ]);

  // Get reclamation counts — deals with non-empty reclamatieRedenen
  const reclamationsByChannel = await prisma.deal.groupBy({
    by: ["herkomst"],
    where: { ...where, reclamatieRedenen: { isEmpty: false } },
    _count: true,
  });

  const result = byChannel.map((ch) => {
    const channel = ch.herkomst || "Onbekend";
    const won = wonByChannel.find((w) => (w.herkomst || "Onbekend") === channel)?._count || 0;
    const reclamations = reclamationsByChannel.find((r) => (r.herkomst || "Onbekend") === channel)?._count || 0;

    return {
      channel,
      totalDeals: ch._count,
      wonDeals: won,
      reclamations,
      reclamationRate: ch._count > 0 ? ((reclamations / ch._count) * 100).toFixed(1) : "0.0",
      winRate: ch._count > 0 ? ((won / ch._count) * 100).toFixed(1) : "0.0",
      revenue: ch._sum.revenue || 0,
      qualityScore: ch._count > 0 ? ((1 - reclamations / ch._count) * (won / ch._count) * 100).toFixed(1) : "0.0",
    };
  });

  res.json(result);
});

// Reclamation stats
router.get("/reclamations", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const where: any = {};
  if (dateFrom || dateTo) {
    where.dealCreatedAt = {};
    if (dateFrom) where.dealCreatedAt.gte = new Date(dateFrom as string);
    if (dateTo) where.dealCreatedAt.lte = new Date(dateTo as string);
  }
  if (herkomst) where.herkomst = herkomst;
  if (status) where.status = status;
  if (typeWerken) where.typeWerken = typeWerken;
  if (verantwoordelijke) where.verantwoordelijke = verantwoordelijke;

  // A deal is a reclamation if it has redenen filled OR is in a reclamation phase
  const reclamationWhere = {
    ...where,
    OR: [
      { reclamatieRedenen: { isEmpty: false } },
      { phase: { startsWith: "Reclamaties" } },
    ],
  };

  const [totalDeals, totalReclamations, reclamationDeals, reclamationsByChannel] = await Promise.all([
    prisma.deal.count({ where }),
    prisma.deal.count({ where: reclamationWhere }),
    prisma.deal.findMany({
      where: reclamationWhere,
      select: { reclamatieRedenen: true, dealCreatedAt: true, herkomst: true, phase: true },
    }),
    prisma.deal.groupBy({
      by: ["herkomst"],
      where: reclamationWhere,
      _count: true,
    }),
  ]);

  // Count individual reasons (unnest arrays)
  const reasonCounts: Record<string, number> = {};
  const trendMap: Record<string, number> = {};
  const channelReasonMap: Record<string, Record<string, number>> = {};

  for (const deal of reclamationDeals) {
    // Use explicit reasons if available, otherwise derive from phase
    const reasons = deal.reclamatieRedenen.length > 0
      ? deal.reclamatieRedenen
      : deal.phase?.startsWith("Reclamaties") ? [deal.phase!] : ["Onbekend"];

    for (const reason of reasons) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

      const ch = deal.herkomst || "Onbekend";
      if (!channelReasonMap[ch]) channelReasonMap[ch] = {};
      channelReasonMap[ch][reason] = (channelReasonMap[ch][reason] || 0) + 1;
    }

    if (deal.dealCreatedAt) {
      const key = `${deal.dealCreatedAt.getFullYear()}-${String(deal.dealCreatedAt.getMonth() + 1).padStart(2, "0")}`;
      trendMap[key] = (trendMap[key] || 0) + 1;
    }
  }

  // Get total deals per month for % trend
  const allDeals = await prisma.deal.findMany({
    where,
    select: { dealCreatedAt: true },
  });
  const totalPerMonth: Record<string, number> = {};
  for (const d of allDeals) {
    if (d.dealCreatedAt) {
      const key = `${d.dealCreatedAt.getFullYear()}-${String(d.dealCreatedAt.getMonth() + 1).padStart(2, "0")}`;
      totalPerMonth[key] = (totalPerMonth[key] || 0) + 1;
    }
  }

  // Get total deals per channel for ratio
  const dealsPerChannel = await prisma.deal.groupBy({ by: ["herkomst"], where, _count: true });

  const byCategory = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // Merge all months from both maps
  const allMonths = new Set([...Object.keys(trendMap), ...Object.keys(totalPerMonth)]);
  const trend = Array.from(allMonths)
    .map((month) => {
      const reclamations = trendMap[month] || 0;
      const total = totalPerMonth[month] || 0;
      return {
        month,
        count: reclamations,
        total,
        percentage: total > 0 ? parseFloat(((reclamations / total) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const byChannel = reclamationsByChannel.map((ch) => {
    const channel = ch.herkomst || "Onbekend";
    const channelTotal = dealsPerChannel.find((d) => (d.herkomst || "Onbekend") === channel)?._count || 0;
    return {
      channel,
      reclamations: ch._count,
      totalDeals: channelTotal,
      reclamationRate: channelTotal > 0 ? ((ch._count / channelTotal) * 100).toFixed(1) : "0.0",
      breakdown: Object.entries(channelReasonMap[channel] || {}).map(([reason, count]) => ({ reason, count })),
    };
  }).sort((a, b) => b.reclamations - a.reclamations);

  res.json({
    totalDeals,
    totalReclamations,
    reclamationRate: totalDeals > 0 ? ((totalReclamations / totalDeals) * 100).toFixed(1) : "0.0",
    byCategory,
    byChannel,
    trend,
  });
});

export default router;
