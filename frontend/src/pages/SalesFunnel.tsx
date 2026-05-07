import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { useSalesFunnel } from "@/hooks/useMetrics";
import type { SalesFunnelPerson } from "@/hooks/useMetrics";
import { formatNumber, formatPercent, formatCurrency, cn } from "@/lib/utils";
import { SalesFunnelCone } from "@/components/charts/SalesFunnelCone";
import {
  Users, CalendarCheck, Trophy, Filter as FilterIcon, Wallet,
  Clock, Zap, TrendingUp, ArrowDown, Crown, AlertTriangle, Sparkles,
  FileText, Receipt, Package,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MetricLabel } from "@/components/ui/metric-label";
import { DealsDrillModal, type DrillFilter } from "@/components/dashboard/DealsDrillModal";
import { DrillableNumber } from "@/components/dashboard/DrillableNumber";

const STAGE_COLORS = [
  { color: "#fb923c", dark: "#ea580c" },   // Lead
  { color: "#3b82f6", dark: "#1d4ed8" },   // Afspraak
  { color: "#10b981", dark: "#047857" },   // Won
];

const PERSON_COLORS = ["#f08300", "#1a3860", "#10b981", "#8b5cf6", "#06b6d4", "#ec4899", "#f59e0b", "#ef4444"];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-white px-4 py-3 shadow-xl">
      <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.color || e.fill }} />
          {e.name}: <span className="font-semibold text-foreground">
            {typeof e.value === "number" && e.value > 1000 ? formatCurrency(e.value) : `${e.value}${e.dataKey?.includes("Pct") ? "%" : ""}`}
          </span>
        </p>
      ))}
    </div>
  );
};

