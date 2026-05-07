import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMetricsOverview, useChannelMetrics } from "@/hooks/useMetrics";
import { useFilterStore } from "@/store/filterStore";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle, Save, CalendarCheck } from "lucide-react";
import { MetricLabel } from "@/components/ui/metric-label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { AppointmentTargetRow } from "@/types";

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

function getStatus(current: number, target: number, dir: "lower" | "higher"): "success" | "good" | "warning" | "danger" {
  if (dir === "lower") {
    if (current <= target) return "success";
    if (current <= target * 1.15) return "good";
    if (current <= target * 1.4) return "warning";
    return "danger";
  }
  if (current >= target) return "success";
  if (current >= target * 0.85) return "good";
  if (current >= target * 0.6) return "warning";
  return "danger";
}

function getProgress(current: number, target: number, dir: "lower" | "higher"): number {
  if (dir === "lower") {
    if (current <= 0) return 100;
    return target > 0 ? Math.max(0, Math.min(100, (target / current) * 100)) : 0;
  }
  return target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
}

function getDeviation(current: number, target: number, dir: "lower" | "higher"): string {
  if (target === 0) return "";
  if (dir === "lower") {
    if (current <= target) return `${((1 - current / target) * 100).toFixed(0)}% onder target`;
    return `${((current / target - 1) * 100).toFixed(0)}% boven target`;
  }
  if (current >= target) return `${((current / target - 1) * 100).toFixed(0)}% boven target`;
  return `${((1 - current / target) * 100).toFixed(0)}% onder target`;
}

