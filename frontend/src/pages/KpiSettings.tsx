import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useMetricsOverview, useChannelMetrics } from "@/hooks/useMetrics";
import { useFilterStore } from "@/store/filterStore";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { MetricLabel } from "@/components/ui/metric-label";

interface KpiTarget {
  id: string;
  metric: string;
  targetValue: number;
  month?: string | null;
}

function useBudgetTarget(metric: string): number | null {
  const { dateFrom, dateTo } = useFilterStore();
  const { data: targets } = useQuery<KpiTarget[]>({
    queryKey: ["kpi-budget", metric],
    queryFn: async () => (await api.get(`/kpi/budget/${metric}`)).data,
  });

  if (!targets?.length) return null;

  // Sum budget targets for months within the filtered range
  const from = dateFrom.slice(0, 7); // "2026-04"
  const to = dateTo.slice(0, 7);
  return targets.reduce((sum, t) => {
    if (!t.month) return sum;
    const ym = t.month.slice(0, 7);
    if (ym >= from && ym <= to) return sum + Number(t.targetValue);
    return sum;
  }, 0) || null;
}

const KPI_DEFS: Record<string, {
  label: string;
  description: string;
  format: (v: number) => string;
  direction: "lower" | "higher";
}> = {
  total_marketing_budget: { label: "Total Marketing Budget", description: "Totale marketing uitgaven incl. overhead", format: (v) => formatCurrency(v), direction: "lower" },
  lead_spend_budget: { label: "Lead Spend Budget", description: "Budget specifiek voor lead generatie", format: (v) => formatCurrency(v), direction: "lower" },
  lead_spend_roi: { label: "Lead Spend ROI", description: "Omzet / totale lead spend (target: 16,67x = 6% kost)", format: (v) => `${v.toFixed(2)}x`, direction: "higher" },
  kpa: { label: "KPA", description: "Kost Per Afspraak", format: (v) => formatCurrency(v), direction: "lower" },
  coa_target: { label: "COA Target", description: "Cost Of Acquisition — target", format: (v) => formatCurrency(v), direction: "lower" },
  own_leads_percentage: { label: "Eigen Leads %", description: "% leads uit eigen kanalen (Website, Referentie, Eigen lead)", format: (v) => `${v.toFixed(1)}%`, direction: "higher" },
};

function getStatus(current: number, target: number, dir: "lower" | "higher"): "success" | "warning" | "danger" {
  if (dir === "lower") return current <= target ? "success" : current <= target * 1.2 ? "warning" : "danger";
  return current >= target ? "success" : current >= target * 0.8 ? "warning" : "danger";
}

function getProgress(current: number, target: number, dir: "lower" | "higher"): number {
  if (dir === "lower") return target > 0 ? Math.max(0, Math.min(100, ((2 * target - current) / (2 * target)) * 100)) : 0;
  return target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
}

const SC = {
  success: { bg: "bg-success", text: "text-success" },
  warning: { bg: "bg-warning", text: "text-warning" },
  danger: { bg: "bg-destructive", text: "text-destructive" },
};

