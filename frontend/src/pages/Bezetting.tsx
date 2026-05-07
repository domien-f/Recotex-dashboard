import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFilterStore } from "@/store/filterStore";
import api from "@/lib/api";
import { formatPercent, cn } from "@/lib/utils";
import { CalendarCheck, Target, AlertTriangle, ArrowRight, Ban, Trophy, Activity, ArrowUpDown, ArrowUp, ArrowDown, Settings as SettingsIcon } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AppointmentsDrillModal, type AppointmentDrillFilter } from "@/components/dashboard/AppointmentsDrillModal";
import type { BezettingResponse } from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

type DrillState = AppointmentDrillFilter | null;
type SortKey = "verkoper" | "ingepland" | "doorgegaan" | "geannuleerd" | "open" | "doorgang" | "bezetting";

function bezettingTone(pct: number | null): { bg: string; text: string; border: string } {
  if (pct === null) return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  if (pct >= 100) return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
  if (pct >= 80) return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
  if (pct >= 50) return { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" };
  return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
}

function isoWeekShort(weekKey: string): string {
  return `W${weekKey.split("-W")[1]}`;
}

interface VerkoperAggregate {
  verantwoordelijke: string;
  ingepland: number;
  doorgegaan: number;
  geannuleerd: number;
  futurePending: number;
  target: number | null;
  weekCount: number;            // # weeks they had appointments
  doorgangsRatio: number | null;
  bezettingsgraad: number | null;
}

export function BezettingPage() {
  const navigate = useNavigate();
  const { dateFrom, dateTo, activePreset, setDateRange } = useFilterStore();
  const [drill, setDrill] = useState<DrillState>(null);
  const [sortKey, setSortKey] = useState<SortKey>("ingepland");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const jumpToVorigeMaand = () => {
    const n = new Date();
    const p = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    const e = new Date(n.getFullYear(), n.getMonth(), 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setDateRange(fmt(p), fmt(e), "Vorige maand");
  };

  const { data, isLoading } = useQuery<BezettingResponse>({
    queryKey: ["bezetting", dateFrom, dateTo],
    queryFn: async () => (await api.get("/appointments/bezetting", { params: { dateFrom, dateTo } })).data,
  });

  // Roll all weeks UP to per-verkoper for the selected period.
  // Bezetting = doorgegaan ÷ (target × weekCount).
  const verkopers: VerkoperAggregate[] = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, VerkoperAggregate>();
    for (const r of data.rows) {
      let agg = map.get(r.verantwoordelijke);
      if (!agg) {
        agg = {
          verantwoordelijke: r.verantwoordelijke,
          ingepland: 0, doorgegaan: 0, geannuleerd: 0, futurePending: 0,
          target: data.targets[r.verantwoordelijke] ?? null,
          weekCount: 0,
          doorgangsRatio: null,
          bezettingsgraad: null,
        };
        map.set(r.verantwoordelijke, agg);
      }
      agg.ingepland += r.ingepland;
      agg.doorgegaan += r.doorgegaan;
      agg.geannuleerd += r.geannuleerd;
      agg.futurePending += r.futurePending;
      agg.weekCount += 1;
    }
    for (const agg of map.values()) {
      const closed = agg.doorgegaan + agg.geannuleerd;
      agg.doorgangsRatio = closed > 0 ? Math.round((agg.doorgegaan / closed) * 1000) / 10 : null;
      const totalTarget = agg.target ? agg.target * agg.weekCount : null;
      agg.bezettingsgraad = totalTarget && totalTarget > 0 ? Math.round((agg.doorgegaan / totalTarget) * 1000) / 10 : null;
    }
    return Array.from(map.values());
  }, [data]);

  const sortedVerkopers = useMemo(() => {
    const list = [...verkopers];
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "verkoper": return dir * a.verantwoordelijke.localeCompare(b.verantwoordelijke);
        case "ingepland": return dir * (a.ingepland - b.ingepland);
        case "doorgegaan": return dir * (a.doorgegaan - b.doorgegaan);
        case "geannuleerd": return dir * (a.geannuleerd - b.geannuleerd);
        case "open": return dir * (a.futurePending - b.futurePending);
        case "doorgang": return dir * ((a.doorgangsRatio ?? -1) - (b.doorgangsRatio ?? -1));
        case "bezetting": return dir * ((a.bezettingsgraad ?? -1) - (b.bezettingsgraad ?? -1));
      }
    });
    return list;
  }, [verkopers, sortKey, sortDir]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "verkoper" ? "asc" : "desc"); }
  };

  const hasAnyTarget = verkopers.some((v) => v.target && v.target > 0);

  // Trend chart — last 8 weeks (or fewer if period is short)
  const trendData = useMemo(() => {
    if (!data) return [];
    return data.weekTotals.slice(0, 8).reverse().map((w) => ({
      label: isoWeekShort(w.weekKey),
      Doorgegaan: w.doorgegaan,
      Geannuleerd: w.geannuleerd,
      Open: w.futurePending,
    }));
  }, [data]);
  const avgWeeklyTargetTotal = useMemo(() => {
    if (!data) return null;
    const t = Object.values(data.targets).filter((x) => x > 0);
    if (t.length === 0) return null;
    return t.reduce((s, x) => s + x, 0);
  }, [data]);

  // Manager-focused KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    const verkopersWithTarget = verkopers.filter((v) => v.bezettingsgraad !== null);
    const avgBez = verkopersWithTarget.length > 0
      ? verkopersWithTarget.reduce((s, v) => s + (v.bezettingsgraad || 0), 0) / verkopersWithTarget.length
      : null;
    const onderTargetCount = verkopersWithTarget.filter((v) => (v.bezettingsgraad || 0) < 80).length;
    return {
      doorgangsRatio: data.summary.doorgangsRatio,
      annulatieRatio: data.summary.annulatieRatio,
      totalDoorgegaan: data.summary.totalDoorgegaan,
      totalIngepland: data.summary.totalIngepland,
      totalGeannuleerd: data.summary.totalGeannuleerd,
      avgBezPeriod: avgBez,
      onderTargetCount,
      verkopersWithTarget: verkopersWithTarget.length,
      verkoperCount: verkopers.length,
    };
  }, [data, verkopers]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Afspraken Bezetting</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Doen bouwadviseurs hun afspraken, en hebben ze er genoeg? · Periode:{" "}
          <span className="font-semibold text-foreground">{activePreset || `${dateFrom} → ${dateTo}`}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/80">
          Alleen verkopers waarvoor een wekelijks target is ingesteld worden hier getoond. Voeg verkopers toe via{" "}
          <a href="/settings?tab=kpi" className="font-semibold text-primary hover:underline">KPI Targets</a>.
        </p>
      </div>

      {/* Manager KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <KpiCard
            title="Doorgang"
            value={kpis.doorgangsRatio !== null ? formatPercent(kpis.doorgangsRatio) : "—"}
            subtitle={
              kpis.totalDoorgegaan + kpis.totalGeannuleerd > 0
                ? <>{kpis.totalDoorgegaan} van {kpis.totalDoorgegaan + kpis.totalGeannuleerd} afgesloten afspraken</>
                : "Nog geen afgesloten afspraken"
            }
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={() => setDrill({ title: "Doorgegane afspraken", dateFrom, dateTo, outcome: "WON,LOST" })}
            formula={{
              label: "Doorgang Percentage",
              description: "Welk % van de afgesloten afspraken (doorgegaan of geannuleerd) ook effectief doorging.",
              formula: "Doorgegaan ÷ (Doorgegaan + Geannuleerd) × 100%",
            }}
          />
          <KpiCard
            title="Annulatie"
            value={kpis.annulatieRatio !== null ? formatPercent(kpis.annulatieRatio) : "—"}
            subtitle={
              kpis.totalGeannuleerd > 0
                ? <>{kpis.totalGeannuleerd} geannuleerd</>
                : "Geen annulaties — top!"
            }
            icon={<Ban className="h-4 w-4" />}
            onClick={() => setDrill({ title: "Geannuleerde afspraken", dateFrom, dateTo, outcome: "CANCELLED" })}
            formula={{
              label: "Annulatie Percentage",
              description: "Het deel afgesloten afspraken dat geannuleerd werd.",
              formula: "Geannuleerd ÷ (Doorgegaan + Geannuleerd) × 100%",
            }}
          />
          <KpiCard
            title="Bezetting"
            value={kpis.avgBezPeriod !== null ? formatPercent(kpis.avgBezPeriod) : "—"}
            subtitle={
              kpis.verkopersWithTarget > 0
                ? <>{kpis.verkopersWithTarget} van {kpis.verkoperCount} verkopers met target</>
                : <span className="text-amber-600">Geen targets ingesteld</span>
            }
            icon={<Target className="h-4 w-4" />}
            formula={{
              label: "Gemiddelde Bezettingsgraad",
              description: "Hoe goed verkopers hun wekelijks target halen, gemiddeld over alle verkopers met target in deze periode.",
              formula: "Σ (doorgegaan ÷ (target × weken)) ÷ aantal verkopers × 100%",
            }}
          />
          <KpiCard
            title="Aandacht nodig"
            value={String(kpis.onderTargetCount)}
            subtitle={
              kpis.verkopersWithTarget > 0
                ? <>verkopers onder 80% (van {kpis.verkopersWithTarget} met target)</>
                : "Geen targets ingesteld"
            }
            icon={<AlertTriangle className="h-4 w-4" />}
            formula={{
              label: "Verkopers onder target",
              description: "Aantal verkopers met bezetting < 80% in deze periode. Direct actiepunt voor management.",
            }}
          />
        </div>
      )}

      {/* Targets-not-set CTA — show prominently when blocking the bezetting feature */}
      {!isLoading && verkopers.length > 0 && !hasAnyTarget && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
                <Target className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Stel wekelijkse targets in om bezettingsgraad te zien</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Zonder targets toont de tabel alleen ruwe afspraak-aantallen. Met targets weet je wie achterloopt, wie boven verwachting presteert.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/settings?tab=kpi")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              Targets instellen
            </button>
          </CardContent>
        </Card>
      )}

      {/* Loading / empty */}
      {isLoading && (
        <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      )}
      {!isLoading && verkopers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarCheck className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Geen afspraken in deze periode.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Probeer een andere periode of pas de filter aan.</p>
            {activePreset === "Deze maand" && (
              <Button size="sm" variant="outline" className="mt-4" onClick={jumpToVorigeMaand}>
                Bekijk Vorige maand →
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Per-verkoper table — period totals, sortable, every count drillable */}
      {!isLoading && verkopers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-primary" />
              Per verkoper — totaal in deze periode
              <InfoTooltip text="Aggregeerde cijfers per verkoper voor de geselecteerde periode. Klik kolomkoppen om te sorteren. Klik op een aantal voor de bijhorende afspraken." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <ColHeader label="Verkoper" sortKey="verkoper" current={sortKey} dir={sortDir} onSort={handleSort} className="py-2.5" />
                    <ColHeader label="Ingepland" tooltip="Totaal aantal afspraken in deze periode" sortKey="ingepland" current={sortKey} dir={sortDir} onSort={handleSort} className="py-2.5 text-right" align="right" />
                    <ColHeader label="Doorgegaan" tooltip="Afspraken die effectief plaatsvonden — outcome WON/LOST of in het verleden en niet geannuleerd" sortKey="doorgegaan" current={sortKey} dir={sortDir} onSort={handleSort} className="py-2.5 text-right" align="right" />
                    <ColHeader label="Geannuleerd" tooltip="Afspraken met outcome CANCELLED" sortKey="geannuleerd" current={sortKey} dir={sortDir} onSort={handleSort} className="py-2.5 text-right" align="right" />
                    <ColHeader label="Open" tooltip="Toekomstige afspraken nog zonder uitkomst" sortKey="open" current={sortKey} dir={sortDir} onSort={handleSort} className="py-2.5 text-right" align="right" />
                    <ColHeader label="Doorgang%" tooltip="Doorgegaan ÷ (Doorgegaan + Geannuleerd) × 100%" sortKey="doorgang" current={sortKey} dir={sortDir} onSort={handleSort} className="py-2.5 text-right" align="right" />
                    {hasAnyTarget && (
                      <ColHeader label="Bezetting" tooltip="Doorgegaan ÷ (target × weken) × 100% — alleen als target ingesteld" sortKey="bezetting" current={sortKey} dir={sortDir} onSort={handleSort} className="py-2.5 text-right" align="right" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedVerkopers.map((v) => {
                    const tone = bezettingTone(v.bezettingsgraad);
                    return (
                      <tr key={v.verantwoordelijke} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {v.verantwoordelijke.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <span className="font-medium text-foreground">{v.verantwoordelijke}</span>
                            {v.bezettingsgraad !== null && v.bezettingsgraad >= 100 && <Trophy className="h-3 w-3 text-emerald-600" />}
                          </div>
                        </td>
                        <td className="py-3 text-right tabular-nums">
                          <button onClick={() => setDrill({ title: `${v.verantwoordelijke} — alle afspraken`, dateFrom, dateTo, verantwoordelijke: v.verantwoordelijke })}
                            className="cursor-pointer underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:text-primary transition-colors">
                            {v.ingepland}
                          </button>
                        </td>
                        <td className="py-3 text-right tabular-nums font-semibold text-emerald-700">
                          <button onClick={() => setDrill({ title: `${v.verantwoordelijke} — doorgegaan`, dateFrom, dateTo, verantwoordelijke: v.verantwoordelijke, outcome: "WON,LOST" })}
                            className="cursor-pointer underline decoration-dotted decoration-emerald-500/40 underline-offset-2 hover:text-emerald-800 transition-colors">
                            {v.doorgegaan}
                          </button>
                        </td>
                        <td className="py-3 text-right tabular-nums text-red-600">
                          {v.geannuleerd > 0 ? (
                            <button onClick={() => setDrill({ title: `${v.verantwoordelijke} — geannuleerd`, dateFrom, dateTo, verantwoordelijke: v.verantwoordelijke, outcome: "CANCELLED" })}
                              className="cursor-pointer underline decoration-dotted decoration-red-500/40 underline-offset-2 hover:text-red-700 transition-colors">
                              {v.geannuleerd}
                            </button>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="py-3 text-right tabular-nums text-muted-foreground">
                          {v.futurePending > 0 ? (
                            <button onClick={() => setDrill({ title: `${v.verantwoordelijke} — open`, dateFrom, dateTo, verantwoordelijke: v.verantwoordelijke, outcome: "PENDING" })}
                              className="cursor-pointer underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:text-primary transition-colors">
                              {v.futurePending}
                            </button>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="py-3 text-right">
                          {v.doorgangsRatio !== null ? (
                            <span className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              v.doorgangsRatio >= 90 ? "bg-emerald-100 text-emerald-700" :
                              v.doorgangsRatio >= 70 ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            )}>{v.doorgangsRatio.toFixed(1)}%</span>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                        {hasAnyTarget && (
                          <td className="py-3 text-right">
                            {v.bezettingsgraad !== null ? (
                              <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums", tone.bg, tone.text, tone.border)}>
                                {Math.round(v.bezettingsgraad)}%
                              </span>
                            ) : v.target ? (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40 italic">geen target</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border/60 font-semibold">
                    <td className="py-3 text-foreground">Totaal · {verkopers.length} verkopers</td>
                    <td className="py-3 text-right tabular-nums">{verkopers.reduce((s, v) => s + v.ingepland, 0)}</td>
                    <td className="py-3 text-right tabular-nums text-emerald-700">{verkopers.reduce((s, v) => s + v.doorgegaan, 0)}</td>
                    <td className="py-3 text-right tabular-nums text-red-600">{verkopers.reduce((s, v) => s + v.geannuleerd, 0) || "—"}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{verkopers.reduce((s, v) => s + v.futurePending, 0) || "—"}</td>
                    <td className="py-3 text-right tabular-nums">{kpis?.doorgangsRatio !== null && kpis ? `${kpis.doorgangsRatio.toFixed(1)}%` : "—"}</td>
                    {hasAnyTarget && <td className="py-3 text-right tabular-nums">{kpis?.avgBezPeriod !== null && kpis ? `${kpis.avgBezPeriod.toFixed(1)}%` : "—"}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend — last 8 weeks */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-primary" />
              Trend per week
              <InfoTooltip text="Doorgegaan + geannuleerd + nog open per week. De stippellijn toont het gecombineerde wekelijkse target van alle verkopers met een doel." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                  cursor={{ fill: "rgba(240,131,0,0.04)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Doorgegaan" stackId="a" fill="#10b981" />
                <Bar dataKey="Geannuleerd" stackId="a" fill="#ef4444" />
                <Bar dataKey="Open" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                {avgWeeklyTargetTotal && (
                  <ReferenceLine y={avgWeeklyTargetTotal} stroke="#1a3860" strokeDasharray="4 4" label={{ value: `Target: ${avgWeeklyTargetTotal}`, position: "right", fill: "#1a3860", fontSize: 10, fontWeight: 600 }} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {drill && <AppointmentsDrillModal filter={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ─── Sortable column header ────────────────────────────────────────────────

function ColHeader({
  label, tooltip, sortKey, current, dir, onSort, className, align = "left",
}: {
  label: string;
  tooltip?: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    tooltip ? <InfoTooltip text={tooltip}>{children}</InfoTooltip> : <>{children}</>;
  return (
    <th className={className}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          active && "text-foreground"
        )}
      >
        <Wrap>{label}</Wrap>
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}
