import { useState } from "react";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWonDeals } from "@/hooks/useDeals";
import { useChannelMetrics, useMetricsOverview } from "@/hooks/useMetrics";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import { Trophy, Wallet, TrendingUp, Clock, Download } from "lucide-react";
import { exportCSV } from "@/lib/export";
import { MetricLabel } from "@/components/ui/metric-label";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

const CHANNEL_COLORS = ["#f08300", "#1a3860", "#10b981", "#8b5cf6", "#f97316", "#06b6d4", "#ec4899"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-white px-4 py-3 shadow-xl">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color || entry.payload?.fill }} />
          {entry.name}: <span className="font-semibold text-foreground">
            {typeof entry.value === "number" && entry.value > 100 ? formatCurrency(entry.value) : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
};

export function WonLeadsPage() {
  const { data: overview, isLoading: loadingOverview } = useMetricsOverview();
  const { data: channels } = useChannelMetrics();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data: dealsData, isLoading: loadingDeals } = useWonDeals(search, page);

  if (loadingOverview) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Won deals laden...</span>
        </div>
      </div>
    );
  }

  const wonChannels = channels?.filter((ch) => ch.won > 0) || [];

  const revenueBarData = wonChannels.map((ch) => ({
    channel: ch.channel,
    revenue: Number(ch.revenue),
  }));

  const revenuePieData = wonChannels.map((ch, i) => ({
    name: ch.channel,
    value: Number(ch.revenue),
    fill: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
  }));

  const avgDoorlooptijd = dealsData?.deals.length
    ? Math.round(
        dealsData.deals.reduce((sum, deal) => {
          if (!deal.wonAt || !deal.dealCreatedAt) return sum;
          const days = (new Date(deal.wonAt).getTime() - new Date(deal.dealCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / dealsData.deals.filter((d) => d.wonAt && d.dealCreatedAt).length || 1
      )
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Won Deals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gewonnen deals, omzet en performance per kanaal</p>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Won Deals" value={formatNumber(overview?.wonDeals || 0)} icon={<Trophy className="h-4 w-4" />} />
        <KpiCard title="Totale Omzet" value={formatCurrency(overview?.totalRevenue || 0)} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard title="Gem. Omzet per Deal" value={formatCurrency(overview?.avgRevenuePerDeal || 0)} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard title="Gem. Doorlooptijd" value={`${avgDoorlooptijd} dagen`} icon={<Clock className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Omzet per Kanaal</CardTitle></CardHeader>
          <CardContent>
            {revenueBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueBarData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                  <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="#10b981" name="Omzet" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (<p className="py-12 text-center text-sm text-muted-foreground">Nog geen won deals</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Omzetverdeling</CardTitle></CardHeader>
          <CardContent>
            {revenuePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={revenuePieData} cx="50%" cy="50%" innerRadius={65} outerRadius={110} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {revenuePieData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (<p className="py-12 text-center text-sm text-muted-foreground">Nog geen won deals</p>)}
          </CardContent>
        </Card>
      </div>

      {wonChannels.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Performance per Kanaal</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kanaal</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Won</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Omzet</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gem. Omzet</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Win%" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="COA" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="ROI" /></th>
                  </tr>
                </thead>
                <tbody>
                  {wonChannels.map((ch) => (
                    <tr key={ch.channel} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                      <td className="py-3.5"><div className="flex items-center gap-2.5"><div className="h-2 w-2 rounded-full bg-success" /><span className="font-medium text-foreground">{ch.channel}</span></div></td>
                      <td className="py-3.5 text-right font-medium tabular-nums text-success">{ch.won}</td>
                      <td className="py-3.5 text-right font-semibold tabular-nums">{formatCurrency(ch.revenue)}</td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(ch.avgRevenuePerDeal)}</td>
                      <td className="py-3.5 text-right"><span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{formatPercent(ch.winRate)}</span></td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(ch.coa)}</td>
                      <td className="py-3.5 text-right"><span className="font-semibold tabular-nums text-primary">{ch.roi}x</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Won Deals Lijst</CardTitle>
            <Button variant="outline" size="sm" onClick={() => {
              if (!dealsData?.deals) return;
              exportCSV("won_deals", ["Naam", "Email", "Herkomst", "Omzet", "Gewonnen op", "Doorlooptijd"],
                dealsData.deals.map((d) => {
                  const dl = d.wonAt && d.dealCreatedAt ? Math.round((new Date(d.wonAt).getTime() - new Date(d.dealCreatedAt).getTime()) / 86400000) : "";
                  return [d.contact?.name || d.title || "", d.contact?.email || "", d.herkomst || "", d.revenue || 0, d.wonAt?.slice(0, 10) || "", dl];
                })
              );
            }}><Download className="mr-1.5 h-3.5 w-3.5" />CSV</Button>
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
                      <th className="pb-3 font-medium text-right">Omzet</th>
                      <th className="pb-3 font-medium">Gewonnen op</th>
                      <th className="pb-3 font-medium text-right">Doorlooptijd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealsData?.deals.map((deal) => {
                      const doorlooptijd = deal.wonAt && deal.dealCreatedAt
                        ? Math.round((new Date(deal.wonAt).getTime() - new Date(deal.dealCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      return (
                        <tr key={deal.id} className="border-b border-border/50 transition-colors hover:bg-accent/50">
                          <td className="py-3 font-medium text-foreground">{deal.contact?.name || deal.title || "-"}</td>
                          <td className="py-3 text-muted-foreground">{deal.contact?.email || "-"}</td>
                          <td className="py-3"><Badge variant="success">{deal.herkomst || "-"}</Badge></td>
                          <td className="py-3 text-right font-semibold tabular-nums">{deal.revenue ? formatCurrency(deal.revenue) : "-"}</td>
                          <td className="py-3 text-muted-foreground">{deal.wonAt ? new Date(deal.wonAt).toLocaleDateString("nl-BE") : "-"}</td>
                          <td className="py-3 text-right tabular-nums text-muted-foreground">{doorlooptijd !== null ? `${doorlooptijd}d` : "-"}</td>
                        </tr>
                      );
                    })}
                    {dealsData?.deals.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Geen gewonnen deals gevonden</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{dealsData?.total || 0} won deals totaal</span>
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
