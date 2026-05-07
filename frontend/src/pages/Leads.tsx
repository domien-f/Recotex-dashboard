import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilterStore } from "@/store/filterStore";
import api from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { Users, Sparkles } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DealsDrillModal, type DrillFilter } from "@/components/dashboard/DealsDrillModal";
import { DrillableNumber } from "@/components/dashboard/DrillableNumber";

export function LeadsPage() {
  const { dateFrom, dateTo, dateMode, channels, statuses, typeWerken, verantwoordelijken } = useFilterStore();
  const [drill, setDrill] = useState<DrillFilter | null>(null);

  const params: Record<string, any> = { dateFrom, dateTo, dateMode };
  if (channels.length) params.herkomst = channels.join(",");
  if (statuses.length) params.status = statuses.join(",");
  if (typeWerken.length) params.typeWerken = typeWerken.join(",");
  if (verantwoordelijken.length) params.verantwoordelijke = verantwoordelijken.join(",");

  const { data: stats } = useQuery({
    queryKey: ["deal-stats", dateFrom, dateTo, channels, statuses, typeWerken, verantwoordelijken],
    queryFn: async () => (await api.get("/deals/stats", { params })).data as {
      total: number; uniqueContacts: number; won: number; winRate: string;
      byStatus: { status: string; count: number }[];
      byHerkomst: { herkomst: string; count: number; revenue: number }[];
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alle binnengekomen leads · klik op een waarde voor de volledige lijst</p>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Totaal Leads" value={formatNumber(stats?.total || 0)} icon={<Users className="h-4 w-4" />} onClick={() => setDrill({ title: "Alle leads" })} formula={{ label: "Totaal Leads", description: "Alle deals binnen de huidige filters" }} />
        <KpiCard title="Unieke Contacten" value={formatNumber(stats?.uniqueContacts || 0)} icon={<Users className="h-4 w-4" />} formula={{ label: "Unieke Contacten", description: "Aantal verschillende personen achter de leads" }} />
        <KpiCard title="Won" value={formatNumber(stats?.won || 0)} icon={<Sparkles className="h-4 w-4" />} onClick={() => setDrill({ status: "WON", title: "Won deals" })} formula={{ label: "Won deals", description: "Aantal leads dat resulteerde in een verkoop" }} />
        <KpiCard title="Win Rate" value={`${stats?.winRate || 0}%`} icon={<Sparkles className="h-4 w-4" />} formula={{ label: "Win Percentage", description: "Percentage leads gewonnen", formula: "(Won deals ÷ Totaal leads) × 100%" }} />
      </div>

      {/* Status breakdown */}
      {stats?.byStatus && stats.byStatus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Per Status
              <InfoTooltip text="Klik op een aantal om de leads in die status te bekijken." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {stats.byStatus.map((s) => (
                <div key={s.status} className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <InfoTooltip code={s.status}>{s.status}</InfoTooltip>
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    <DrillableNumber filter={{ status: s.status, title: `${s.status} leads` }}>
                      {formatNumber(s.count)}
                    </DrillableNumber>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per kanaal */}
      {stats?.byHerkomst && stats.byHerkomst.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Per Kanaal
              <InfoTooltip text="Klik op het aantal voor de leads van dat kanaal." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Kanaal">Kanaal</InfoTooltip></th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Lead">Leads</InfoTooltip></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byHerkomst.sort((a, b) => b.count - a.count).map((h) => (
                    <tr key={h.herkomst} className="border-b border-border/30 hover:bg-muted/50">
                      <td className="py-3 font-medium">{h.herkomst}</td>
                      <td className="py-3 text-right tabular-nums">
                        <DrillableNumber filter={{ herkomst: h.herkomst, title: `Leads — ${h.herkomst}`, inheritGlobal: false }}>
                          {h.count}
                        </DrillableNumber>
                      </td>
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
          <CardTitle className="flex items-center gap-1.5">
            Volledige Leads Lijst
            <InfoTooltip text="Open de volledige lijst met zoeken, sorteren, kolomfilters en CSV-export." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <button
            onClick={() => setDrill({ title: "Alle leads" })}
            className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 px-6 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/10"
          >
            <Users className="mx-auto h-8 w-8 text-primary" />
            <div className="mt-2 text-sm font-semibold text-foreground">Open de Leads lijst</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Met zoeken, sorteren, kolomfilters en CSV-export</div>
          </button>
        </CardContent>
      </Card>

      {drill && <DealsDrillModal filter={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}
