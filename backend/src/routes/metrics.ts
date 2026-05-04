import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = Router();

function multiFilter(val: unknown): string | { in: string[] } | undefined {
  if (!val) return undefined;
  const s = val as string;
  return s.includes(",") ? { in: s.split(",") } : s;
}

function dateField(dateMode: unknown): string {
  return dateMode === "won" ? "wonAt" : "dealCreatedAt";
}

const EXCLUDED_HERKOMST = ["EXTRA WERKEN"];

router.use(authenticate);

// Overview: all key metrics
router.get("/overview", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, dateMode, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const dealWhere: any = {};
  const costWhere: any = {};
  if (herkomst) {
    dealWhere.herkomst = multiFilter(herkomst);
    // Also filter costs by the same channels
    costWhere.channel = multiFilter(herkomst);
  }
  else dealWhere.herkomst = { notIn: EXCLUDED_HERKOMST };
  if (status) dealWhere.status = multiFilter(status);
  if (typeWerken) dealWhere.typeWerken = multiFilter(typeWerken);
  if (verantwoordelijke) dealWhere.verantwoordelijke = multiFilter(verantwoordelijke);

  if (dateFrom || dateTo) {
    const df = dateField(dateMode);
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom as string);
    if (dateTo) dateFilter.lte = new Date(dateTo as string);
    dealWhere[df] = dateFilter;
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
      where: {
        ...(dateFrom || dateTo ? {
          OR: [
            { scheduledAt: dealWhere.dealCreatedAt },
            { scheduledAt: null, date: dealWhere.dealCreatedAt },
          ],
        } : {}),
        ...(herkomst ? { channel: multiFilter(herkomst) } : {}),
        outcome: { not: "CANCELLED" },
      },
    }),
    prisma.appointment.count({
      where: {
        ...(dateFrom || dateTo ? {
          OR: [
            { scheduledAt: dealWhere.dealCreatedAt },
            { scheduledAt: null, date: dealWhere.dealCreatedAt },
          ],
        } : {}),
        ...(herkomst ? { channel: multiFilter(herkomst) } : {}),
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
  const { dateFrom, dateTo, dateMode, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const dateFilter: any = {};
  if (dateFrom) dateFilter.gte = new Date(dateFrom as string);
  if (dateTo) dateFilter.lte = new Date(dateTo as string);

  const df = dateField(dateMode);
  const dealWhere: any = dateFrom || dateTo ? { [df]: dateFilter } : {};
  if (herkomst) dealWhere.herkomst = multiFilter(herkomst);
  else dealWhere.herkomst = { notIn: EXCLUDED_HERKOMST };
  if (status) dealWhere.status = multiFilter(status);
  if (typeWerken) dealWhere.typeWerken = multiFilter(typeWerken);
  if (verantwoordelijke) dealWhere.verantwoordelijke = multiFilter(verantwoordelijke);
  // Expand cost date filter to full months
  const costDateFilter: any = {};
  if (dateFrom) { const d = new Date(dateFrom as string); costDateFilter.gte = new Date(d.getFullYear(), d.getMonth(), 1); }
  if (dateTo) { const d = new Date(dateTo as string); costDateFilter.lte = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  const costWhere: any = dateFrom || dateTo ? { date: costDateFilter } : {};
  if (herkomst) costWhere.channel = multiFilter(herkomst);

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
        ...(herkomst ? { channel: multiFilter(herkomst) } : {}),
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
  const dealWhere: any = { herkomst: { notIn: EXCLUDED_HERKOMST } };
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
  const { dateFrom, dateTo, dateMode, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const where: any = {};
  if (dateFrom || dateTo) {
    const df = dateField(dateMode);
    where[df] = {};
    if (dateFrom) where[df].gte = new Date(dateFrom as string);
    if (dateTo) where[df].lte = new Date(dateTo as string);
  }
  if (herkomst) where.herkomst = multiFilter(herkomst);
  else where.herkomst = { notIn: EXCLUDED_HERKOMST };
  if (status) where.status = multiFilter(status);
  if (typeWerken) where.typeWerken = multiFilter(typeWerken);
  if (verantwoordelijke) where.verantwoordelijke = multiFilter(verantwoordelijke);

  const [byChannel, wonByChannel] = await Promise.all([
    prisma.deal.groupBy({ by: ["herkomst"], where, _count: true, _sum: { revenue: true } }),
    prisma.deal.groupBy({ by: ["herkomst"], where: { ...where, status: "WON" }, _count: true }),
  ]);

  // Reclamation based on contacts: a contact is a reclamation if they have reclamation deals AND no WON deals
  const allFilteredDeals = await prisma.deal.findMany({
    where,
    select: { contactId: true, herkomst: true, status: true, reclamatieRedenen: true, phase: true },
  });

  // Group by contact
  const contactMap = new Map<string, { herkomst: string; hasWon: boolean; hasReclamation: boolean }>();
  for (const d of allFilteredDeals) {
    const existing = contactMap.get(d.contactId);
    const isReclamation = (d.reclamatieRedenen?.length ?? 0) > 0 || d.phase?.startsWith("Reclamaties") === true;
    if (existing) {
      if (d.status === "WON") existing.hasWon = true;
      if (isReclamation) existing.hasReclamation = true;
    } else {
      contactMap.set(d.contactId, {
        herkomst: d.herkomst || "Onbekend",
        hasWon: d.status === "WON",
        hasReclamation: isReclamation,
      });
    }
  }

  // Count reclamation contacts per channel (has reclamation AND no won)
  const reclamationCountByChannel: Record<string, number> = {};
  const totalContactsByChannel: Record<string, number> = {};
  for (const c of contactMap.values()) {
    const ch = c.herkomst;
    totalContactsByChannel[ch] = (totalContactsByChannel[ch] || 0) + 1;
    if (c.hasReclamation && !c.hasWon) {
      reclamationCountByChannel[ch] = (reclamationCountByChannel[ch] || 0) + 1;
    }
  }

  const result = byChannel.map((ch) => {
    const channel = ch.herkomst || "Onbekend";
    const won = wonByChannel.find((w) => (w.herkomst || "Onbekend") === channel)?._count || 0;
    const totalContacts = totalContactsByChannel[channel] || 0;
    const reclamations = reclamationCountByChannel[channel] || 0;

    return {
      channel,
      totalDeals: ch._count,
      wonDeals: won,
      reclamations,
      reclamationRate: totalContacts > 0 ? ((reclamations / totalContacts) * 100).toFixed(1) : "0.0",
      winRate: ch._count > 0 ? ((won / ch._count) * 100).toFixed(1) : "0.0",
      revenue: ch._sum.revenue || 0,
      qualityScore: totalContacts > 0 ? ((1 - reclamations / totalContacts) * (won / ch._count) * 100).toFixed(1) : "0.0",
    };
  });

  res.json(result);
});

// Reclamation stats
router.get("/reclamations", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, dateMode, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const where: any = {};
  if (dateFrom || dateTo) {
    const df = dateField(dateMode);
    where[df] = {};
    if (dateFrom) where[df].gte = new Date(dateFrom as string);
    if (dateTo) where[df].lte = new Date(dateTo as string);
  }
  if (herkomst) where.herkomst = multiFilter(herkomst);
  else where.herkomst = { notIn: EXCLUDED_HERKOMST };
  if (status) where.status = multiFilter(status);
  if (typeWerken) where.typeWerken = multiFilter(typeWerken);
  if (verantwoordelijke) where.verantwoordelijke = multiFilter(verantwoordelijke);

  // A deal is a reclamation if it has redenen filled OR is in a reclamation phase
  const reclamationWhere = {
    ...where,
    OR: [
      { reclamatieRedenen: { isEmpty: false } },
      { phase: { startsWith: "Reclamaties" } },
    ],
  };

  // Fetch all deals matching filters to compute contact-based reclamation
  const allDeals = await prisma.deal.findMany({
    where,
    select: { contactId: true, reclamatieRedenen: true, dealCreatedAt: true, herkomst: true, phase: true, status: true },
  });

  // Group by contact to determine reclamation status per lead
  const contactInfo = new Map<string, {
    herkomst: string;
    hasWon: boolean;
    hasReclamation: boolean;
    reasons: string[];
    dealCreatedAt: Date | null;
  }>();

  for (const deal of allDeals) {
    const isReclamation = (deal.reclamatieRedenen?.length ?? 0) > 0 || deal.phase?.startsWith("Reclamaties") === true;
    const reasons = deal.reclamatieRedenen?.length > 0
      ? deal.reclamatieRedenen
      : deal.phase?.startsWith("Reclamaties") ? [deal.phase!] : [];

    const existing = contactInfo.get(deal.contactId);
    if (existing) {
      if (deal.status === "WON") existing.hasWon = true;
      if (isReclamation) {
        existing.hasReclamation = true;
        existing.reasons.push(...reasons);
      }
    } else {
      contactInfo.set(deal.contactId, {
        herkomst: deal.herkomst || "Onbekend",
        hasWon: deal.status === "WON",
        hasReclamation: isReclamation,
        reasons: [...reasons],
        dealCreatedAt: deal.dealCreatedAt,
      });
    }
  }

  // A contact is a reclamation lead if: has reclamation AND no WON deals
  const totalContacts = contactInfo.size;
  let totalReclamations = 0;
  const reasonCounts: Record<string, number> = {};
  const trendMap: Record<string, number> = {};
  const totalPerMonth: Record<string, number> = {};
  const channelReasonMap: Record<string, Record<string, number>> = {};
  const reclamationCountByChannel: Record<string, number> = {};
  const totalContactsByChannel: Record<string, number> = {};

  for (const c of contactInfo.values()) {
    const ch = c.herkomst;
    totalContactsByChannel[ch] = (totalContactsByChannel[ch] || 0) + 1;

    if (c.dealCreatedAt) {
      const monthKey = `${c.dealCreatedAt.getFullYear()}-${String(c.dealCreatedAt.getMonth() + 1).padStart(2, "0")}`;
      totalPerMonth[monthKey] = (totalPerMonth[monthKey] || 0) + 1;
    }

    if (c.hasReclamation && !c.hasWon) {
      totalReclamations++;
      reclamationCountByChannel[ch] = (reclamationCountByChannel[ch] || 0) + 1;

      const reasons = c.reasons.length > 0 ? c.reasons : ["Onbekend"];
      for (const reason of reasons) {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        if (!channelReasonMap[ch]) channelReasonMap[ch] = {};
        channelReasonMap[ch][reason] = (channelReasonMap[ch][reason] || 0) + 1;
      }

      if (c.dealCreatedAt) {
        const monthKey = `${c.dealCreatedAt.getFullYear()}-${String(c.dealCreatedAt.getMonth() + 1).padStart(2, "0")}`;
        trendMap[monthKey] = (trendMap[monthKey] || 0) + 1;
      }
    }
  }

  const byCategory = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

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

  const channelNames = new Set([...Object.keys(reclamationCountByChannel), ...Object.keys(totalContactsByChannel)]);
  const byChannel = Array.from(channelNames)
    .map((channel) => {
      const reclamations = reclamationCountByChannel[channel] || 0;
      const channelTotal = totalContactsByChannel[channel] || 0;
      return {
        channel,
        reclamations,
        totalDeals: channelTotal,
        reclamationRate: channelTotal > 0 ? ((reclamations / channelTotal) * 100).toFixed(1) : "0.0",
        breakdown: Object.entries(channelReasonMap[channel] || {}).map(([reason, count]) => ({ reason, count })),
      };
    })
    .filter((ch) => ch.reclamations > 0)
    .sort((a, b) => b.reclamations - a.reclamations);

  res.json({
    totalDeals: totalContacts,
    totalReclamations,
    reclamationRate: totalContacts > 0 ? ((totalReclamations / totalContacts) * 100).toFixed(1) : "0.0",
    byCategory,
    byChannel,
    trend,
  });
});

// Sales funnel per verantwoordelijke: Lead → Afspraak gemaakt → Deal gewonnen
router.get("/sales-funnel", async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, dateMode, herkomst, status, typeWerken, verantwoordelijke } = req.query;

  const where: any = {};
  if (dateFrom || dateTo) {
    const df = dateField(dateMode);
    where[df] = {};
    if (dateFrom) where[df].gte = new Date(dateFrom as string);
    if (dateTo) where[df].lte = new Date(dateTo as string);
  }
  if (herkomst) where.herkomst = multiFilter(herkomst);
  else where.herkomst = { notIn: EXCLUDED_HERKOMST };
  if (status) where.status = multiFilter(status);
  if (typeWerken) where.typeWerken = multiFilter(typeWerken);
  if (verantwoordelijke) where.verantwoordelijke = multiFilter(verantwoordelijke);

  const deals = await prisma.deal.findMany({
    where,
    select: {
      id: true,
      verantwoordelijke: true,
      status: true,
      phase: true,
      revenue: true,
      wonAt: true,
      dealCreatedAt: true,
      herkomst: true,
      appointments: { select: { outcome: true, date: true } },
    },
  });

  // Phases that mean an offerte was sent at some point (current phase or further)
  const OFFER_SENT_PHASE = /offerte verzonden|negotiati|technisch gevalideerd|aanvaard|voorschot|eindfactuur|klaar voor|nazorg|afsluit|referent/i;
  const hadOfferSent = (phase: string | null, status: string) =>
    status === "WON" || (phase ? OFFER_SENT_PHASE.test(phase) : false);

  type Bucket = {
    leads: number;
    afspraken: number;
    cancelledAppointments: number;
    totalAppointments: number;
    offersSent: number;
    afsprakenWithOffer: number;
    won: number;
    lost: number;
    revenue: number;
    cycleSum: number;
    cycleCount: number;
    speedSum: number;
    speedCount: number;
    channels: Record<string, number>;
  };

  const empty = (): Bucket => ({
    leads: 0, afspraken: 0, cancelledAppointments: 0, totalAppointments: 0,
    offersSent: 0, afsprakenWithOffer: 0,
    won: 0, lost: 0,
    revenue: 0, cycleSum: 0, cycleCount: 0,
    speedSum: 0, speedCount: 0, channels: {},
  });

  const grouped: Record<string, Bucket> = {};
  const totals = empty();

  for (const d of deals) {
    const v = d.verantwoordelijke || "Niet toegewezen";
    if (!grouped[v]) grouped[v] = empty();
    const g = grouped[v];

    g.leads++;
    totals.leads++;

    g.totalAppointments += d.appointments.length;
    totals.totalAppointments += d.appointments.length;
    const cancelled = d.appointments.filter((a) => a.outcome === "CANCELLED").length;
    g.cancelledAppointments += cancelled;
    totals.cancelledAppointments += cancelled;

    const validApps = d.appointments.filter((a) => a.outcome !== "CANCELLED");
    const hasOffer = hadOfferSent(d.phase, d.status);
    if (hasOffer) {
      g.offersSent++;
      totals.offersSent++;
    }

    if (validApps.length > 0) {
      g.afspraken++;
      totals.afspraken++;
      if (hasOffer) {
        g.afsprakenWithOffer++;
        totals.afsprakenWithOffer++;
      }

      // Speed: days from lead creation to first appointment
      if (d.dealCreatedAt) {
        const firstApp = validApps.reduce((earliest, a) =>
          a.date < earliest ? a.date : earliest, validApps[0].date);
        const days = (new Date(firstApp).getTime() - new Date(d.dealCreatedAt).getTime()) / 86400000;
        if (days >= 0 && days < 365) {
          g.speedSum += days;
          g.speedCount++;
          totals.speedSum += days;
          totals.speedCount++;
        }
      }
    }

    if (d.status === "WON") {
      g.won++;
      totals.won++;
      g.revenue += Number(d.revenue || 0);
      totals.revenue += Number(d.revenue || 0);
      if (d.wonAt && d.dealCreatedAt) {
        const days = (new Date(d.wonAt).getTime() - new Date(d.dealCreatedAt).getTime()) / 86400000;
        if (days >= 0) {
          g.cycleSum += days;
          g.cycleCount++;
          totals.cycleSum += days;
          totals.cycleCount++;
        }
      }
    } else if (d.status === "LOST") {
      g.lost++;
      totals.lost++;
    }

    const ch = d.herkomst || "Onbekend";
    g.channels[ch] = (g.channels[ch] || 0) + 1;
    totals.channels[ch] = (totals.channels[ch] || 0) + 1;
  }

  const fmt = (b: Bucket, name: string) => {
    const topChannel = Object.entries(b.channels).sort((a, b) => b[1] - a[1])[0];
    return {
      verantwoordelijke: name,
      leads: b.leads,
      afspraken: b.afspraken,
      totalAppointments: b.totalAppointments,
      cancelledAppointments: b.cancelledAppointments,
      offersSent: b.offersSent,
      afsprakenWithOffer: b.afsprakenWithOffer,
      won: b.won,
      lost: b.lost,
      revenue: Math.round(b.revenue),
      avgDealValue: b.won > 0 ? Math.round(b.revenue / b.won) : 0,
      revenuePerAppointment: b.afspraken > 0 ? Math.round(b.revenue / b.afspraken) : 0,
      revenuePerOffer: b.offersSent > 0 ? Math.round(b.revenue / b.offersSent) : 0,
      offerToWon: b.offersSent > 0 ? +((b.won / b.offersSent) * 100).toFixed(1) : 0,
      afspraakToOffer: b.afspraken > 0 ? +((b.afsprakenWithOffer / b.afspraken) * 100).toFixed(1) : 0,
      cancellationRate: b.totalAppointments > 0 ? +((b.cancelledAppointments / b.totalAppointments) * 100).toFixed(1) : 0,
      leadToAfspraak: b.leads > 0 ? +((b.afspraken / b.leads) * 100).toFixed(1) : 0,
      afspraakToWon: b.afspraken > 0 ? +((b.won / b.afspraken) * 100).toFixed(1) : 0,
      leadToWon: b.leads > 0 ? +((b.won / b.leads) * 100).toFixed(1) : 0,
      avgCycleDays: b.cycleCount > 0 ? +(b.cycleSum / b.cycleCount).toFixed(1) : 0,
      avgSpeedToAfspraakDays: b.speedCount > 0 ? +(b.speedSum / b.speedCount).toFixed(1) : 0,
      topChannel: topChannel ? { name: topChannel[0], count: topChannel[1] } : null,
    };
  };

  const perPerson = Object.entries(grouped)
    .map(([name, b]) => fmt(b, name))
    .sort((a, b) => b.leads - a.leads);

  res.json({
    perPerson,
    totals: fmt(totals, "Totaal"),
  });
});

export default router;
