import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


import { useAuthStore } from "@/store/authStore";
import { useMetricsOverview, useChannelMetrics, useCostVsRevenue } from "@/hooks/useMetrics";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Euro, TrendingUp, TrendingDown, Wallet, ArrowUpDown, CalendarCheck, HelpCircle, X, Settings, BarChart } from "lucide-react";
import { MetricLabel } from "@/components/ui/metric-label";
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
  const { data: overview, isLoading } = useMetricsOverview();
  const { data: channels } = useChannelMetrics();
  const { data: costVsRevenue } = useCostVsRevenue();

  if (isLoading) return <div className="flex h-32 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  const totalCost = overview?.totalCost || 0;
  const totalRevenue = overview?.totalRevenue || 0;
  const netResult = totalRevenue - totalCost;

  const costCompareData = (channels || []).filter((ch) => ch.cost > 0).sort((a, b) => b.cost - a.cost).map((ch) => ({
    channel: ch.channel, CPL: parseFloat(ch.cpl), KPA: parseFloat(ch.kpa), COA: parseFloat(ch.coa),
  }));

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-6">
        <KpiCard title="Totale Kost" value={formatCurrency(totalCost)} icon={<Euro className="h-4 w-4" />} isEstimated={overview?.hasEstimatedCosts} />
        <KpiCard title="Totale Omzet" value={formatCurrency(totalRevenue)} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard title="Netto Resultaat" value={formatCurrency(netResult)} icon={netResult >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} />
        <KpiCard title="CPL" value={formatCurrency(overview?.cpl || 0)} icon={<BarChart className="h-4 w-4" />} />
        <KpiCard title="KPA" value={formatCurrency(overview?.kpa || 0)} icon={<CalendarCheck className="h-4 w-4" />} />
        <KpiCard title="ROI" value={`${overview?.roi || 0}x`} icon={<ArrowUpDown className="h-4 w-4" />} />
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
        <CardHeader><CardTitle>Kosten & ROI per Kanaal</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  {["Kanaal", "Deals", "Won", "Kost", "Omzet"].map((h) => (
                    <th key={h} className={`pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${h !== "Kanaal" ? "text-right" : ""}`}>{h}</th>
                  ))}
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="CPL" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="KPA" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="COA" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="ROI" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="K/O" /></th>
                </tr>
              </thead>
              <tbody>
                {(channels || []).filter((ch) => ch.deals > 0).sort((a, b) => b.cost - a.cost || b.deals - a.deals).map((ch) => {
                  const costVsRev = ch.revenue > 0 ? ((ch.cost / ch.revenue) * 100) : 0;
                  return (
                    <tr key={ch.channel} className="border-b border-border/30 hover:bg-muted/50">
                      <td className="py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch.channel] || "#94a3b8" }} />
                          <span className="font-medium text-foreground">{ch.channel}</span>
                          <CostCoverageBadge channel={ch.channel} costMonths={ch.costMonths} totalMonths={ch.totalMonths} costComplete={ch.costComplete} missingMonths={ch.missingMonths} cost={ch.cost} deals={ch.deals} invoiceCoverage={ch.invoiceCoverage} />
                        </div>
                      </td>
                      <td className="py-3.5 text-right tabular-nums">{ch.deals}</td>
                      <td className="py-3.5 text-right font-medium tabular-nums text-success">{ch.won}</td>
                      <td className="py-3.5 text-right tabular-nums">{ch.cost > 0 ? formatCurrency(ch.cost) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right font-semibold tabular-nums">{formatCurrency(ch.revenue)}</td>
                      <td className="py-3.5 text-right tabular-nums">{ch.cost > 0 ? formatCurrency(ch.cpl) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right tabular-nums">{ch.cost > 0 ? formatCurrency(ch.kpa) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right tabular-nums">{ch.cost > 0 ? formatCurrency(ch.coa) : ch.costMonths > 0 ? formatCurrency(0) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right">{ch.cost > 0 ? <span className={`font-semibold tabular-nums ${parseFloat(ch.roi) >= 5 ? "text-success" : parseFloat(ch.roi) >= 1 ? "text-primary" : "text-destructive"}`}>{ch.roi}x</span> : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-3.5 text-right">{ch.cost > 0 && ch.revenue > 0 ? <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${costVsRev < 10 ? "bg-success/10 text-success" : costVsRev < 30 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>{costVsRev.toFixed(1)}%</span> : <span className="text-muted-foreground">-</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
    </div>
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
