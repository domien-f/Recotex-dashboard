import { useState } from "react";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReclamationStats, useReclamationDeals } from "@/hooks/useDeals";
import { formatNumber, formatPercent } from "@/lib/utils";
import { AlertTriangle, Ban, Users, TrendingDown } from "lucide-react";
import { MetricLabel } from "@/components/ui/metric-label";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";

const REASON_COLORS: Record<string, string> = {
  "niet bereikbaar": "#ef4444",
  "foute contactinfo": "#f97316",
  "geen interesse (ook misverstand)": "#eab308",
  "dubbele ingave (duplicaten)": "#8b5cf6",
  "concurrent": "#6366f1",
  "annulatie afspraak": "#ec4899",
  "werken die wij niet uitvoeren": "#14b8a6",
  "on hold": "#64748b",
  "misleidende reclame": "#f43f5e",
  "enkel interesse premies": "#a855f7",
  "out of regio": "#06b6d4",
  "irrelevant (totaal geen link met onze werken)": "#84cc16",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-white px-4 py-3 shadow-xl">
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

export function ReclamatiesPage() {
  const { data: stats, isLoading: loadingStats } = useReclamationStats();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data: dealsData, isLoading: loadingDeals } = useReclamationDeals(search, page);

  if (loadingStats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Reclamaties laden...</span>
        </div>
      </div>
    );
  }

  const categoryData = stats?.byCategory.slice(0, 12).map((c) => ({
    reason: c.reason.length > 25 ? c.reason.slice(0, 25) + "..." : c.reason,
    fullReason: c.reason,
    count: c.count,
    fill: REASON_COLORS[c.reason] || "#94a3b8",
  })) || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reclamaties</h1>
        <p className="mt-1 text-sm text-muted-foreground">Niet-bruikbare deals categoriseren en analyseren per bron</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Totaal Reclamaties" value={formatNumber(stats?.totalReclamations || 0)} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard title="Reclamatie %" value={formatPercent(stats?.reclamationRate || 0)} icon={<Ban className="h-4 w-4" />} formula={{ label: "Reclamatie Percentage", description: "Contacten met reclamatie (zonder WON)", formula: "(Reclamatie contacten ÷ Totaal contacten) × 100%" }} />
        <KpiCard title="Totaal Deals" value={formatNumber(stats?.totalDeals || 0)} icon={<Users className="h-4 w-4" />} />
        <KpiCard title="Meest voorkomend" value={stats?.byCategory[0]?.reason || "-"} icon={<TrendingDown className="h-4 w-4" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Reclamaties per Reden</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={categoryData} layout="vertical" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="reason" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} width={160} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Reclamaties" radius={[0, 6, 6, 0]}>
                  {categoryData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Trend in % */}
        {stats?.trend && stats.trend.length > 1 && (
          <Card>
            <CardHeader><CardTitle>Reclamatie Trend (%)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={stats.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, "auto"]} />
                  <Tooltip formatter={(value: any) => [`${value}%`, "Reclamatie %"]} contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
                  <Line type="monotone" dataKey="percentage" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: "#ef4444" }} name="Reclamatie %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Channel Ratio Table */}
      {stats?.byChannel && stats.byChannel.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Reclamatie Ratio per Kanaal</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kanaal</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Totaal Deals</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reclamaties</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Recl.%" /></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byChannel.map((ch) => (
                    <tr key={ch.channel} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                      <td className="py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-2 rounded-full bg-destructive" />
                          <span className="font-medium text-foreground">{ch.channel}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-right tabular-nums">{ch.totalDeals}</td>
                      <td className="py-3.5 text-right font-medium tabular-nums text-destructive">{ch.reclamations}</td>
                      <td className="py-3.5 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          Number(ch.reclamationRate) > 20 ? "bg-destructive/10 text-destructive" :
                          Number(ch.reclamationRate) > 10 ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground"
                        }`}>{formatPercent(ch.reclamationRate)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deals Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Gereclameerde Deals</CardTitle>
            <Input placeholder="Zoeken..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-72 rounded-lg" />
          </div>
        </CardHeader>
        <CardContent>
          {loadingDeals ? (<p className="text-muted-foreground">Laden...</p>) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-3 font-medium">Naam</th>
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Herkomst</th>
                      <th className="pb-3 font-medium">Redenen</th>
                      <th className="pb-3 font-medium">Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealsData?.deals.map((deal) => (
                      <tr key={deal.id} className="border-b border-border/50 transition-colors hover:bg-accent/50">
                        <td className="py-3 font-medium text-foreground">{deal.contact?.name || deal.title || "-"}</td>
                        <td className="py-3 text-muted-foreground">{deal.contact?.email || "-"}</td>
                        <td className="py-3">{deal.herkomst || "-"}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {deal.reclamatieRedenen.slice(0, 2).map((r, i) => (
                              <Badge key={i} variant="destructive">{r}</Badge>
                            ))}
                            {deal.reclamatieRedenen.length > 2 && (
                              <Badge variant="outline">+{deal.reclamatieRedenen.length - 2}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {deal.dealCreatedAt ? new Date(deal.dealCreatedAt).toLocaleDateString("nl-BE") : "-"}
                        </td>
                      </tr>
                    ))}
                    {dealsData?.deals.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Geen reclamaties gevonden</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{dealsData?.total || 0} reclamaties totaal</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Vorige</Button>
                  <Button variant="outline" size="sm" disabled={(dealsData?.deals.length || 0) < 25} onClick={() => setPage(page + 1)}>Volgende</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
