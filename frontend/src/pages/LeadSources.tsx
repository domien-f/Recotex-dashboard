import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useChannelMetrics } from "@/hooks/useMetrics";
import { useFilterStore } from "@/store/filterStore";
import api from "@/lib/api";
import { formatCurrency, formatPercent, formatNumber, isFreeChannel } from "@/lib/utils";
import { MapPin, TrendingUp, BarChart3, Users, Layers } from "lucide-react";
import { MetricLabel } from "@/components/ui/metric-label";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap,
} from "recharts";

const COLORS: Record<string, string> = {
  Solvari: "#f08300", "Red Pepper": "#ef4444", Renocheck: "#8b5cf6",
  "META Leads": "#3b82f6", Website: "#10b981", PPA: "#1a3860",
  "Bis Beurs": "#f59e0b", "Bouw En Reno": "#06b6d4", "Eigen lead medewerker": "#ec4899",
  "Serieus Verbouwen": "#64748b", "Referentie (van de klant)": "#84cc16",
  "Offertevergelijker": "#a855f7", GOOGLE: "#14b8a6",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-md border border-border/60 bg-white px-4 py-3 shadow-xl">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

const TreemapContent = ({ x, y, width, height, name, deals, fill }: any) => {
  if (width < 50 || height < 35) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} stroke="#fff" strokeWidth={2} />
      <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={width > 90 ? 12 : 10} fontWeight={600}>{name}</text>
      <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={10}>{deals}</text>
    </g>
  );
};

