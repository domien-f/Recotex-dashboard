import { useState, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


import { useAuthStore } from "@/store/authStore";
import { useMetricsOverview, useChannelMetrics, useCostVsRevenue, useCostSummary } from "@/hooks/useMetrics";
import api from "@/lib/api";
import { formatCurrency, isFreeChannel } from "@/lib/utils";
import { Euro, TrendingUp, TrendingDown, Wallet, ArrowUpDown, HelpCircle, X, Settings, BarChart, Plus, Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MetricLabel } from "@/components/ui/metric-label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DealsDrillModal, type DrillFilter } from "@/components/dashboard/DealsDrillModal";
import { DrillableNumber } from "@/components/dashboard/DrillableNumber";
import {
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line,
} from "recharts";

const CHANNEL_COLORS: Record<string, string> = {
  Solvari: "#f08300", "META Leads": "#3b82f6", "Red Pepper": "#ef4444",
  Renocheck: "#8b5cf6", Website: "#10b981", PPA: "#1a3860",
  "Bis Beurs": "#f59e0b", "Bouw En Reno": "#06b6d4",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-white px-4 py-3 shadow-xl">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-foreground">{typeof entry.value === "number" ? formatCurrency(entry.value) : entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export function CostsPage() {
  const [tab, setTab] = useState<"analytics" | "beheer">("analytics");
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Kosten & ROI</h1>
            <button onClick={() => setShowInfo(true)} className="text-muted-foreground hover:text-foreground transition-colors">
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Marketing kosten, KPA en rendement per kanaal</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
        <button
          onClick={() => setTab("analytics")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === "analytics" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <BarChart className="h-4 w-4" />Analytics
        </button>
        <button
          onClick={() => setTab("beheer")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === "beheer" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Settings className="h-4 w-4" />Kosten Beheer
        </button>
      </div>

      {tab === "analytics" && <AnalyticsTab />}
      {tab === "beheer" && <BeheerTab />}

      {/* Info Modal */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}

// ─── Analytics Tab ───

function AnalyticsTab() {
  const [drill, setDrill] = useState<DrillFilter | null>(null);
  const { data: overview, isLoading } = useMetricsOverview();
  const { data: channels } = useChannelMetrics();
  const { data: costVsRevenue } = useCostVsRevenue();
  const { data: costSummary } = useCostSummary();

  if (isLoading) return <div className="flex h-32 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  const leadSpendCost = Number(costSummary?.leadSpendTotal || overview?.totalCost || 0);
  const algemeenCost = Number(costSummary?.algemeenTotal || 0);
  const totalCost = leadSpendCost + algemeenCost;
  const totalRevenue = overview?.totalRevenue || 0;
  const netResult = totalRevenue - totalCost;

  const costCompareData = (channels || []).filter((ch) => ch.cost > 0).sort((a, b) => b.cost - a.cost).map((ch) => ({
    channel: ch.channel, CPL: parseFloat(ch.cpl), KPA: parseFloat(ch.kpa), COA: parseFloat(ch.coa),
  }));

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
        <KpiCard
          title="Lead Spend"
          value={formatCurrency(leadSpendCost)}
          icon={<Euro className="h-4 w-4" />}
          isEstimated={overview?.hasEstimatedCosts}
          subtitle="Direct attribueerbaar aan lead-generatie — vormt basis voor ROI/CPL/KPA"
          formula={{ label: "Lead Spend", description: "Som van alle kosten met category=lead_spend (Solvari, Meta, Google, Renocheck, ...).", formula: "Σ cost.amount WHERE category = 'lead_spend'" }}
        />
        <KpiCard
          title="Algemeen / Overhead"
          value={formatCurrency(algemeenCost)}
          icon={<Wallet className="h-4 w-4" />}
          subtitle="Beurzen, salarissen, IT, sponsoring — niet meegerekend in ROI"
          formula={{ label: "Algemene Kosten", description: "Overhead-kosten: beurzen, marketing team, IT-systemen, sponsoring, fees, ...", formula: "Σ cost.amount WHERE category = 'algemeen'" }}
        />
        <KpiCard
          title="Totale Kost"
          value={formatCurrency(totalCost)}
          icon={<Euro className="h-4 w-4" />}
          subtitle={`Lead spend + algemeen — totaal in deze periode`}
          formula={{ label: "Totale Kost", description: "Lead spend + algemene overhead samen.", formula: "Lead spend + Algemeen" }}
        />
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard
          title="Totale Omzet"
          value={formatCurrency(totalRevenue)}
          icon={<Wallet className="h-4 w-4" />}
          onClick={() => setDrill({ status: "WON", title: "Omzet — Won deals" })}
          formula={{ label: "Totale Omzet", description: "Som van alle gewonnen deals", formula: "Σ revenue waar status = WON" }}
        />
        <KpiCard
          title="Netto Resultaat"
          value={formatCurrency(netResult)}
          icon={netResult >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          formula={{ label: "Netto Resultaat", description: "Winst na aftrek van ALLE kosten (lead spend + algemeen).", formula: "Totale omzet − Totale kost" }}
        />
        <KpiCard
          title="CPL (lead spend)"
          value={formatCurrency(overview?.cpl || 0)}
          icon={<BarChart className="h-4 w-4" />}
          formula={{ label: "Cost Per Lead", description: "Lead spend ÷ aantal leads. Algemene kosten worden NIET meegerekend.", formula: "Lead spend ÷ Aantal leads" }}
        />
        <KpiCard
          title="ROI (lead spend)"
          value={`${overview?.roi || 0}x`}
          icon={<ArrowUpDown className="h-4 w-4" />}
          formula={{ label: "Return On Investment (lead spend)", description: "Omzet ÷ lead spend. Algemene kosten zijn overhead en worden NIET in ROI verwerkt.", formula: "Totale omzet ÷ Lead spend" }}
        />
      </div>

      {/* Cost vs Revenue */}
      {costVsRevenue && costVsRevenue.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Kosten vs Omzet per Maand</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={costVsRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                <Bar dataKey="cost" fill="#ef4444" name="Kosten" radius={[4, 4, 0, 0]} barSize={30} />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} name="Omzet" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* CPL + KPA + COA Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {[
          { key: "CPL", label: "CPL per Kanaal", fill: "#f08300", name: "CPL (kost/lead)" },
          { key: "KPA", label: "KPA per Kanaal", fill: "#1a3860", name: "KPA (kost/afspraak)" },
          { key: "COA", label: "COA per Kanaal", fill: "#ef4444", name: "COA (kost/won deal)" },
        ].map((chart) => (
          <Card key={chart.key}>
            <CardHeader><CardTitle>{chart.label}</CardTitle></CardHeader>
            <CardContent>
              {costCompareData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ReBarChart data={costCompareData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v}`} />
                    <YAxis type="category" dataKey="channel" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey={chart.key} fill={chart.fill} name={chart.name} radius={[0, 6, 6, 0]} />
                  </ReBarChart>
                </ResponsiveContainer>
              ) : <p className="py-12 text-center text-sm text-muted-foreground">Geen kostendata</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Channel Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Kosten & ROI per Kanaal
            <InfoTooltip text="Klik op het aantal Deals, Won of Omzet om de bijhorende deals te zien." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Kanaal">Kanaal</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Deal">Deals</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Won">Won</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip text="Totale advertentie- en marketingkost voor dit kanaal in de periode">Kost</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip text="Totale gerealiseerde omzet uit gewonnen deals">Omzet</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="CPL" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="KPA" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="COA" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="ROI" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="K/O" /></th>
                </tr>
              </thead>
              <tbody>
                {(channels || []).filter((ch) => ch.deals > 0).sort((a, b) => b.cost - a.cost || b.deals - a.deals).map((ch) => {
                  const free = isFreeChannel(ch.channel);
                  const nvt = <span className="text-xs text-muted-foreground/60">NVT</span>;
                  const costVsRev = ch.revenue > 0 ? ((ch.cost / ch.revenue) * 100) : 0;
                  return (
                    <tr key={ch.channel} className="border-b border-border/30 hover:bg-muted/50">
                      <td className="py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch.channel] || "#94a3b8" }} />
                          <span className="font-medium text-foreground">{ch.channel}</span>
                          {!free && <CostCoverageBadge channel={ch.channel} costMonths={ch.costMonths} totalMonths={ch.totalMonths} costComplete={ch.costComplete} missingMonths={ch.missingMonths} cost={ch.cost} deals={ch.deals} invoiceCoverage={ch.invoiceCoverage} />}
                        </div>
                      </td>
                      <td className="py-3.5 text-right tabular-nums">
                        <DrillableNumber filter={{ herkomst: ch.channel, title: `Alle deals — ${ch.channel}`, inheritGlobal: false }}>
                          {ch.deals}
                        </DrillableNumber>
                      </td>
                      <td className="py-3.5 text-right font-medium tabular-nums text-success">
                        <DrillableNumber filter={{ herkomst: ch.channel, status: "WON", title: `Won — ${ch.channel}`, inheritGlobal: false }} className="text-success">
                          {ch.won}
                        </DrillableNumber>
                      </td>
                      <td className="py-3.5 text-right tabular-nums">{free ? nvt : ch.cost > 0 ? formatCurrency(ch.cost) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right font-semibold tabular-nums">
                        <DrillableNumber filter={{ herkomst: ch.channel, status: "WON", title: `Omzet — ${ch.channel}`, inheritGlobal: false }}>
                          {formatCurrency(ch.revenue)}
                        </DrillableNumber>
                      </td>
                      <td className="py-3.5 text-right tabular-nums">{free ? nvt : ch.cost > 0 ? formatCurrency(ch.cpl) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right tabular-nums">{free ? nvt : ch.cost > 0 ? formatCurrency(ch.kpa) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right tabular-nums">{free ? nvt : ch.cost > 0 ? formatCurrency(ch.coa) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right">{free ? nvt : ch.cost > 0 ? <span className={`font-semibold tabular-nums ${parseFloat(ch.roi) >= 5 ? "text-success" : parseFloat(ch.roi) >= 1 ? "text-primary" : "text-destructive"}`}>{ch.roi}x</span> : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right">{free ? nvt : ch.cost > 0 && ch.revenue > 0 ? <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${costVsRev < 10 ? "bg-success/10 text-success" : costVsRev < 30 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>{costVsRev.toFixed(1)}%</span> : <span className="text-muted-foreground">-</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {drill && <DealsDrillModal filter={drill} onClose={() => setDrill(null)} />}

      {/* Monthly Overview */}
      {costVsRevenue && costVsRevenue.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Maandelijks Overzicht</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {["Maand"].map((h) => <th key={h} className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}
                    {["Kosten", "Omzet"].map((h) => <th key={h} className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Netto" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="K/O" /></th>
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {costVsRevenue.map((row: any) => {
                    const net = row.revenue - row.cost;
                    const ratio = row.revenue > 0 ? ((row.cost / row.revenue) * 100) : 0;
                    return (
                      <tr key={row.month} className="border-b border-border/30 hover:bg-muted/50">
                        <td className="py-3.5 font-medium text-foreground">{row.month}</td>
                        <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(row.cost)}</td>
                        <td className="py-3.5 text-right font-semibold tabular-nums">{formatCurrency(row.revenue)}</td>
                        <td className={`py-3.5 text-right font-semibold tabular-nums ${net >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(net)}</td>
                        <td className="py-3.5 text-right"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${ratio < 10 ? "bg-success/10 text-success" : ratio < 30 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>{ratio.toFixed(1)}%</span></td>
                        <td className="py-3.5">{row.hasEstimated && <Badge variant="estimated">Geschat</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Cost Coverage Badge with Tooltip ───

function CostCoverageBadge({ channel: _channel, costMonths, totalMonths, costComplete, missingMonths, cost, deals, invoiceCoverage }: {
  channel: string; costMonths: number; totalMonths: number; costComplete: boolean; missingMonths: string[]; cost: number; deals: number; invoiceCoverage?: { from: string; to: string; gaps: string[] }[];
}) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
    setHover(true);
  };

  // Channels with €0 cost records (Website, Referentie, etc.) = free, show complete badge
  if (cost === 0 && costMonths > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
        {costMonths}/{totalMonths} mnd
      </span>
    );
  }

  // No cost records at all for a channel with deals
  if (cost === 0 && costMonths === 0 && deals > 0) {
    return (
      <>
        <span
          ref={ref}
          className="inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-medium text-destructive cursor-help"
          onMouseEnter={handleEnter}
          onMouseLeave={() => setHover(false)}
        >
          Geen kosten
        </span>
        {hover && createPortal(
          <div style={{ left: pos.x, top: pos.y }} className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2">
            <div className="rounded-md border border-border/60 bg-white px-4 py-3 shadow-xl max-w-[220px]">
              <div className="text-xs font-semibold text-destructive mb-1">Geen kosten geüpload</div>
              <div className="text-[10px] text-muted-foreground">
                Alle {totalMonths} maanden missen kostendata. Upload facturen of voer kosten manueel in.
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground/70">
                {missingMonths.join(", ")}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // Check for invoice date range gaps even when months appear complete
  const gaps = invoiceCoverage?.flatMap((c) => c.gaps) || [];
  const hasGaps = gaps.length > 0;

  // All months covered but may have invoice gaps
  if (costComplete && !hasGaps) {
    return (
      <span className="inline-flex items-center rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
        {costMonths}/{totalMonths} mnd
      </span>
    );
  }

  // Months covered but invoice date ranges have gaps
  if (costComplete && hasGaps) {
    return (
      <>
        <span
          ref={ref}
          className="inline-flex items-center rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning cursor-help"
          onMouseEnter={handleEnter}
          onMouseLeave={() => setHover(false)}
        >
          Facturen incompleet
        </span>
        {hover && createPortal(
          <div style={{ left: pos.x, top: pos.y }} className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2">
            <div className="rounded-md border border-border/60 bg-white px-4 py-3 shadow-xl max-w-[280px]">
              <div className="text-xs font-semibold text-warning mb-1">Ontbrekende factuurperiodes</div>
              <div className="text-[10px] text-muted-foreground mb-1.5">
                Er zijn kosten geregistreerd maar niet voor alle periodes. ROI berekening is onnauwkeurig.
              </div>
              <div className="text-[10px] font-medium text-foreground mb-1">Ontbrekende periodes:</div>
              <div className="space-y-0.5">
                {gaps.map((g, i) => (
                  <div key={i} className="rounded bg-warning/10 px-2 py-1 text-[9px] font-medium text-warning">{g}</div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // Partial coverage
  if (costMonths > 0 && !costComplete) {
    return (
      <>
        <span
          ref={ref}
          className="inline-flex items-center rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning cursor-help"
          onMouseEnter={handleEnter}
          onMouseLeave={() => setHover(false)}
        >
          {costMonths}/{totalMonths} mnd
        </span>
        {hover && createPortal(
          <div style={{ left: pos.x, top: pos.y }} className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2">
            <div className="rounded-md border border-border/60 bg-white px-4 py-3 shadow-xl max-w-[250px]">
              <div className="text-xs font-semibold text-warning mb-1">Onvolledige kostendata</div>
              <div className="text-[10px] text-muted-foreground">
                Kosten voor {costMonths} van {totalMonths} maanden. ROI/CPL berekeningen zijn onnauwkeurig.
              </div>
              <div className="mt-1.5 text-[10px] font-medium text-foreground">Ontbrekende maanden:</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {missingMonths.map((m) => (
                  <span key={m} className="inline-flex rounded bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning">{m}</span>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return null;
}

// ─── Beheer Tab ───

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  meta_api: { label: "API Sync", color: "bg-success/10 text-success" },
  solvari_api: { label: "API Sync", color: "bg-success/10 text-success" },
  solvari_csv: { label: "CSV Upload", color: "bg-primary/10 text-primary" },
  invoice_ai: { label: "Factuur (AI)", color: "bg-primary/10 text-primary" },
  manual: { label: "Manueel", color: "bg-warning/10 text-warning" },
};

function BeheerTab() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.canEdit);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<{
    channels: string[];
    months: string[];
    matrix: Record<string, Record<string, { amount: number; source: string | null; updatedAt: string | null; type: string }>>;
  }>({
    queryKey: ["costs", "status-matrix"],
    queryFn: async () => (await api.get("/costs/status-matrix?dateFrom=2025-09-01")).data,
  });

  const handleSave = async (channel: string, month: string) => {
    const key = `${channel}__${month}`;
    const val = parseFloat(editValues[key] || "0");
    setSaving(true);
    try {
      await api.put("/costs/channel-month", { channel, month, amount: val });
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      setEditValues((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } finally {
      setSaving(false);
    }
  };

  const autoSources = new Set(["meta_api", "solvari_api"]);
  const isAutoChannel = (ch: string) => {
    if (!data?.matrix[ch]) return false;
    return Object.values(data.matrix[ch]).some((c) => c.source && autoSources.has(c.source));
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-foreground mb-2">Hoe werkt kostenbeheer?</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
            <div className="rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-success" />
                <span className="font-semibold text-success">API Sync</span>
              </div>
              <p className="text-xs text-muted-foreground">Meta Ads en Google Ads worden automatisch bijgewerkt via hun API. Deze cellen zijn read-only.</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="font-semibold text-primary">CSV / Factuur Upload</span>
              </div>
              <p className="text-xs text-muted-foreground">Solvari kosten via CSV upload hieronder. Overige facturen via de Facturen pagina (met AI parsing).</p>
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-warning" />
                <span className="font-semibold text-warning">Manueel Invoeren</span>
              </div>
              <p className="text-xs text-muted-foreground">Voor kanalen zonder API (Bis Beurs, Red Pepper, etc.) — klik op "+ invoeren" in de matrix hieronder.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Matrix */}
      {data && data.channels.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Kosten per Kanaal per Maand</CardTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> API</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Upload</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> Manueel</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Ontbreekt</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-white min-w-[150px] z-10">Kanaal</th>
                    {data.months.map((m) => (
                      <th key={m} className="pb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[120px]">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.channels.map((ch) => (
                    <tr key={ch} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-3 font-medium text-foreground sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch] || "#94a3b8" }} />
                          {ch}
                        </div>
                      </td>
                      {data.months.map((month) => {
                        const cell = data.matrix[ch]?.[month];
                        const key = `${ch}__${month}`;
                        const isEditing = key in editValues;

                        if (cell) {
                          const src = SOURCE_LABELS[cell.source || ""] || { label: cell.source || "?", color: "bg-muted text-muted-foreground" };
                          const ago = cell.updatedAt ? Math.round((Date.now() - new Date(cell.updatedAt).getTime()) / 3600000) : null;
                          const editable = canEdit() && !isAutoChannel(ch);

                          return (
                            <td key={month} className="py-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    className="w-20 rounded border border-border px-1.5 py-1 text-xs text-center"
                                    value={editValues[key]}
                                    onChange={(e) => setEditValues({ ...editValues, [key]: e.target.value })}
                                    placeholder="€"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(ch, month); if (e.key === "Escape") setEditValues((p) => { const n = { ...p }; delete n[key]; return n; }); }}
                                  />
                                  <button className="text-xs text-success font-semibold hover:underline" onClick={() => handleSave(ch, month)} disabled={saving}>OK</button>
                                </div>
                              ) : (
                                <div
                                  className={`flex flex-col items-center gap-0.5 ${editable ? "cursor-pointer rounded-lg px-1 py-0.5 hover:bg-muted/60 transition-colors" : ""}`}
                                  onClick={editable ? () => setEditValues({ ...editValues, [key]: String(cell.amount) }) : undefined}
                                  title={editable ? "Klik om te bewerken" : undefined}
                                >
                                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(cell.amount)}</span>
                                  <span className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-medium ${src.color}`}>{src.label}</span>
                                  {ago !== null && <span className="text-[9px] text-muted-foreground/50">{ago < 1 ? "< 1u" : ago < 24 ? `${ago}u` : `${Math.round(ago / 24)}d`} geleden</span>}
                                </div>
                              )}
                            </td>
                          );
                        }

                        if (canEdit() && !isAutoChannel(ch)) {
                          return (
                            <td key={month} className="py-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    className="w-20 rounded border border-border px-1.5 py-1 text-xs text-center"
                                    value={editValues[key]}
                                    onChange={(e) => setEditValues({ ...editValues, [key]: e.target.value })}
                                    placeholder="€"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(ch, month); if (e.key === "Escape") setEditValues((p) => { const n = { ...p }; delete n[key]; return n; }); }}
                                  />
                                  <button className="text-xs text-success font-semibold hover:underline" onClick={() => handleSave(ch, month)} disabled={saving}>OK</button>
                                </div>
                              ) : (
                                <button
                                  className="rounded-lg border border-dashed border-muted-foreground/30 px-3 py-1.5 text-[10px] text-muted-foreground/50 hover:border-primary hover:text-primary transition-colors"
                                  onClick={() => setEditValues({ ...editValues, [key]: "" })}
                                >+ invoeren</button>
                              )}
                            </td>
                          );
                        }

                        return <td key={month} className="py-3 text-center"><span className="text-muted-foreground/30">—</span></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add new cost line (lead spend) */}
      {canEdit() && data && data.months.length > 0 && (
        <AddCostLine months={data.months} existingChannels={data.channels} />
      )}

      {/* ─── Algemene Kosten — overhead, non-lead-spend ─── */}
      <AlgemeenMatrix />

      {canEdit() && data && data.months.length > 0 && (
        <AddAlgemeenCostLine months={data.months} />
      )}
    </div>
  );
}

// ─── Add Cost Line (new channel + bulk months) ───

const SUGGESTED_CHANNELS = [
  "Solvari", "Red Pepper", "Renocheck", "PPA", "Bis Beurs",
  "Bouw En Reno", "Offertevergelijker", "Serieus Verbouwen",
  "Jaimy", "Fourvision", "Giga Leads", "Reactivatie",
];

const MONTH_NAMES_NL: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mrt", "04": "Apr", "05": "Mei", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Dec",
};

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES_NL[m] || m} '${y.slice(2)}`;
}

function AddCostLine({ months, existingChannels }: { months: string[]; existingChannels: string[] }) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState("");
  const [description, setDescription] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = months.reduce((s, m) => s + (parseFloat(values[m] || "0") || 0), 0);
  const filledCount = months.filter((m) => parseFloat(values[m] || "0") > 0).length;
  const trimmed = channel.trim();
  const channelExists = trimmed.length > 0 && existingChannels.some((c) => c.toLowerCase() === trimmed.toLowerCase());
  const canSave = !!trimmed && filledCount > 0 && !saving;

  const reset = () => {
    setChannel("");
    setDescription("");
    setValues({});
    setError(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const requests = months
        .filter((m) => parseFloat(values[m] || "0") > 0)
        .map((m) =>
          api.put("/costs/channel-month", {
            channel: trimmed,
            month: m,
            amount: parseFloat(values[m]),
            description: description.trim() || undefined,
          })
        );
      await Promise.all(requests);
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      reset();
    } catch (e: any) {
      setError(e?.response?.data?.error || "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-dashed border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5">
            <Plus className="h-4 w-4 text-primary" />
            Nieuwe kostenpost toevoegen
            <InfoTooltip text="Voeg een nieuw kanaal of een nieuwe rij toe en vul de bedragen voor één of meer maanden tegelijk in. Bestaande kanalen kunnen ook hier hun nieuwe maandkost krijgen — deze wordt samengevoegd met wat er al staat." />
          </CardTitle>
          {saved && <span className="text-xs font-semibold text-success">Opgeslagen</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Channel name + description */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Kanaal / Kostenpost
            </label>
            <Input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="bv. Solvari, Bis Beurs, Eventbudget..."
              list="cost-channel-suggestions"
              className="h-9"
            />
            <datalist id="cost-channel-suggestions">
              {SUGGESTED_CHANNELS.map((s) => (<option key={s} value={s} />))}
            </datalist>
            {channelExists && (
              <p className="mt-1 text-[11px] text-amber-600">
                Bestaand kanaal — bedragen worden toegevoegd of overschreven.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Omschrijving (optioneel)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="bv. Q4 campagne, beursdeelname..."
              className="h-9"
            />
          </div>
        </div>

        {/* Month grid */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bedragen per maand
            </label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Totaal: <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
              {filledCount > 0 && <span> · {filledCount} maand{filledCount !== 1 && "en"}</span>}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {months.map((m) => (
              <div key={m}>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {fmtMonthLabel(m)}
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">€</span>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={values[m] || ""}
                    onChange={(e) => setValues({ ...values, [m]: e.target.value })}
                    placeholder="0"
                    className="h-8 pl-5 pr-1.5 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
          {(trimmed || filledCount > 0) && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Wissen
            </button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Opslaan..." : `Opslaan${filledCount > 0 ? ` (${filledCount})` : ""}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Info Modal ───

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-border/60 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">Metrics Uitleg</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-4 text-sm">
          {[
            { code: "CPL", color: "bg-primary/10 text-primary", name: "Cost Per Lead", desc: "Totale kost / aantal leads. Hoeveel kost het om 1 lead te genereren?" },
            { code: "KPA", color: "bg-secondary/10 text-secondary", name: "Kost Per Afspraak", desc: "Totale kost / aantal afspraken. Hoeveel kost het om 1 afspraak te krijgen?" },
            { code: "COA", color: "bg-destructive/10 text-destructive", name: "Cost Of Acquisition", desc: "Totale kost / gewonnen deals. Hoeveel kost het om 1 klant binnen te halen?" },
            { code: "ROI", color: "bg-success/10 text-success", name: "Return On Investment", desc: "Omzet / totale kost. Hoeveel euro krijg je terug per euro die je investeert?" },
            { code: "K/O", color: "bg-muted text-muted-foreground", name: "Kost vs Omzet %", desc: "Kost / Omzet x 100%. Welk deel van je omzet gaat naar marketing? Lager = beter." },
          ].map((m) => (
            <div key={m.code}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex h-6 min-w-[44px] items-center justify-center rounded-md px-2 text-xs font-bold ${m.color}`}>{m.code}</span>
                <span className="font-semibold text-foreground">{m.name}</span>
              </div>
              <p className="text-muted-foreground ml-[52px]">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Algemene Kosten Matrix (overhead, non-lead-spend) ───────────────────

const ALGEMEEN_CATEGORIES = [
  "Beurzen",
  "Offline marketing + diverse kosten",
  "Call Centre kosten",
  "Marketing team",
  "Fees",
  "Sponsoring kosten",
  "IT-Systemen",
];

interface AlgemeenMatrixData {
  lineItems: string[];
  lineMeta: Record<string, { category: string; subcategory: string }>;
  months: string[];
  matrix: Record<string, Record<string, {
    amount: number;
    budget: number | null;
    source: string | null;
    updatedAt: string | null;
    type: string;
  }>>;
}

function AlgemeenMatrix() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.canEdit);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<AlgemeenMatrixData>({
    queryKey: ["costs", "algemeen-matrix"],
    queryFn: async () => (await api.get("/costs/algemeen-matrix?dateFrom=2026-01-01&dateTo=2026-12-31")).data,
  });

  const handleSave = async (category: string, subcategory: string, month: string, key: string) => {
    const raw = editValues[key];
    const val = raw === "" || raw === undefined ? null : parseFloat(raw);
    setSaving(true);
    try {
      await api.put("/costs/category-month", { category, subcategory, month, amount: val });
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      setEditValues((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } finally {
      setSaving(false);
    }
  };

  if (!data) return null;

  // Group line items by category for visual blocking
  const grouped = new Map<string, string[]>();
  for (const k of data.lineItems) {
    const meta = data.lineMeta[k];
    if (!meta) continue;
    const arr = grouped.get(meta.category) || [];
    arr.push(k);
    grouped.set(meta.category, arr);
  }

  if (data.lineItems.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Algemene Kosten</CardTitle></CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nog geen algemene kosten of budget rijen — voeg er een toe via het formulier hieronder.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5">
            Algemene Kosten — Budget vs Werkelijk
            <InfoTooltip text="Overhead-kosten die NIET in ROI/CPL worden meegerekend (Beurzen, Marketing team, IT, sponsoring, fees, ...). Klik op een cel om de werkelijke kost in te vullen. De grijze waarde toont het budget uit het 2026 budgetplan." />
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> Manueel</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Geen kost</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-white min-w-[280px] z-10">Lijn-item</th>
                {data.months.map((m) => (
                  <th key={m} className="pb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[110px]">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([category, items]) => (
                <Fragment key={category}>
                  <tr className="bg-muted/40">
                    <td colSpan={data.months.length + 1} className="py-2 px-3 text-xs font-bold uppercase tracking-wider text-foreground">
                      {category}
                    </td>
                  </tr>
                  {items.map((k) => {
                    const meta = data.lineMeta[k];
                    return (
                      <tr key={k} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-3 sticky left-0 bg-white z-10">
                          <div className="text-sm text-foreground">{meta?.subcategory || "(geen subcategorie)"}</div>
                        </td>
                        {data.months.map((month) => {
                          const cell = data.matrix[k]?.[month];
                          const editKey = `${k}__${month}`;
                          const isEditing = editKey in editValues;
                          const editable = canEdit();

                          if (isEditing) {
                            return (
                              <td key={month} className="py-2 text-center">
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    step="any"
                                    className="w-20 rounded border border-border px-1.5 py-1 text-xs text-center"
                                    value={editValues[editKey]}
                                    onChange={(e) => setEditValues({ ...editValues, [editKey]: e.target.value })}
                                    placeholder="€"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(meta.category, meta.subcategory, month, editKey); if (e.key === "Escape") setEditValues((p) => { const n = { ...p }; delete n[editKey]; return n; }); }}
                                  />
                                  <button
                                    className="text-xs text-success font-semibold hover:underline"
                                    onClick={() => handleSave(meta.category, meta.subcategory, month, editKey)}
                                    disabled={saving}
                                  >OK</button>
                                </div>
                              </td>
                            );
                          }

                          if (cell && cell.amount > 0) {
                            return (
                              <td key={month} className="py-2 text-center">
                                <button
                                  className={editable ? "flex flex-col items-center gap-0.5 cursor-pointer rounded-lg px-1 py-0.5 hover:bg-muted/60 transition-colors w-full" : "flex flex-col items-center gap-0.5 w-full"}
                                  onClick={editable ? () => setEditValues({ ...editValues, [editKey]: String(cell.amount) }) : undefined}
                                  title={editable ? "Klik om te bewerken" : undefined}
                                >
                                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(cell.amount)}</span>
                                  {cell.budget !== null && (
                                    <span className="text-[9px] text-muted-foreground">budget {formatCurrency(cell.budget)}</span>
                                  )}
                                </button>
                              </td>
                            );
                          }

                          // No actual cost — show budget placeholder if available, plus an inline + button
                          if (cell && cell.budget !== null) {
                            return (
                              <td key={month} className="py-2 text-center">
                                {editable ? (
                                  <button
                                    className="flex flex-col items-center gap-0.5 cursor-pointer rounded-lg border border-dashed border-muted-foreground/30 px-2 py-1 hover:border-primary hover:text-primary transition-colors w-full"
                                    onClick={() => setEditValues({ ...editValues, [editKey]: "" })}
                                  >
                                    <span className="text-[10px] text-muted-foreground/60">+ invoeren</span>
                                    <span className="text-[9px] text-muted-foreground">budget {formatCurrency(cell.budget)}</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">budget {formatCurrency(cell.budget)}</span>
                                )}
                              </td>
                            );
                          }

                          // Nothing at all
                          if (editable) {
                            return (
                              <td key={month} className="py-2 text-center">
                                <button
                                  className="rounded-lg border border-dashed border-muted-foreground/30 px-3 py-1.5 text-[10px] text-muted-foreground/50 hover:border-primary hover:text-primary transition-colors"
                                  onClick={() => setEditValues({ ...editValues, [editKey]: "" })}
                                >+ invoeren</button>
                              </td>
                            );
                          }
                          return <td key={month} className="py-2 text-center"><span className="text-muted-foreground/30">—</span></td>;
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Add new algemene kostenpost (category + subcategory + bulk months) ──

function AddAlgemeenCostLine({ months }: { months: string[] }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = months.reduce((s, m) => s + (parseFloat(values[m] || "0") || 0), 0);
  const filledCount = months.filter((m) => parseFloat(values[m] || "0") > 0).length;
  const trimmedCat = category.trim();
  const trimmedSub = subcategory.trim();
  const canSave = !!trimmedCat && filledCount > 0 && !saving;

  const reset = () => {
    setCategory("");
    setSubcategory("");
    setDescription("");
    setValues({});
    setError(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const requests = months
        .filter((m) => parseFloat(values[m] || "0") > 0)
        .map((m) =>
          api.put("/costs/category-month", {
            category: trimmedCat,
            subcategory: trimmedSub || null,
            month: m,
            amount: parseFloat(values[m]),
            description: description.trim() || undefined,
          })
        );
      await Promise.all(requests);
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      reset();
    } catch (e: any) {
      setError(e?.response?.data?.error || "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-dashed border-warning/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5">
            <Plus className="h-4 w-4 text-warning" />
            Nieuwe algemene kostenpost toevoegen
            <InfoTooltip text="Voor overhead-kosten die geen lead-spend zijn (kantoorhuur, salarissen, sponsoring, IT, beurzen, ...). Worden niet gebruikt voor ROI/CPL berekeningen." />
          </CardTitle>
          {saved && <span className="text-xs font-semibold text-success">Opgeslagen</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Categorie
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-lg border border-border/60 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— kies categorie —</option>
              {ALGEMEEN_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Subcategorie / lijn-item
            </label>
            <Input
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="bv. Jordy, Adobe, AA Gent..."
              className="h-9"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Omschrijving (optioneel)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="bv. Jaarcontract, Q1 sponsorbijdrage..."
              className="h-9"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bedragen per maand
            </label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Totaal: <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
              {filledCount > 0 && <span> · {filledCount} maand{filledCount !== 1 && "en"}</span>}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {months.map((m) => (
              <div key={m}>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {m}
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">€</span>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={values[m] || ""}
                    onChange={(e) => setValues({ ...values, [m]: e.target.value })}
                    placeholder="0"
                    className="h-8 pl-5 pr-1.5 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
          {(trimmedCat || filledCount > 0) && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Wissen
            </button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Opslaan..." : `Opslaan${filledCount > 0 ? ` (${filledCount})` : ""}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