export function SalesFunnelPage() {
  const { data, isLoading } = useSalesFunnel();
  const [selected, setSelected] = useState<string>("__all__");
  const [drill, setDrill] = useState<DrillFilter | null>(null);

  const current: SalesFunnelPerson | undefined = useMemo(() => {
    if (!data) return undefined;
    if (selected === "__all__") return data.totals;
    return data.perPerson.find((p) => p.verantwoordelijke === selected);
  }, [data, selected]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Sales funnel laden...</span>
        </div>
      </div>
    );
  }

  if (!data || !current) return null;

  const stages = [
    { label: "Lead", value: current.leads, color: STAGE_COLORS[0].color, colorDark: STAGE_COLORS[0].dark },
    { label: "Afspraak gemaakt", value: current.afspraken, color: STAGE_COLORS[1].color, colorDark: STAGE_COLORS[1].dark, conversion: current.leadToAfspraak },
    { label: "Deal gewonnen", value: current.won, color: STAGE_COLORS[2].color, colorDark: STAGE_COLORS[2].dark, conversion: current.afspraakToWon },
  ];

  // Leaderboard ranking: highest revenue first
  const sorted = [...data.perPerson].sort((a, b) => b.revenue - a.revenue);
  const topConverter = sorted.length > 0 ? sorted.slice().sort((a, b) => b.leadToWon - a.leadToWon)[0] : null;
  const topRevenue = sorted.length > 0 ? sorted.slice().sort((a, b) => b.revenue - a.revenue)[0] : null;
  const fastestCloser = sorted.filter((p) => p.avgCycleDays > 0).sort((a, b) => a.avgCycleDays - b.avgCycleDays)[0];

  // Bottleneck detection: which stage has the largest drop-off in current view
  const dropAfterLead = current.leads - current.afspraken;
  const dropAfterAfspraak = current.afspraken - current.won;
  const biggestDrop = dropAfterLead >= dropAfterAfspraak
    ? { stage: "Lead → Afspraak", lost: dropAfterLead, pct: 100 - current.leadToAfspraak }
    : { stage: "Afspraak → Won", lost: dropAfterAfspraak, pct: 100 - current.afspraakToWon };

  // Comparison data for bar chart (per person stage counts)
  const compareData = data.perPerson.map((p) => ({
    name: p.verantwoordelijke,
    Leads: p.leads,
    Afspraken: p.afspraken,
    Won: p.won,
    leadToWonPct: p.leadToWon,
  }));

  // Radar / multi-metric view (top 5 people) — normalized to 100
  const radarPeople = data.perPerson.slice(0, 5);
  const maxLeads = Math.max(1, ...radarPeople.map((p) => p.leads));
  const maxRev = Math.max(1, ...radarPeople.map((p) => p.revenue));
  const maxCycle = Math.max(1, ...radarPeople.map((p) => p.avgCycleDays));
  const radarMetrics = [
    { metric: "Leads", ...Object.fromEntries(radarPeople.map((p) => [p.verantwoordelijke, Math.round((p.leads / maxLeads) * 100)])) },
    { metric: "Win %", ...Object.fromEntries(radarPeople.map((p) => [p.verantwoordelijke, Math.round(p.leadToWon)])) },
    { metric: "Lead→Afspraak %", ...Object.fromEntries(radarPeople.map((p) => [p.verantwoordelijke, Math.round(p.leadToAfspraak)])) },
    { metric: "Afspraak→Won %", ...Object.fromEntries(radarPeople.map((p) => [p.verantwoordelijke, Math.round(p.afspraakToWon)])) },
    { metric: "Omzet", ...Object.fromEntries(radarPeople.map((p) => [p.verantwoordelijke, Math.round((p.revenue / maxRev) * 100)])) },
    // Cycle inverted so faster = higher
    { metric: "Snelheid", ...Object.fromEntries(radarPeople.map((p) => [p.verantwoordelijke, p.avgCycleDays > 0 ? Math.round(100 - (p.avgCycleDays / maxCycle) * 100) : 0])) },
  ];

  const personOptions = ["__all__", ...data.perPerson.map((p) => p.verantwoordelijke)];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sales Funnel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lead → Afspraak gemaakt → Deal gewonnen, per verkoper
          </p>
        </div>

        {/* Person selector pills */}
        <div className="flex items-center gap-1.5 flex-wrap rounded-2xl border border-border/60 bg-white p-1.5 shadow-sm">
          <FilterIcon className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
          {personOptions.map((p) => {
            const active = selected === p;
            const isAll = p === "__all__";
            return (
              <button
                key={p}
                onClick={() => setSelected(p)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-medium transition-all",
                  active
                    ? "bg-gradient-to-r from-primary to-gradient-end text-white shadow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {isAll ? "Alle verkopers" : p}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI strip — primary funnel counts */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        <KpiCard
          title="Aantal deals"
          value={formatNumber(current.leads)}
          icon={<Users className="h-4 w-4" />}
          onClick={() => setDrill({ verantwoordelijke: selected !== "__all__" ? selected : undefined, title: selected !== "__all__" ? `Leads — ${selected}` : "Alle leads", inheritGlobal: false })}
          formula={{ label: "Aantal deals", description: "Alle leads die toegekend zijn aan de geselecteerde verkoper(s)" }}
        />
        <KpiCard
          title="Afspraken"
          value={formatNumber(current.afspraken)}
          icon={<CalendarCheck className="h-4 w-4" />}
          onClick={() => setDrill({ verantwoordelijke: selected !== "__all__" ? selected : undefined, status: "APPOINTMENT,WON,LOST", title: selected !== "__all__" ? `Afspraken — ${selected}` : "Alle afspraken", inheritGlobal: false })}
          formula={{
            label: "Afspraken gemaakt",
            description: "Leads waar minstens 1 (niet-geannuleerde) afspraak voor staat",
            formula: "COUNT(DISTINCT deal WHERE appointment.outcome != CANCELLED)",
          }}
        />
        <KpiCard
          title="Offertes verzonden"
          value={formatNumber(current.offersSent)}
          icon={<FileText className="h-4 w-4" />}
          formula={{
            label: "Offertes verzonden",
            description: "Deals met huidige fase ≥ 'Offerte verzonden' of WON-status",
            formula: "COUNT(deal WHERE phase ∈ {Offerte verzonden, Negotiatie, …, Aanvaard, Voorschot, Eindfactuur, WON})",
          }}
        />
        <KpiCard
          title="Won Deals"
          value={formatNumber(current.won)}
          icon={<Trophy className="h-4 w-4" />}
          onClick={() => setDrill({ verantwoordelijke: selected !== "__all__" ? selected : undefined, status: "WON", title: selected !== "__all__" ? `Won — ${selected}` : "Alle won deals", inheritGlobal: false })}
          formula={{ label: "Won Deals", description: "Aantal effectief gewonnen deals" }}
        />
        <KpiCard
          title="Omzet"
          value={formatCurrency(current.revenue)}
          icon={<Wallet className="h-4 w-4" />}
          onClick={() => setDrill({ verantwoordelijke: selected !== "__all__" ? selected : undefined, status: "WON", title: selected !== "__all__" ? `Omzet — ${selected}` : "Omzet — Alle won deals", inheritGlobal: false })}
          formula={{ label: "Omzet", description: "Som van alle gewonnen deals voor deze selectie" }}
        />
      </div>

      {/* KPI strip — efficiency & per-unit revenue */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        <KpiCard
          title="Gem. dealwaarde"
          value={current.avgDealValue > 0 ? formatCurrency(current.avgDealValue) : "—"}
          icon={<Package className="h-4 w-4" />}
          formula={{
            label: "Gemiddelde dealwaarde",
            description: "Gem. omzet per gewonnen deal",
            formula: "Omzet ÷ Won deals",
          }}
        />
        <KpiCard
          title="Omzet / afspraak"
          value={current.revenuePerAppointment > 0 ? formatCurrency(current.revenuePerAppointment) : "—"}
          icon={<CalendarCheck className="h-4 w-4" />}
          formula={{
            label: "Omzet per afspraak",
            description: "Hoeveel omzet elke gemaakte afspraak gemiddeld oplevert",
            formula: "Omzet ÷ Afspraken",
          }}
        />
        <KpiCard
          title="Omzet / offerte"
          value={current.revenuePerOffer > 0 ? formatCurrency(current.revenuePerOffer) : "—"}
          icon={<Receipt className="h-4 w-4" />}
          formula={{
            label: "Omzet per offerte",
            description: "Gem. omzet per uitgestuurde offerte",
            formula: "Omzet ÷ Offertes verzonden",
          }}
        />
        <KpiCard
          title="Conv. offerte → won"
          value={formatPercent(current.offerToWon)}
          icon={<TrendingUp className="h-4 w-4" />}
          formula={{
            label: "Offerte-to-Won conversie",
            description: "Percentage offertes dat in een gewonnen deal eindigt",
            formula: "Won ÷ Offertes verzonden × 100",
          }}
        />
        <KpiCard
          title="% afspr. → offerte"
          value={formatPercent(current.afspraakToOffer)}
          icon={<FileText className="h-4 w-4" />}
          formula={{
            label: "Afspraak met offerte",
            description: "% van afspraken waar uiteindelijk een offerte werd verstuurd",
            formula: "Afspraken met offerte ÷ Afspraken × 100",
          }}
        />
      </div>

      {/* Funnel + insights */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Cone */}
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Funnel — {selected === "__all__" ? "Alle verkopers" : selected}
              </CardTitle>
              <Badge variant="success" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* subtle gradient backdrop */}
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{
                  background: "radial-gradient(ellipse at center top, rgba(251,146,60,0.08), transparent 60%)",
                }}
              />
              <div className="relative">
                <SalesFunnelCone
                  stages={stages}
                  onStageClick={(i) => {
                    const verant = selected !== "__all__" ? selected : undefined;
                    const verantSuffix = verant ? ` — ${verant}` : "";
                    if (i === 0) {
                      setDrill({ verantwoordelijke: verant, title: `Leads${verantSuffix}`, inheritGlobal: false });
                    } else if (i === 1) {
                      setDrill({ verantwoordelijke: verant, status: "APPOINTMENT,WON,LOST", title: `Afspraken${verantSuffix}`, inheritGlobal: false });
                    } else {
                      setDrill({ verantwoordelijke: verant, status: "WON", title: `Won deals${verantSuffix}`, inheritGlobal: false });
                    }
                  }}
                />
              </div>
            </div>

            {/* Stage detail rail */}
            <div className="mt-2 grid grid-cols-3 gap-3 border-t border-border/60 pt-5">
              {stages.map((s, i) => (
                <div key={i} className="rounded-xl border border-border/40 bg-muted/30 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  </div>
                  <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatNumber(s.value)}</p>
                  {s.conversion !== undefined && (
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatPercent(s.conversion)}</span> van vorige stap
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Insights */}
        <div className="space-y-4">
          {/* Bottleneck */}
          <Card>
            <CardHeader>
              <CardTitle>Bottleneck</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <ArrowDown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grootste drop-off</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{biggestDrop.stage}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-destructive">−{formatNumber(biggestDrop.lost)}</span> leads verloren
                    {" · "}
                    <span className="font-semibold">{formatPercent(biggestDrop.pct)}</span> drop
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Velocity */}
          <Card>
            <CardHeader>
              <CardTitle>Snelheid</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lead → Afspraak</p>
                  <p className="text-sm font-semibold text-foreground">
                    {current.avgSpeedToAfspraakDays > 0 ? `${current.avgSpeedToAfspraakDays} dagen gem.` : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lead → Won</p>
                  <p className="text-sm font-semibold text-foreground">
                    {current.avgCycleDays > 0 ? `${current.avgCycleDays} dagen gem.` : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Champions */}
          {selected === "__all__" && (
            <Card>
              <CardHeader>
                <CardTitle>MVP's</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topConverter && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                      <Crown className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Beste conversie</p>
                      <p className="text-sm font-semibold text-foreground">
                        {topConverter.verantwoordelijke} <span className="font-normal text-muted-foreground">— {formatPercent(topConverter.leadToWon)}</span>
                      </p>
                    </div>
                  </div>
                )}
                {topRevenue && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Topomzet</p>
                      <p className="text-sm font-semibold text-foreground">
                        {topRevenue.verantwoordelijke} <span className="font-normal text-muted-foreground">— {formatCurrency(topRevenue.revenue)}</span>
                      </p>
                    </div>
                  </div>
                )}
                {fastestCloser && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Snelste closer</p>
                      <p className="text-sm font-semibold text-foreground">
                        {fastestCloser.verantwoordelijke} <span className="font-normal text-muted-foreground">— {fastestCloser.avgCycleDays}d</span>
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Top channel */}
          {current.topChannel && (
            <Card>
              <CardHeader>
                <CardTitle>Top kanaal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{current.topChannel.name}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(current.topChannel.count)} leads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {drill && <DealsDrillModal filter={drill} onClose={() => setDrill(null)} />}

      {/* Comparison: stacked bars + radar */}
      {data.perPerson.length > 1 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                Stages per verkoper
                <InfoTooltip text="Aantal Leads, Afspraken en Won deals per verkoper. Klik op een staaf voor de bijhorende deals." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={compareData} barGap={6} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(240,131,0,0.04)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Leads" fill={STAGE_COLORS[0].color} radius={[6, 6, 0, 0]} cursor="pointer"
                    onClick={(d: any) => setDrill({ verantwoordelijke: d.name, title: `Leads — ${d.name}`, inheritGlobal: false })} />
                  <Bar dataKey="Afspraken" fill={STAGE_COLORS[1].color} radius={[6, 6, 0, 0]} cursor="pointer"
                    onClick={(d: any) => setDrill({ verantwoordelijke: d.name, status: "APPOINTMENT,WON,LOST", title: `Afspraken — ${d.name}`, inheritGlobal: false })} />
                  <Bar dataKey="Won" fill={STAGE_COLORS[2].color} radius={[6, 6, 0, 0]} cursor="pointer"
                    onClick={(d: any) => setDrill({ verantwoordelijke: d.name, status: "WON", title: `Won — ${d.name}`, inheritGlobal: false })} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Performance profiel (top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarMetrics}>
                  <PolarGrid stroke="#e4e4e7" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#71717a" }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  {radarPeople.map((p, i) => (
                    <Radar
                      key={p.verantwoordelijke}
                      name={p.verantwoordelijke}
                      dataKey={p.verantwoordelijke}
                      stroke={PERSON_COLORS[i % PERSON_COLORS.length]}
                      fill={PERSON_COLORS[i % PERSON_COLORS.length]}
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Leaderboard verkopers
            <InfoTooltip text="Klik op een rij om die verkoper te selecteren. Klik op een aantal (Deals, Afspraken, Won, Omzet) om de bijhorende deals te zien." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Verantwoordelijke">Verkoper</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Deal">Deals</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Afspraak">Afspraken</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Offerte">Offertes</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Won">Won</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Lead → Afspraak" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Offerte → Won" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Win%" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Omzet</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Gem.Omzet" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Omzet/Afspraak" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Doorlooptijd" /></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const isSelected = selected === p.verantwoordelijke;
                  const winColor = p.leadToWon >= 30 ? "text-emerald-600" : p.leadToWon >= 15 ? "text-amber-600" : "text-destructive";
                  return (
                    <tr
                      key={p.verantwoordelijke}
                      onClick={() => setSelected(isSelected ? "__all__" : p.verantwoordelijke)}
                      className={cn(
                        "cursor-pointer border-b border-border/30 transition-colors",
                        isSelected ? "bg-primary/5" : "hover:bg-muted/40"
                      )}
                    >
                      <td className="py-3.5">
                        <div className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold",
                          i === 0 ? "bg-amber-100 text-amber-700"
                            : i === 1 ? "bg-slate-100 text-slate-700"
                            : i === 2 ? "bg-orange-100 text-orange-700"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {i + 1}
                        </div>
                      </td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: PERSON_COLORS[i % PERSON_COLORS.length] }}
                          >
                            {p.verantwoordelijke.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{p.verantwoordelijke}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                        <DrillableNumber filter={{ verantwoordelijke: p.verantwoordelijke, title: `Leads — ${p.verantwoordelijke}`, inheritGlobal: false }}>
                          {formatNumber(p.leads)}
                        </DrillableNumber>
                      </td>
                      <td className="py-3.5 text-right tabular-nums text-blue-600" onClick={(e) => e.stopPropagation()}>
                        <DrillableNumber filter={{ verantwoordelijke: p.verantwoordelijke, status: "APPOINTMENT,WON,LOST", title: `Afspraken — ${p.verantwoordelijke}`, inheritGlobal: false }} className="text-blue-600">
                          {formatNumber(p.afspraken)}
                        </DrillableNumber>
                      </td>
                      <td className="py-3.5 text-right tabular-nums text-violet-600">{formatNumber(p.offersSent)}</td>
                      <td className="py-3.5 text-right tabular-nums font-semibold text-emerald-600" onClick={(e) => e.stopPropagation()}>
                        <DrillableNumber filter={{ verantwoordelijke: p.verantwoordelijke, status: "WON", title: `Won — ${p.verantwoordelijke}`, inheritGlobal: false }} className="text-emerald-600">
                          {formatNumber(p.won)}
                        </DrillableNumber>
                      </td>
                      <td className="py-3.5 text-right">
                        <ConvBar value={p.leadToAfspraak} color="#3b82f6" />
                      </td>
                      <td className="py-3.5 text-right">
                        <ConvBar value={p.offerToWon} color="#8b5cf6" />
                      </td>
                      <td className={cn("py-3.5 text-right font-semibold tabular-nums", winColor)}>
                        {formatPercent(p.leadToWon)}
                      </td>
                      <td className="py-3.5 text-right font-semibold tabular-nums" onClick={(e) => e.stopPropagation()}>
                        <DrillableNumber filter={{ verantwoordelijke: p.verantwoordelijke, status: "WON", title: `Omzet — ${p.verantwoordelijke}`, inheritGlobal: false }}>
                          {formatCurrency(p.revenue)}
                        </DrillableNumber>
                      </td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">
                        {p.avgDealValue > 0 ? formatCurrency(p.avgDealValue) : "—"}
                      </td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">
                        {p.revenuePerAppointment > 0 ? formatCurrency(p.revenuePerAppointment) : "—"}
                      </td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">
                        {p.avgCycleDays > 0 ? `${p.avgCycleDays}d` : "—"}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-8 text-center text-muted-foreground">
                      Geen data — pas filters aan of importeer deals.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConvBar({ value, color }: { value: number; color: string }) {
  const w = Math.min(100, Math.max(0, value));
  return (
    <div className="ml-auto inline-flex items-center gap-2">
      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${w}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-right text-xs font-medium tabular-nums text-foreground">{formatPercent(value)}</span>
    </div>
  );
}