export function LeadSourcesPage() {
  const { dateFrom, dateTo } = useFilterStore();
  const { data: channels, isLoading } = useChannelMetrics();
  const [selected, setSelected] = useState<string[]>([]);

  const { data: sourceDetail } = useQuery({
    queryKey: ["lead-sources", dateFrom, dateTo],
    queryFn: async () => (await api.get("/metrics/lead-sources", { params: { dateFrom, dateTo } })).data as any[],
  });

  if (isLoading || !channels) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const sorted = [...channels].sort((a, b) => b.deals - a.deals);
  const totalDeals = sorted.reduce((s, c) => s + c.deals, 0);
  const totalRevenue = sorted.reduce((s, c) => s + c.revenue, 0);
  const totalWon = sorted.reduce((s, c) => s + c.won, 0);
  const ownChannels = ["Website", "Referentie (van de klant)", "Eigen lead medewerker", "Eigen lead", "Reactivatie", "META Leads", "GOOGLE", "Google Leads", "Red Pepper"];
  const ownDeals = sorted.filter((c) => ownChannels.includes(c.channel)).reduce((s, c) => s + c.deals, 0);
  const ownPct = totalDeals > 0 ? (ownDeals / totalDeals) * 100 : 0;

  // Treemap data
  const treemapData = sorted.filter((c) => c.deals > 5).map((c) => ({
    name: c.channel, deals: c.deals, size: c.deals, fill: COLORS[c.channel] || "#94a3b8",
  }));

  // Stacked bar: eigen vs third-party per kanaal
  const channelTypeData = sorted.filter((c) => c.deals > 10).map((c) => ({
    channel: c.channel,
    won: c.won,
    lost: c.lost,
    appointments: c.appointments,
  }));

  // Radar data for comparison (selected channels)
  const compareChannels = selected.length >= 2 ? selected : sorted.slice(0, 3).map((c) => c.channel);
  const radarMetrics = ["deals", "won", "appointments", "revenue", "cost"];
  const maxVals: Record<string, number> = {};
  for (const m of radarMetrics) {
    maxVals[m] = Math.max(...sorted.map((c) => Number((c as any)[m]) || 0), 1);
  }
  const radarData = radarMetrics.map((m) => {
    const point: any = { metric: m === "deals" ? "Leads" : m === "won" ? "Won" : m === "appointments" ? "Afspraken" : m === "revenue" ? "Omzet" : "Kosten" };
    for (const ch of compareChannels) {
      const channel = sorted.find((c) => c.channel === ch);
      point[ch] = channel ? Math.round((Number((channel as any)[m]) || 0) / maxVals[m] * 100) : 0;
    }
    return point;
  });

  // Source quality from API
  const qualityData = (sourceDetail || []).map((s: any) => ({
    channel: s.channel,
    quality: (100 - Number(s.reclamationRate)).toFixed(1),
    winRate: s.winRate,
    reclamationRate: s.reclamationRate,
  })).sort((a: any, b: any) => Number(b.quality) - Number(a.quality));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Lead Herkomst</h1>
        <p className="mt-1 text-sm text-muted-foreground">Analyse per kanaal — volume, kwaliteit en rendement</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        <KpiCard title="Kanalen" value={formatNumber(sorted.length)} icon={<Layers className="h-4 w-4" />} />
        <KpiCard title="Totaal Leads" value={formatNumber(totalDeals)} icon={<Users className="h-4 w-4" />} />
        <KpiCard title="Won Deals" value={formatNumber(totalWon)} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard title="Totale Omzet" value={formatCurrency(totalRevenue)} icon={<BarChart3 className="h-4 w-4" />} />
        <KpiCard title="Eigen Leads" value={`${ownPct.toFixed(1)}%`} icon={<MapPin className="h-4 w-4" />} formula={{ label: "Eigen Leads Percentage", description: "Aandeel leads uit eigen kanalen", formula: "(Eigen leads ÷ Totaal leads) × 100%" }} />
      </div>

      {/* Treemap + Volume Bar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Lead Volume per Kanaal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <Treemap data={treemapData} dataKey="size" aspectRatio={4 / 3} content={<TreemapContent />} />
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Won vs Lost per Kanaal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={channelTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="channel" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                <Bar dataKey="won" stackId="a" fill="#10b981" name="Won" />
                <Bar dataKey="lost" stackId="a" fill="#ef4444" name="Lost" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Radar Comparison */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Kanaal Vergelijking</CardTitle>
            <div className="flex flex-wrap gap-1">
              {sorted.filter((c) => c.deals > 10).map((c) => (
                <button
                  key={c.channel}
                  onClick={() => {
                    setSelected((prev) =>
                      prev.includes(c.channel) ? prev.filter((x) => x !== c.channel) : [...prev, c.channel].slice(-4)
                    );
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    compareChannels.includes(c.channel)
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground hover:bg-primary/10"
                  }`}
                >
                  {c.channel}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#71717a" }} />
              <PolarRadiusAxis tick={false} axisLine={false} />
              {compareChannels.map((ch, i) => (
                <Radar key={ch} name={ch} dataKey={ch} stroke={Object.values(COLORS)[i % Object.values(COLORS).length]} fill={Object.values(COLORS)[i % Object.values(COLORS).length]} fillOpacity={0.15} strokeWidth={2} />
              ))}
              <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">Waarden genormaliseerd (0-100) relatief aan het best presterende kanaal. Klik op kanalen hierboven om te vergelijken.</p>
        </CardContent>
      </Card>

      {/* Quality Table */}
      <Card>
        <CardHeader><CardTitle>Kwaliteitsanalyse per Kanaal</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kanaal</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deals</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Won</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Win%" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Recl.%" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Kwaliteit" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Omzet</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="CPL" /></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="ROI" /></th>
                </tr>
              </thead>
              <tbody>
                {sorted.filter((c) => c.deals > 0).map((ch) => {
                  const source = qualityData.find((q: any) => q.channel === ch.channel);
                  const isOwn = ownChannels.includes(ch.channel);
                  const quality = source ? Number(source.quality) : null;
                  return (
                    <tr key={ch.channel} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                      <td className="py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[ch.channel] || "#94a3b8" }} />
                          <span className="font-medium text-foreground">{ch.channel}</span>
                        </div>
                      </td>
                      <td className="py-3.5">
                        <Badge variant={isOwn ? "success" : "outline"}>{isOwn ? "Eigen" : "Third-party"}</Badge>
                      </td>
                      <td className="py-3.5 text-right tabular-nums">{ch.deals}</td>
                      <td className="py-3.5 text-right tabular-nums font-medium text-success">{ch.won}</td>
                      <td className="py-3.5 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          Number(ch.winRate) >= 10 ? "bg-success/10 text-success" :
                          Number(ch.winRate) >= 5 ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground"
                        }`}>{formatPercent(ch.winRate)}</span>
                      </td>
                      <td className="py-3.5 text-right">
                        {source ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            Number(source.reclamationRate) > 50 ? "bg-destructive/10 text-destructive" :
                            Number(source.reclamationRate) > 20 ? "bg-warning/10 text-warning" :
                            "bg-success/10 text-success"
                          }`}>{formatPercent(source.reclamationRate)}</span>
                        ) : "-"}
                      </td>
                      <td className="py-3.5 text-right">
                        {quality !== null ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-success" style={{ width: `${quality}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">{quality.toFixed(0)}%</span>
                          </div>
                        ) : "-"}
                      </td>
                      <td className="py-3.5 text-right font-semibold tabular-nums">{formatCurrency(ch.revenue)}</td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{isFreeChannel(ch.channel) ? <span className="text-xs text-muted-foreground/60">NVT</span> : ch.cost > 0 ? formatCurrency(ch.cpl) : "-"}</td>
                      <td className="py-3.5 text-right">
                        {isFreeChannel(ch.channel) ? <span className="text-xs text-muted-foreground/60">NVT</span> : ch.cost > 0 ? (
                          <span className={`font-semibold tabular-nums ${parseFloat(ch.roi) >= 5 ? "text-success" : parseFloat(ch.roi) >= 1 ? "text-primary" : "text-destructive"}`}>{ch.roi}x</span>
                        ) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Eigen vs Third-party Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Eigen vs Third-party</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const ownData = sorted.filter((c) => ownChannels.includes(c.channel));
              const tpData = sorted.filter((c) => !ownChannels.includes(c.channel));
              const ownTotal = ownData.reduce((s, c) => s + c.deals, 0);
              const tpTotal = tpData.reduce((s, c) => s + c.deals, 0);
              const ownWon = ownData.reduce((s, c) => s + c.won, 0);
              const tpWon = tpData.reduce((s, c) => s + c.won, 0);
              const ownRev = ownData.reduce((s, c) => s + c.revenue, 0);
              const tpRev = tpData.reduce((s, c) => s + c.revenue, 0);
              const data = [
                { type: "Eigen kanalen", deals: ownTotal, won: ownWon, winRate: ownTotal > 0 ? ((ownWon / ownTotal) * 100).toFixed(1) : "0", revenue: ownRev },
                { type: "Third-party", deals: tpTotal, won: tpWon, winRate: tpTotal > 0 ? ((tpWon / tpTotal) * 100).toFixed(1) : "0", revenue: tpRev },
              ];
              return (
                <div className="space-y-4">
                  {data.map((d) => (
                    <div key={d.type} className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{d.type}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(d.deals)} leads, {formatNumber(d.won)} won</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-foreground">{formatCurrency(d.revenue)}</p>
                        <p className="text-xs text-muted-foreground">Win rate: {d.winRate}%</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">Eigen leads aandeel</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${ownPct}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-foreground">{ownPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Deals per Kanaal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sorted.filter((c) => c.deals > 5)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="channel" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="deals" fill="#1a3860" name="Deals" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
