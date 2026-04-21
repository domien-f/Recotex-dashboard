import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilterStore } from "@/store/filterStore";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, CheckCircle, AlertTriangle, XCircle, Plus, Save, Trash2, Wallet, BarChart3, Target } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface BudgetForecast {
  id: string;
  category: string;
  subcategory: string | null;
  month: string;
  amount: number;
}

interface Comparison {
  month: string;
  forecast: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

interface ComparisonData {
  comparison: Comparison[];
  channelTotals: Record<string, { forecast: number; actual: number; category: string }>;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mrt", "04": "Apr", "05": "Mei", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Dec",
};

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_LABELS[m] || m} ${y}`;
}

function isAdmin(): boolean {
  return useAuthStore.getState().user?.role === "ADMIN";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-white px-4 py-3 shadow-xl">
      <p className="mb-1 text-xs font-semibold text-foreground">{formatMonth(label)}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-foreground">{formatCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ═══ Analytics Tab ═══
function AnalyticsView() {
  const { dateFrom, dateTo } = useFilterStore();

  const { data, isLoading } = useQuery<ComparisonData>({
    queryKey: ["budget-comparison", dateFrom, dateTo],
    queryFn: async () => (await api.get("/budget-forecast/comparison", { params: { dateFrom, dateTo } })).data,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const { comparison, channelTotals } = data;

  const totalForecast = comparison.reduce((s, c) => s + c.forecast, 0);
  const totalActual = comparison.reduce((s, c) => s + c.actual, 0);
  const totalVariance = totalActual - totalForecast;
  const totalVariancePct = totalForecast > 0 ? (totalVariance / totalForecast) * 100 : 0;

  // Only count past months for "on track" calculation
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Budget-adjusted forecast: uses actual/budget ratio to predict future months
  // For each past month, calculate how much of the budget was actually spent (ratio).
  // Then use a weighted average of those ratios to scale future budget months.
  const currentMonth = comparison.find((c) => c.month === currentYM);
  const completedMonths = comparison.filter((c) => c.month < currentYM && c.forecast > 0);
  if (currentMonth && currentMonth.actual > 0 && currentMonth.forecast > 0) {
    completedMonths.push(currentMonth);
  }

  // Calculate spend ratios (actual / budget) with recency weighting
  const ratios = completedMonths.map((c, i) => ({
    ratio: c.actual / c.forecast,
    weight: i + 1, // more recent months weigh more
  }));

  const weightedRatio = ratios.length > 0
    ? ratios.reduce((s, r) => s + r.ratio * r.weight, 0) / ratios.reduce((s, r) => s + r.weight, 0)
    : 1;

  const timelineData = comparison.map((c) => {
    const isPast = c.month < currentYM;
    const isCurrent = c.month === currentYM;
    const hasActual = (isPast || isCurrent) && c.actual > 0;

    const row: any = {
      month: c.month,
      budget: Math.round(c.forecast),
    };

    if (hasActual) {
      row.actual = Math.round(c.actual);
      row.predicted = Math.round(c.actual);
    } else {
      row.budgetFuture = Math.round(c.forecast);
      // Predict future = budget × weighted spend ratio
      row.predicted = Math.round(c.forecast * weightedRatio);
    }

    return row;
  });

  // Year-end prediction
  const totalPredicted = timelineData.reduce((s, d) => s + (d.actual || d.predicted || 0), 0);

  return (
    <div className="space-y-8">
      {/* Hero chart — Actual vs Budget vs Forecast trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Budget vs Werkelijk vs Voorspelling</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Voorspelling op basis van gewogen spend ratio ({(weightedRatio * 100).toFixed(0)}% van budget) — voorspeld jaartotaal: <span className="font-semibold text-foreground">{formatCurrency(totalPredicted)}</span>
                {totalForecast > 0 && <span> ({totalPredicted <= totalForecast ? "" : "+"}{((totalPredicted - totalForecast) / totalForecast * 100).toFixed(1)}% t.o.v. budget)</span>}
              </p>
            </div>
            <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              totalPredicted <= totalForecast * 1.05 ? "bg-emerald-500/10 text-emerald-600" :
              totalPredicted <= totalForecast * 1.15 ? "bg-amber-400/10 text-amber-600" :
              "bg-red-500/10 text-red-600"
            }`}>
              {totalPredicted <= totalForecast * 1.05 ? <CheckCircle className="h-3.5 w-3.5" /> :
               totalPredicted <= totalForecast * 1.15 ? <AlertTriangle className="h-3.5 w-3.5" /> :
               <XCircle className="h-3.5 w-3.5" />}
              {totalPredicted <= totalForecast * 1.05 ? "Op schema" : totalPredicted <= totalForecast * 1.15 ? "Let op" : "Over budget"}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={timelineData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMonth(v)} />
              <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
              {/* Past actual bars — solid dark */}
              <Bar dataKey="actual" fill="#1a3860" name="Werkelijk" radius={[4, 4, 0, 0]} />
              {/* Future budget bars — faded */}
              <Bar dataKey="budgetFuture" fill="#1a3860" name="Budget" radius={[4, 4, 0, 0]} opacity={0.2} />
              {/* Forecast trend line — red */}
              <Line type="monotone" dataKey="predicted" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: "#ef4444" }} strokeDasharray="0" name="Voorspelling" connectNulls={false} />
              {/* Budget line for reference */}
              <Line type="monotone" dataKey="budget" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="6 4" name="Budget lijn" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Gebudgetteerd" value={formatCurrency(totalForecast)} icon={<Target className="h-4 w-4" />} formula={{ label: "Budget Forecast", description: "Som van alle gebudgetteerde bedragen", formula: "Σ maandelijks budget per categorie" }} />
        <KpiCard title="Werkelijke Kost" value={formatCurrency(totalActual)} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard title="Voorspeld Jaartotaal" value={formatCurrency(totalPredicted)} icon={<TrendingUp className="h-4 w-4" />} formula={{ label: "Budget-Adjusted Forecast", description: "Toekomstige maanden × gewogen spend ratio", formula: `Budget × ${(weightedRatio * 100).toFixed(0)}% (gewogen gem. werkelijk/budget)` }} />
        <KpiCard title="Budget Verbruik" value={`${totalForecast > 0 ? ((totalActual / totalForecast) * 100).toFixed(1) : "0"}%`} icon={<BarChart3 className="h-4 w-4" />} formula={{ label: "Budget Verbruik", description: "Hoeveel % van het budget al besteed", formula: "Werkelijke kost ÷ Budget × 100%" }} />
      </div>

      {/* Per-channel breakdown table */}
      <Card>
        <CardHeader><CardTitle>Budget per Kanaal</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kanaal</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Werkelijk</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verschil</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">%</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verbruik</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(channelTotals).sort((a, b) => b[1].forecast - a[1].forecast).map(([channel, { forecast, actual }]) => {
                  const diff = actual - forecast;
                  const pct = forecast > 0 ? (diff / forecast) * 100 : 0;
                  const rowStatus = forecast === 0 ? "neutral" : Math.abs(pct) <= 5 ? "success" : Math.abs(pct) <= 15 ? "warning" : "danger";
                  const progress = forecast > 0 ? Math.min(100, (actual / forecast) * 100) : 0;

                  return (
                    <tr key={channel} className="border-b border-border/30 hover:bg-muted/50">
                      <td className="py-3.5 font-medium text-foreground">{channel}</td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(forecast)}</td>
                      <td className="py-3.5 text-right tabular-nums font-medium">{formatCurrency(actual)}</td>
                      <td className={`py-3.5 text-right tabular-nums font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                      </td>
                      <td className="py-3.5 text-right">
                        {forecast > 0 ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            rowStatus === "success" ? "bg-emerald-500/10 text-emerald-600" :
                            rowStatus === "warning" ? "bg-amber-400/10 text-amber-600" :
                            rowStatus === "danger" ? "bg-red-500/10 text-red-600" :
                            "bg-muted text-muted-foreground"
                          }`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                progress > 110 ? "bg-red-500" : progress > 90 ? "bg-amber-400" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground">{progress.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/60">
                  <td className="pt-3 font-bold text-foreground">Totaal</td>
                  <td className="pt-3 text-right font-bold tabular-nums">{formatCurrency(totalForecast)}</td>
                  <td className="pt-3 text-right font-bold tabular-nums">{formatCurrency(totalActual)}</td>
                  <td className={`pt-3 text-right font-bold tabular-nums ${totalVariance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {totalVariance > 0 ? "+" : ""}{formatCurrency(totalVariance)}
                  </td>
                  <td className="pt-3 text-right">
                    <span className="font-bold tabular-nums">{totalVariancePct >= 0 ? "+" : ""}{totalVariancePct.toFixed(1)}%</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly detail table */}
      <Card>
        <CardHeader><CardTitle>Maandelijks Detail</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maand</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Werkelijk</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verschil</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">%</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verbruik</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => {
                  const isPast = row.month < currentYM;
                  const isCurrent = row.month === currentYM;
                  const pct = row.forecast > 0 ? (row.variance / row.forecast) * 100 : 0;
                  const usage = row.forecast > 0 ? (row.actual / row.forecast) * 100 : 0;

                  return (
                    <tr key={row.month} className={`border-b border-border/30 hover:bg-muted/50 ${!isPast && !isCurrent ? "opacity-50" : ""}`}>
                      <td className="py-3.5 font-medium text-foreground">
                        {formatMonth(row.month)}
                        {isCurrent && <span className="ml-2 inline-flex rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Nu</span>}
                        {!isPast && !isCurrent && <span className="ml-2 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Toekomst</span>}
                      </td>
                      <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(row.forecast)}</td>
                      <td className="py-3.5 text-right tabular-nums font-medium">{isPast || isCurrent ? formatCurrency(row.actual) : <span className="text-muted-foreground">-</span>}</td>
                      <td className={`py-3.5 text-right tabular-nums font-medium ${
                        !isPast && !isCurrent ? "text-muted-foreground" :
                        row.variance > 0 ? "text-red-600" : row.variance < 0 ? "text-emerald-600" : "text-muted-foreground"
                      }`}>
                        {isPast || isCurrent ? `${row.variance > 0 ? "+" : ""}${formatCurrency(row.variance)}` : "-"}
                      </td>
                      <td className="py-3.5 text-right">
                        {(isPast || isCurrent) && row.forecast > 0 ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            Math.abs(pct) <= 5 ? "bg-emerald-500/10 text-emerald-600" :
                            Math.abs(pct) <= 15 ? "bg-amber-400/10 text-amber-600" :
                            "bg-red-500/10 text-red-600"
                          }`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-3.5">
                        {row.forecast > 0 && (isPast || isCurrent) ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${usage > 110 ? "bg-red-500" : usage > 90 ? "bg-amber-400" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(usage, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground">{usage.toFixed(0)}%</span>
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══ Beheer Tab (Admin) ═══

const ALL_MONTHS_2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

function BudgetBeheerView() {
  const queryClient = useQueryClient();
  const { data: forecasts, isLoading } = useQuery<BudgetForecast[]>({
    queryKey: ["budget-forecasts"],
    queryFn: async () => (await api.get("/budget-forecast")).data,
  });

  const [editData, setEditData] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");

  // Group forecasts by category → subcategory
  useEffect(() => {
    if (!forecasts || Object.keys(editData).length > 0) return;
    const grouped: Record<string, Record<string, string>> = {};
    for (const f of forecasts) {
      const key = f.subcategory && f.subcategory !== "" ? `${f.category}|||${f.subcategory}` : f.category;
      if (!grouped[key]) grouped[key] = {};
      const ym = f.month.slice(0, 7);
      grouped[key][ym] = String(f.amount);
    }
    setEditData(grouped);
  }, [forecasts]);

  const importMutation = useMutation({
    mutationFn: async () => {
      // Build rows from editData
      const rows: { category: string; subcategory: string | null; month: string; amount: number }[] = [];
      for (const [key, months] of Object.entries(editData)) {
        const [category, subcategory] = key.includes("|||") ? key.split("|||") : [key, null];
        for (const [month, val] of Object.entries(months)) {
          const amount = parseFloat(val) || 0;
          if (amount > 0) rows.push({ category, subcategory, month, amount });
        }
      }
      return (await api.post("/budget-forecast/import", { rows })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["budget-comparison"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = async () => {
    setSaving(true);
    await importMutation.mutateAsync();
    setSaving(false);
  };

  const addRow = () => {
    if (!newCategory.trim()) return;
    const key = newSubcategory.trim() ? `${newCategory.trim()}|||${newSubcategory.trim()}` : newCategory.trim();
    setEditData({ ...editData, [key]: {} });
    setNewCategory("");
    setNewSubcategory("");
  };

  const deleteRow = (key: string) => {
    const copy = { ...editData };
    delete copy[key];
    setEditData(copy);
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  // Group rows by category for display
  const rowKeys = Object.keys(editData).sort((a, b) => {
    const catA = a.split("|||")[0];
    const catB = b.split("|||")[0];
    if (catA !== catB) return catA.localeCompare(catB);
    const isSubA = a.includes("|||");
    const isSubB = b.includes("|||");
    if (!isSubA && isSubB) return -1;
    if (isSubA && !isSubB) return 1;
    return a.localeCompare(b);
  });

  let lastCategory = "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Budget Beheer</h2>
          <p className="text-xs text-muted-foreground">Voer je gebudgetteerde bedragen per categorie per maand in</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-success font-medium">Opgeslagen</span>}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Opslaan..." : "Alles Opslaan"}
          </Button>
        </div>
      </div>

      {/* Budget rows */}
      <div className="space-y-1">
        {rowKeys.map((key) => {
          const [category, subcategory] = key.includes("|||") ? key.split("|||") : [key, null];
          const isNewCategory = category !== lastCategory;
          lastCategory = category;
          const values = editData[key] || {};
          const total = ALL_MONTHS_2026.reduce((s, m) => s + (parseFloat(values[m] || "0") || 0), 0);

          return (
            <div key={key}>
              {isNewCategory && !subcategory && (
                <div className="pt-4 pb-1 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              )}
              <Card className={subcategory ? "ml-6 border-border/30" : "border-primary/20"}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {subcategory ? (
                        <span className="text-xs text-muted-foreground">{subcategory}</span>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">{category}</span>
                      )}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        Totaal: {formatCurrency(total)}
                      </span>
                    </div>
                    <button onClick={() => deleteRow(key)} className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12">
                    {ALL_MONTHS_2026.map((m) => (
                      <div key={m}>
                        <label className="mb-0.5 block text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{MONTH_LABELS[m.split("-")[1]]}</label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">€</span>
                          <Input
                            type="number"
                            step="any"
                            className="h-7 text-xs px-1.5"
                            value={values[m] || ""}
                            onChange={(e) => setEditData({ ...editData, [key]: { ...values, [m]: e.target.value } })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Add new row */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Nieuwe rij toevoegen</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Categorie</label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="bv. Lead Kanalen"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Subcategorie (optioneel)</label>
              <Input
                value={newSubcategory}
                onChange={(e) => setNewSubcategory(e.target.value)}
                placeholder="bv. Solvari"
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" variant="outline" onClick={addRow} disabled={!newCategory.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" />Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══ Main Page ═══
export function BudgetForecastPage() {
  const [tab, setTab] = useState<"analytics" | "beheer">("analytics");
  const admin = isAdmin();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Budget Forecast</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gebudgetteerd vs werkelijke marketing uitgaven</p>
      </div>

      {admin && (
        <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1 w-fit">
          {(["analytics", "beheer"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                tab === t ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "analytics" ? "Overzicht" : "Budget Beheer"}
            </button>
          ))}
        </div>
      )}

      {tab === "analytics" && <AnalyticsView />}
      {tab === "beheer" && admin && <BudgetBeheerView />}
    </div>
  );
}
