import { useState } from "react";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useChannelMetrics, useMetricsOverview } from "@/hooks/useMetrics";
import { formatCurrency, formatPercent, formatNumber, isFreeChannel } from "@/lib/utils";
import { Trophy, Wallet, TrendingUp, Clock } from "lucide-react";
import { MetricLabel } from "@/components/ui/metric-label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DealsDrillModal, type DrillFilter } from "@/components/dashboard/DealsDrillModal";
import { DrillableNumber } from "@/components/dashboard/DrillableNumber";
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
      <p className="mt-1 text-[10px] text-muted-foreground/70 italic">Klik voor details</p>
    </div>
  );
};

export function WonLeadsPage() {
  const [drill, setDrill] = useState<DrillFilter | null>(null);
  const { data: overview, isLoading: loadingOverview } = useMetricsOverview();
  const { data: channels } = useChannelMetrics();

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Won Deals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gewonnen deals, omzet en performance per kanaal · klik op een waarde voor details</p>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Won Deals" value={formatNumber(overview?.wonDeals || 0)} icon={<Trophy className="h-4 w-4" />} onClick={() => setDrill({ status: "WON", title: "Won deals" })} formula={{ label: "Won Deals", description: "Aantal effectief gewonnen deals" }} />
        <KpiCard title="Totale Omzet" value={formatCurrency(overview?.totalRevenue || 0)} icon={<Wallet className="h-4 w-4" />} onClick={() => setDrill({ status: "WON", title: "Omzet — Won deals" })} formula={{ label: "Totale Omzet", description: "Som van alle gewonnen deals", formula: "Σ revenue waar status = WON" }} />
        <KpiCard title="Gem. Omzet per Deal" value={formatCurrency(overview?.avgRevenuePerDeal || 0)} icon={<TrendingUp className="h-4 w-4" />} formula={{ label: "Gemiddelde Omzet per Deal", description: "Gem. opbrengst per gewonnen deal", formula: "Totale omzet ÷ Aantal gewonnen deals" }} />
        <KpiCard title="Gem. Doorlooptijd" value={`— dagen`} icon={<Clock className="h-4 w-4" />} formula={{ label: "Gemiddelde Doorlooptijd", description: "Gem. dagen van lead tot won", formula: "Σ(Won datum − Aanmaakdatum) ÷ Aantal won deals" }} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Omzet per Kanaal
              <InfoTooltip text="Totale omzet uit gewonnen deals per kanaal. Klik op een staaf voor de onderliggende won deals." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueBarData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                  <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="#10b981" name="Omzet" radius={[6, 6, 0, 0]} cursor="pointer"
                    onClick={(d: any) => setDrill({ herkomst: d.channel, status: "WON", title: `Omzet — ${d.channel}`, inheritGlobal: false })} />
                </BarChart>
              </ResponsiveContainer>
            ) : (<p className="py-12 text-center text-sm text-muted-foreground">Nog geen won deals</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Omzetverdeling
              <InfoTooltip text="Verdeling van de totale omzet over de kanalen. Klik op een segment voor de deals." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenuePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={revenuePieData} cx="50%" cy="50%" innerRadius={65} outerRadius={110} paddingAngle={4} dataKey="value" strokeWidth={0}
                    onClick={(d: any) => setDrill({ herkomst: d.name, status: "WON", title: `Omzet — ${d.name}`, inheritGlobal: false })}
                    cursor="pointer">
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
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Performance per Kanaal
              <InfoTooltip text="Klik op het aantal Won, Omzet of de COA-waarde om de bijhorende deals te zien." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Kanaal">Kanaal</InfoTooltip></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Won">Won</InfoTooltip></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Omzet</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Gem.Omzet" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="Win%" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="COA" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="ROI" /></th>
                  </tr>
                </thead>
                <tbody>
                  {wonChannels.map((ch) => {
                    const free = isFreeChannel(ch.channel);
                    return (
                      <tr key={ch.channel} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                        <td className="py-3.5"><div className="flex items-center gap-2.5"><div className="h-2 w-2 rounded-full bg-success" /><span className="font-medium text-foreground">{ch.channel}</span></div></td>
                        <td className="py-3.5 text-right font-medium tabular-nums text-success">
                          <DrillableNumber filter={{ herkomst: ch.channel, status: "WON", title: `Won deals — ${ch.channel}`, inheritGlobal: false }} className="text-success">
                            {ch.won}
                          </DrillableNumber>
                        </td>
                        <td className="py-3.5 text-right font-semibold tabular-nums">
                          <DrillableNumber filter={{ herkomst: ch.channel, status: "WON", title: `Omzet — ${ch.channel}`, inheritGlobal: false }}>
                            {formatCurrency(ch.revenue)}
                          </DrillableNumber>
                        </td>
                        <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(ch.avgRevenuePerDeal)}</td>
                        <td className="py-3.5 text-right"><span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{formatPercent(ch.winRate)}</span></td>
                        <td className="py-3.5 text-right tabular-nums text-muted-foreground">{free ? <InfoTooltip code="Gratis kanaal"><span className="text-xs text-muted-foreground/60">NVT</span></InfoTooltip> : formatCurrency(ch.coa)}</td>
                        <td className="py-3.5 text-right">{free ? <InfoTooltip code="Gratis kanaal"><span className="text-xs text-muted-foreground/60">NVT</span></InfoTooltip> : <span className="font-semibold tabular-nums text-primary">{ch.roi}x</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CTA to drill all won deals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Volledige Won Deals Lijst
            <InfoTooltip text="Open de uitgebreide lijst met zoekfunctie, sortering en filters om alle gewonnen deals te onderzoeken." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <button
            onClick={() => setDrill({ status: "WON", title: "Alle Won deals" })}
            className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 px-6 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/10"
          >
            <Trophy className="mx-auto h-8 w-8 text-primary" />
            <div className="mt-2 text-sm font-semibold text-foreground">Open de Won Deals lijst</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Met zoeken, sorteren, filters en CSV-export</div>
          </button>
        </CardContent>
      </Card>

      {drill && <DealsDrillModal filter={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}