const SC: Record<string, { bg: string; text: string; label: string }> = {
  success: { bg: "bg-emerald-500", text: "text-emerald-600", label: "Op target" },
  good: { bg: "bg-emerald-400/70", text: "text-emerald-500", label: "Bijna op target" },
  warning: { bg: "bg-amber-400", text: "text-amber-600", label: "Aandacht nodig" },
  danger: { bg: "bg-red-500", text: "text-red-600", label: "Onder target" },
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
  // Third-party = Solvari, Renocheck, PPA, Offertevergelijker, Bouw En Reno, etc.
  // Red Pepper is eigen (agency running our own ads)
  const thirdPartyChannels = ["Solvari", "Renocheck", "PPA", "Offertevergelijker", "Bouw En Reno", "Bis Beurs", "Serieus Verbouwen", "Bobex", "Jaimy", "Fourvision", "Giga Leads"];
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

  const coaStatus: "success" | "good" | "warning" | "danger" = coa <= coaOver ? "success" : coa <= coaTarget ? "good" : coa <= coaAcceptable ? "warning" : "danger";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">KPI Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Voortgang richting eind 2026 doelstellingen</p>
        </div>
        <a
          href="/settings?tab=kpi"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
        >
          Targets instellen →
        </a>
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

          const deviation = getDeviation(current, target, def.direction);
          const StatusIcon = status === "success" || status === "good" ? CheckCircle : status === "warning" ? AlertTriangle : XCircle;

          return (
            <Card key={metric} className="overflow-hidden">
              <div className={`h-1 ${c.bg}`} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{def.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                  </div>
                  <StatusIcon className={`h-5 w-5 ${c.text}`} />
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl font-bold text-foreground">{def.format(current)}</span>
                  <span className="text-sm text-muted-foreground">/ {def.format(target)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${c.bg}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className={`text-xs font-medium ${c.text}`}>{c.label}</p>
                  {deviation && <p className="text-[10px] text-muted-foreground">{deviation}</p>}
                </div>
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
              {coaStatus === "success" || coaStatus === "good" ? <CheckCircle className={`h-5 w-5 ${SC[coaStatus].text}`} /> : coaStatus === "warning" ? <AlertTriangle className={`h-5 w-5 ${SC[coaStatus].text}`} /> : <XCircle className={`h-5 w-5 ${SC[coaStatus].text}`} />}
            </div>
            <div className="text-2xl font-bold text-foreground mb-4">{formatCurrency(coa)}</div>
            <div className="space-y-2.5">
              {[
                { label: "Overachieved", value: coaOver, ok: coa <= coaOver, color: "bg-emerald-500" },
                { label: "Target", value: coaTarget, ok: coa <= coaTarget, bold: true, color: "bg-emerald-400/70" },
                { label: "Acceptable", value: coaAcceptable, ok: coa <= coaAcceptable, color: "bg-amber-400" },
              ].map((tier) => (
                <div key={tier.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${tier.ok ? tier.color : "bg-muted"}`} />
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
                    const kpaTarget = t("kpa") || 120;
                    const kpaStatus = chKpa <= kpaTarget ? "text-emerald-600" : chKpa <= kpaTarget * 1.15 ? "text-emerald-500" : chKpa <= kpaTarget * 1.4 ? "text-amber-600" : "text-red-600";
                    const coaColor = chCoa <= coaOver ? "text-emerald-600" : chCoa <= coaTarget ? "text-emerald-500" : chCoa <= coaAcceptable ? "text-amber-600" : "text-red-600";
                    const kpaOk = chKpa <= kpaTarget * 1.15;
                    const coaOk = chCoa <= coaAcceptable;
                    const rowOk = kpaOk && coaOk;
                    return (
                      <tr key={ch.channel} className="border-b border-border/30 hover:bg-muted/50">
                        <td className="py-3.5 font-medium text-foreground">{ch.channel}</td>
                        <td className="py-3.5 text-right tabular-nums">{ch.deals}</td>
                        <td className="py-3.5 text-right tabular-nums">{formatCurrency(ch.cpl)}</td>
                        <td className="py-3.5 text-right"><span className={`font-medium tabular-nums ${kpaStatus}`}>{formatCurrency(ch.kpa)}</span></td>
                        <td className="py-3.5 text-right"><span className={`font-medium tabular-nums ${coaColor}`}>{formatCurrency(ch.coa)}</span></td>
                        <td className="py-3.5 text-right font-semibold tabular-nums text-primary">{ch.roi}x</td>
                        <td className="py-3.5 text-right">{rowOk ? <CheckCircle className="ml-auto h-4 w-4 text-emerald-500" /> : chCoa <= coaAcceptable || chKpa <= kpaTarget * 1.4 ? <AlertTriangle className="ml-auto h-4 w-4 text-amber-500" /> : <XCircle className="ml-auto h-4 w-4 text-red-500" />}</td>
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

// ─── Appointment Target Editor ─────────────────────────────────────────────

interface TlUser { id: string; name: string | null; email: string | null }

export function AppointmentTargetEditor() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.canEdit)();
  // Per-verkoper drafts: { weeklyTarget?: string; teamleaderUserId?: string }
  const [drafts, setDrafts] = useState<Record<string, { weeklyTarget?: string; teamleaderUserId?: string }>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery<AppointmentTargetRow[]>({
    queryKey: ["appointment-targets"],
    queryFn: async () => (await api.get("/appointment-targets")).data,
  });

  // Optional: list of Teamleader users (only available when TL is connected).
  // We tolerate a 4xx silently — the dropdown then just stays empty.
  const { data: tlUsers } = useQuery<TlUser[]>({
    queryKey: ["tl", "users"],
    queryFn: async () => {
      try {
        return (await api.get("/integrations/teamleader/users")).data;
      } catch {
        return [];
      }
    },
  });

  // Seed drafts from server data once
  useEffect(() => {
    if (!rows) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!next[r.verantwoordelijke]) {
          next[r.verantwoordelijke] = {
            weeklyTarget: r.weeklyTarget !== null ? String(r.weeklyTarget) : "",
            teamleaderUserId: r.teamleaderUserId || "",
          };
        }
      }
      return next;
    });
  }, [rows]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Array<{ verantwoordelijke: string; weeklyTarget: number | null; teamleaderUserId: string | null }> = [];
      for (const r of rows || []) {
        const draft = drafts[r.verantwoordelijke];
        if (!draft) continue;
        const v = draft.weeklyTarget;
        const draftTl = draft.teamleaderUserId || null;
        const serverTl = r.teamleaderUserId || null;

        if (v === undefined || v === "") {
          // Field is empty — only send if the verkoper currently HAS an active
          // target (this is an untrack action). Otherwise no-op.
          if (r.weeklyTarget !== null) {
            payload.push({ verantwoordelijke: r.verantwoordelijke, weeklyTarget: null, teamleaderUserId: draftTl });
          }
          continue;
        }
        const n = parseInt(v, 10);
        if (!Number.isFinite(n) || n < 0) continue;

        // Only include rows that actually changed — saves a roundtrip
        if (n === r.weeklyTarget && draftTl === serverTl) continue;

        payload.push({ verantwoordelijke: r.verantwoordelijke, weeklyTarget: n, teamleaderUserId: draftTl });
      }
      if (payload.length === 0) {
        throw new Error("Geen wijzigingen om op te slaan.");
      }
      return (await api.put("/appointment-targets/bulk", { rows: payload })).data;
    },
    onSuccess: async () => {
      // Re-fetch canonical server state, then RESYNC drafts so the form
      // reflects exactly what's saved (no more drift between UI and DB).
      const fresh = (await api.get("/appointment-targets")).data as AppointmentTargetRow[];
      queryClient.setQueryData(["appointment-targets"], fresh);
      queryClient.invalidateQueries({ queryKey: ["bezetting"] });
      const next: Record<string, { weeklyTarget?: string; teamleaderUserId?: string }> = {};
      for (const r of fresh) {
        next[r.verantwoordelijke] = {
          weeklyTarget: r.weeklyTarget !== null ? String(r.weeklyTarget) : "",
          teamleaderUserId: r.teamleaderUserId || "",
        };
      }
      setDrafts(next);
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || e?.message || "Opslaan mislukt — probeer opnieuw.";
      setSaveError(msg);
      setSaved(false);
    },
  });

  if (isLoading || !rows) return null;

  const dirty = rows.some((r) => {
    const draft = drafts[r.verantwoordelijke];
    if (!draft) return false;
    const draftN = (draft.weeklyTarget ?? "") === "" ? null : parseInt(draft.weeklyTarget!, 10);
    const draftTl = draft.teamleaderUserId || null;
    return draftN !== r.weeklyTarget || draftTl !== (r.teamleaderUserId || null);
  });

  // TL UUIDs already mapped — for dropdown disabled-state, prevent same TL user mapped twice
  const usedTlIds = new Set(
    Object.entries(drafts)
      .map(([, d]) => d?.teamleaderUserId)
      .filter(Boolean) as string[]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Bouwadviseurs — weekly target & Teamleader koppeling
            <InfoTooltip text="Alleen bouwadviseurs (= verkopers waarvoor je hier een target instelt) worden getoond op de Bezetting-pagina. Niet-tracked Excel-namen blijven onzichtbaar. Vul een target in om iemand te tracken." />
          </CardTitle>
          {canEdit && (
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs font-semibold text-success">Opgeslagen ✓</span>}
              {saveError && <span className="text-xs font-semibold text-destructive max-w-[300px] truncate" title={saveError}>{saveError}</span>}
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Geen verkopers gevonden — importeer eerst deals.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const draft = drafts[r.verantwoordelijke] || {};
              const currentTl = draft.teamleaderUserId || "";
              return (
                <div key={r.verantwoordelijke} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary flex-shrink-0">
                    {r.verantwoordelijke.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <div className="text-sm font-medium text-foreground truncate">{r.verantwoordelijke}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.effectiveFrom ? `Sinds ${new Date(r.effectiveFrom).toLocaleDateString("nl-BE")}` : "Nog geen target"}
                    </div>
                  </div>

                  {/* TL user dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">TL user</span>
                    <select
                      value={currentTl}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDrafts((prev) => ({
                          ...prev,
                          [r.verantwoordelijke]: { ...(prev[r.verantwoordelijke] || {}), teamleaderUserId: v },
                        }));
                        setSaveError(null);
                      }}
                      className="rounded-lg border border-border/60 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 max-w-[180px]"
                      title={tlUsers && tlUsers.length === 0 ? "Verbind eerst Teamleader op het Integraties tab" : ""}
                    >
                      <option value="">— niet gekoppeld —</option>
                      {(tlUsers || []).map((u) => (
                        <option key={u.id} value={u.id} disabled={u.id !== currentTl && usedTlIds.has(u.id)}>
                          {u.name || u.email || u.id}{u.id !== currentTl && usedTlIds.has(u.id) ? " (al gebruikt)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Weekly target */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Target</span>
                    <Input
                      type="number"
                      min="0"
                      value={draft.weeklyTarget ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDrafts((prev) => ({
                          ...prev,
                          [r.verantwoordelijke]: { ...(prev[r.verantwoordelijke] || {}), weeklyTarget: v },
                        }));
                        setSaveError(null);
                      }}
                      placeholder="0"
                      disabled={!canEdit}
                      className="h-8 w-16 text-center text-sm tabular-nums"
                    />
                    <span className="text-[10px] text-muted-foreground">/wk</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Bezettingsgraad = doorgegaan (WON + LOST) ÷ target × 100%. <span className="font-semibold">Alleen bouwadviseurs met een target verschijnen op de Bezetting-pagina.</span> Verwijder een target (of zet 'm op leeg en sla op) om iemand uit de view te halen. De TL-koppeling zorgt dat afspraken die door een collega worden gedaan correct worden geteld bij de juiste verkoper.
          {tlUsers && tlUsers.length === 0 && <span className="block mt-1 text-amber-600">Teamleader is niet verbonden — TL user dropdowns zijn leeg. Verbind eerst op Settings → Integraties tab.</span>}
        </p>
      </CardContent>
    </Card>
  );
}