export function KpiSettingsPage() {
  const { data: overview } = useMetricsOverview();
  const { data: channels } = useChannelMetrics();
  const { data: targets } = useQuery<KpiTarget[]>({
    queryKey: ["kpi-targets"],
    queryFn: async () => (await api.get("/kpi")).data,
  });

  const marketingBudget = useBudgetTarget("total_marketing_budget");
  const leadSpendBudget = useBudgetTarget("lead_spend_budget");

  const t = (metric: string): number | null => {
    if (metric === "total_marketing_budget") return marketingBudget;
    if (metric === "lead_spend_budget") return leadSpendBudget;
    const found = targets?.find((x) => x.metric === metric);
    return found ? Number(found.targetValue) : null;
  };

  const cost = overview?.totalCost || 0;
  const rev = overview?.totalRevenue || 0;
  const appts = overview?.totalAppointments || 0;
  const won = overview?.wonDeals || 0;
  const totalDeals = overview?.totalDeals || 0;

  const roi = cost > 0 ? rev / cost : 0;
  const kpa = appts > 0 ? cost / appts : 0;
  const coa = won > 0 ? cost / won : 0;

  // Eigen leads = eigen marketing (Meta, Google, TikTok, Website, Referentie, Eigen lead)
  // Third-party = Solvari, Red Pepper, Renocheck, PPA, Offertevergelijker, Bouw En Reno, etc.
  const thirdPartyChannels = ["Solvari", "Red Pepper", "Renocheck", "PPA", "Offertevergelijker", "Bouw En Reno", "Bis Beurs", "Serieus Verbouwen", "Bobex", "Jaimy", "Fourvision", "Giga Leads"];
  const ownLeads = channels?.filter((ch) => !thirdPartyChannels.includes(ch.channel)).reduce((s, ch) => s + ch.deals, 0) || 0;
  const ownPct = totalDeals > 0 ? (ownLeads / totalDeals) * 100 : 0;

  const coaAcceptable = t("coa_acceptable") || 1000;
  const coaTarget = t("coa_target") || 800;
  const coaOver = t("coa_overachieved") || 600;

  const kpis = [
    { metric: "total_marketing_budget", current: cost },
    { metric: "lead_spend_budget", current: cost },
    { metric: "lead_spend_roi", current: roi },
    { metric: "kpa", current: kpa },
    { metric: "coa_target", current: coa },
    { metric: "own_leads_percentage", current: ownPct },
  ];

  const coaStatus = coa <= coaOver ? "success" : coa <= coaTarget ? "success" : coa <= coaAcceptable ? "warning" : "danger";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">KPI Targets</h1>
        <p className="mt-1 text-sm text-muted-foreground">Voortgang richting eind 2026 doelstellingen</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ metric, current }) => {
          const def = KPI_DEFS[metric];
          const target = t(metric);
          if (!def || target === null) return null;
          const status = getStatus(current, target, def.direction);
          const progress = getProgress(current, target, def.direction);
          const c = SC[status];

          return (
            <Card key={metric} className="overflow-hidden">
              <div className={`h-1 ${c.bg}`} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{def.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                  </div>
                  {status === "success" ? <CheckCircle className={`h-5 w-5 ${c.text}`} /> : status === "warning" ? <AlertTriangle className={`h-5 w-5 ${c.text}`} /> : <XCircle className={`h-5 w-5 ${c.text}`} />}
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl font-bold text-foreground">{def.format(current)}</span>
                  <span className="text-sm text-muted-foreground">/ {def.format(target)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${c.bg}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <p className={`mt-1.5 text-xs font-medium ${c.text}`}>
                  {status === "success" ? "Op schema" : status === "warning" ? "Bijna op target" : "Onder target"}
                </p>
              </CardContent>
            </Card>
          );
        })}

        {/* COA Tiers Card */}
        <Card className="overflow-hidden">
          <div className={`h-1 ${SC[coaStatus].bg}`} />
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-foreground"><MetricLabel code="COA" /> Tiers</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cost Of Acquisition met 3 niveaus</p>
              </div>
              {coaStatus === "success" ? <CheckCircle className="h-5 w-5 text-success" /> : coaStatus === "warning" ? <AlertTriangle className="h-5 w-5 text-warning" /> : <XCircle className="h-5 w-5 text-destructive" />}
            </div>
            <div className="text-2xl font-bold text-foreground mb-4">{formatCurrency(coa)}</div>
            <div className="space-y-2.5">
              {[
                { label: "Overachieved", value: coaOver, ok: coa <= coaOver },
                { label: "Target", value: coaTarget, ok: coa <= coaTarget, bold: true },
                { label: "Acceptable", value: coaAcceptable, ok: coa <= coaAcceptable },
              ].map((tier) => (
                <div key={tier.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${tier.ok ? "bg-success" : "bg-muted"}`} />
                    <span className={`text-xs ${tier.bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{tier.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">&lt; {formatCurrency(tier.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Eigen vs Extern */}
      {channels && (
        <Card>
          <CardHeader><CardTitle>Eigen Leads vs Extern</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const externDeals = channels.filter((ch) => thirdPartyChannels.includes(ch.channel));
              const eigenDeals = channels.filter((ch) => !thirdPartyChannels.includes(ch.channel));
              const externTotal = externDeals.reduce((s, ch) => s + ch.deals, 0);
              const eigenTotal = eigenDeals.reduce((s, ch) => s + ch.deals, 0);
              const externWon = externDeals.reduce((s, ch) => s + ch.won, 0);
              const eigenWon = eigenDeals.reduce((s, ch) => s + ch.won, 0);
              const externRev = externDeals.reduce((s, ch) => s + Number(ch.revenue), 0);
              const eigenRev = eigenDeals.reduce((s, ch) => s + Number(ch.revenue), 0);
              const externCost = externDeals.reduce((s, ch) => s + Number(ch.cost), 0);
              const eigenCost = eigenDeals.reduce((s, ch) => s + Number(ch.cost), 0);
              const total = externTotal + eigenTotal;
              const eigenPct = total > 0 ? (eigenTotal / total) * 100 : 0;
              const externPct = total > 0 ? (externTotal / total) * 100 : 0;

              return (
                <div className="space-y-6">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-2">
                      <span className="text-primary">Eigen: {eigenPct.toFixed(1)}%</span>
                      <span className="text-muted-foreground">Extern: {externPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-4 w-full rounded-full bg-muted overflow-hidden flex">
                      <div className="h-full bg-primary transition-all" style={{ width: `${eigenPct}%` }} />
                      <div className="h-full bg-muted-foreground/30 transition-all" style={{ width: `${externPct}%` }} />
                    </div>
                  </div>

                  {/* Comparison table */}
                  <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: "Eigen Kanalen", deals: eigenTotal, won: eigenWon, revenue: eigenRev, cost: eigenCost, channels: eigenDeals, color: "text-primary" },
                      { label: "Externe Kanalen", deals: externTotal, won: externWon, revenue: externRev, cost: externCost, channels: externDeals, color: "text-muted-foreground" },
                    ].map((group) => (
                      <div key={group.label} className="space-y-3">
                        <p className={`text-sm font-semibold ${group.color}`}>{group.label}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-muted/50 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Leads</p>
                            <p className="text-lg font-bold">{group.deals}</p>
                          </div>
                          <div className="rounded-xl bg-muted/50 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Won</p>
                            <p className="text-lg font-bold text-success">{group.won}</p>
                          </div>
                          <div className="rounded-xl bg-muted/50 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Omzet</p>
                            <p className="text-lg font-bold">{formatCurrency(group.revenue)}</p>
                          </div>
                          <div className="rounded-xl bg-muted/50 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kost</p>
                            <p className="text-lg font-bold">{formatCurrency(group.cost)}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {group.channels.sort((a, b) => b.deals - a.deals).map((ch) => (
                            <div key={ch.channel} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{ch.channel}</span>
                              <span className="font-medium tabular-nums">{ch.deals} leads · {ch.won} won</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Channel KPI Table */}
      {channels && channels.filter((ch) => ch.cost > 0).length > 0 && (
        <Card>
          <CardHeader><CardTitle>KPI per Kanaal</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kanaal</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deals</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="CPL" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="KPA" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="COA" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MetricLabel code="ROI" /></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.filter((ch) => ch.cost > 0).sort((a, b) => b.cost - a.cost).map((ch) => {
                    const chKpa = parseFloat(ch.kpa);
                    const chCoa = parseFloat(ch.coa);
                    const kpaOk = chKpa <= (t("kpa") || 120);
                    const coaOk = chCoa <= coaAcceptable;
                    return (
                      <tr key={ch.channel} className="border-b border-border/30 hover:bg-muted/50">
                        <td className="py-3.5 font-medium text-foreground">{ch.channel}</td>
                        <td className="py-3.5 text-right tabular-nums">{ch.deals}</td>
                        <td className="py-3.5 text-right tabular-nums">{formatCurrency(ch.cpl)}</td>
                        <td className="py-3.5 text-right"><span className={`font-medium tabular-nums ${kpaOk ? "text-success" : "text-destructive"}`}>{formatCurrency(ch.kpa)}</span></td>
                        <td className="py-3.5 text-right"><span className={`font-medium tabular-nums ${coaOk ? chCoa <= coaTarget ? "text-success" : "text-warning" : "text-destructive"}`}>{formatCurrency(ch.coa)}</span></td>
                        <td className="py-3.5 text-right font-semibold tabular-nums text-primary">{ch.roi}x</td>
                        <td className="py-3.5 text-right">{kpaOk && coaOk ? <CheckCircle className="ml-auto h-4 w-4 text-success" /> : <AlertTriangle className="ml-auto h-4 w-4 text-warning" />}</td>
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
