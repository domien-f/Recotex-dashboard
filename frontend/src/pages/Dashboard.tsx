import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useMetricsOverview, useChannelMetrics } from "@/hooks/useMetrics";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import { Users, UserCheck, Trophy, TrendingUp, Wallet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCSV } from "@/lib/export";
import { MetricLabel } from "@/components/ui/metric-label";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  NEW: "#f08300", QUALIFIED: "#1a3860", APPOINTMENT: "#f59e0b", WON: "#10b981", LOST: "#ef4444",
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

export function DashboardPage() {
  const { data: overview, isLoading: loadingOverview } = useMetricsOverview();
  const { data: channels, isLoading: loadingChannels } = useChannelMetrics();

  if (loadingOverview) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Dashboard laden...</span>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Users className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Nog geen data beschikbaar</p>
      </div>
    );
  }

  const statusData = [
    { name: "Overig", value: overview.totalDeals - overview.wonDeals, fill: STATUS_COLORS.NEW },
    { name: "Won", value: overview.wonDeals, fill: STATUS_COLORS.WON },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overzicht van je deal pipeline en marketing performance</p>
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        <KpiCard title="Totaal Deals" value={formatNumber(overview.totalDeals)} icon={<Users className="h-4 w-4" />} />
        <KpiCard title="Unieke Contacten" value={formatNumber(overview.uniqueContacts)} icon={<UserCheck className="h-4 w-4" />} />
        <KpiCard title="Won Deals" value={formatNumber(overview.wonDeals)} icon={<Trophy className="h-4 w-4" />} />
        <KpiCard title="Win Rate" value={formatPercent(overview.winRateGlobal)} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard title="Totale Omzet" value={formatCurrency(overview.totalRevenue)} icon={<Wallet className="h-4 w-4" />} />
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        <KpiCard title="Totale Kost" value={formatCurrency(overview.totalCost)} isEstimated={overview.hasEstimatedCosts} />
        <KpiCard title="CPL" value={formatCurrency(overview.cpl)} isEstimated={overview.hasEstimatedCosts} />
        <KpiCard title="KPA" value={formatCurrency(overview.kpa)} isEstimated={overview.hasEstimatedCosts} />
        <KpiCard title="ROI" value={`${overview.roi}x`} isEstimated={overview.hasEstimatedCosts} />
        <KpiCard title="Netto Resultaat" value={formatCurrency(overview.netResult)} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Deals per Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={65} outerRadius={110} paddingAngle={4} dataKey="value" strokeWidth={0}>
                  {statusData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Deals per Kanaal</CardTitle></CardHeader>
          <CardContent>
            {!loadingChannels && channels && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={channels} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                  <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
                  <Bar dataKey="deals" fill="#1a3860" name="Deals" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="won" fill="#f08300" name="Won" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Channel Performance Table */}
      {channels && channels.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Kanaal Performance</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                if (!channels) return;
                exportCSV("kanaal_performance", ["Kanaal", "Deals", "Won", "Win%", "Kost", "Omzet", "CPL", "KPA", "ROI"],
                  channels.map((ch) => [ch.channel, ch.deals, ch.won, ch.winRate + "%", ch.cost, ch.revenue, ch.cpl, ch.kpa, ch.roi + "x"])
                );
              }}><Download className="mr-1.5 h-3.5 w-3.5" />CSV</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kanaal</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deals</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Won</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Win%</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kost</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Omzet</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="CPL" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="KPA" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="ROI" /></th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => (
                    <tr key={ch.channel} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                      <td className="py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-2 rounded-full bg-secondary" />
                          <span className="font-medium text-foreground">{ch.channel}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-right font-medium tabular-nums">{ch.deals}</td>
                      <td className="py-3.5 text-right font-medium tabular-nums text-success">{ch.won}</td>
                      <td className="py-3.5 text-right">
                        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{formatPercent(ch.winRate)}</span>
                      </td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(ch.cost)}</td>
                      <td className="py-3.5 text-right font-semibold tabular-nums">{formatCurrency(ch.revenue)}</td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(ch.cpl)}</td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(ch.kpa)}</td>
                      <td className="py-3.5 text-right">
                        <span className="font-semibold tabular-nums text-primary">{ch.roi}x</span>
                      </td>
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
