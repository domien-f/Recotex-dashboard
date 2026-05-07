import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFilterStore } from "@/store/filterStore";
import api from "@/lib/api";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { CalendarCheck, TrendingUp, MapPin, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Treemap,
} from "recharts";
import { AppointmentMap } from "@/components/charts/AppointmentMap";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DealsDrillModal, type DrillFilter } from "@/components/dashboard/DealsDrillModal";
import { DrillableNumber } from "@/components/dashboard/DrillableNumber";

// Belgian province mapping by postcode prefix
function getProvince(postcode: string): string {
  const pc = parseInt(postcode);
  if (isNaN(pc)) return "Onbekend";
  if (pc >= 1000 && pc < 1300) return "Brussel";
  if (pc >= 1300 && pc < 1500) return "Waals-Brabant";
  if (pc >= 1500 && pc < 2000) return "Vlaams-Brabant";
  if (pc >= 2000 && pc < 3000) return "Antwerpen";
  if (pc >= 3000 && pc < 3500) return "Vlaams-Brabant";
  if (pc >= 3500 && pc < 4000) return "Limburg";
  if (pc >= 4000 && pc < 5000) return "Luik";
  if (pc >= 5000 && pc < 6000) return "Namen";
  if (pc >= 6000 && pc < 6600) return "Henegouwen";
  if (pc >= 6600 && pc < 7000) return "Luxemburg";
  if (pc >= 7000 && pc < 8000) return "Henegouwen";
  if (pc >= 8000 && pc < 9000) return "West-Vlaanderen";
  if (pc >= 9000 && pc < 10000) return "Oost-Vlaanderen";
  return "Onbekend";
}

const PROVINCE_COLORS: Record<string, string> = {
  "Antwerpen": "#f08300",
  "Oost-Vlaanderen": "#1a3860",
  "West-Vlaanderen": "#10b981",
  "Vlaams-Brabant": "#8b5cf6",
  "Limburg": "#f97316",
  "Brussel": "#ef4444",
  "Henegouwen": "#06b6d4",
  "Luik": "#ec4899",
  "Namen": "#84cc16",
  "Luxemburg": "#a855f7",
  "Waals-Brabant": "#64748b",
};

const CHANNEL_COLORS: Record<string, string> = {
  Solvari: "#f08300",
  "Red Pepper": "#ef4444",
  Renocheck: "#8b5cf6",
  "META Leads": "#3b82f6",
  Website: "#10b981",
  PPA: "#1a3860",
  "Bis Beurs": "#f59e0b",
  "Bouw En Reno": "#06b6d4",
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

const TreemapContent = ({ x, y, width, height, name, count, fill }: any) => {
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={6} stroke="#fff" strokeWidth={2} />
      <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={width > 80 ? 13 : 10} fontWeight={600}>
        {name}
      </text>
      <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={11}>
        {count}
      </text>
    </g>
  );
};

export function AppointmentsPage() {
  const { dateFrom, dateTo } = useFilterStore();
  const [drill, setDrill] = useState<DrillFilter | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["appointments", "stats", dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get("/appointments/stats", { params: { dateFrom, dateTo } });
      return res.data;
    },
  });

  const { data: geo } = useQuery({
    queryKey: ["appointments", "geo", dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get("/appointments/geo", { params: { dateFrom, dateTo } });
      return res.data as { postcode: string; city: string; count: number; lat: number; lng: number }[];
    },
  });

  const { data: trend } = useQuery({
    queryKey: ["appointments", "trend", dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get("/appointments/trend", { params: { dateFrom, dateTo } });
      return res.data as { month: string; active: number; cancelled: number; total: number }[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Afspraken laden...</span>
        </div>
      </div>
    );
  }

  const channelData = (stats?.byChannel || [])
    .sort((a: any, b: any) => b.count - a.count)
    .map((c: any) => ({ ...c, fill: CHANNEL_COLORS[c.channel] || "#94a3b8" }));

  // Province treemap from geo data
  const provinceMap: Record<string, number> = {};
  for (const g of geo || []) {
    const prov = getProvince(g.postcode);
    provinceMap[prov] = (provinceMap[prov] || 0) + g.count;
  }
  const provinceData = Object.entries(provinceMap)
    .map(([name, count]) => ({
      name,
      count,
      size: count,
      fill: PROVINCE_COLORS[name] || "#94a3b8",
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Afspraken</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overzicht, spreiding en performance per kanaal · klik op een waarde voor de bijhorende deals</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Afspraken" value={formatNumber(stats?.total || 0)} icon={<CalendarCheck className="h-4 w-4" />} onClick={() => setDrill({ status: "APPOINTMENT,WON,LOST", title: "Deals met afspraak" })} formula={{ label: "Afspraken", description: "Aantal ingeplande afspraken in deze periode" }} />
        <KpiCard title="Kanalen" value={formatNumber(channelData.length)} icon={<BarChart3 className="h-4 w-4" />} formula={{ label: "Kanalen", description: "Aantal verschillende kanalen waaruit afspraken voortkomen" }} />
        <KpiCard title="Provincies" value={formatNumber(provinceData.length)} icon={<MapPin className="h-4 w-4" />} formula={{ label: "Provincies", description: "Aantal Belgische provincies met minstens 1 afspraak" }} />
        <KpiCard title="Gem. Kost" value={formatCurrency(stats?.avgCost || 0)} icon={<TrendingUp className="h-4 w-4" />} formula={{ label: "Gemiddelde Kost per Afspraak", description: "Gem. kost per ingeplande afspraak", formula: "Σ(afspraak.kost) ÷ aantal afspraken" }} />
      </div>

      {/* Map */}
      <Card>
        <CardHeader><CardTitle>Afspraken Kaart</CardTitle></CardHeader>
        <CardContent>
          {geo && geo.length > 0 ? (
            <AppointmentMap data={geo} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Geen locatiedata</p>
          )}
        </CardContent>
      </Card>

      {/* Province Treemap + Channel Bar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Spreiding per Provincie</CardTitle></CardHeader>
          <CardContent>
            {provinceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <Treemap
                  data={provinceData}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  content={<TreemapContent />}
                />
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Geen locatiedata</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Afspraken per Kanaal
              <InfoTooltip text="Aantal afspraken per kanaal. Klik op een staaf voor de bijhorende deals." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={channelData} layout="vertical" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="channel" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} width={140} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Afspraken" radius={[0, 6, 6, 0]} fill="#f08300" cursor="pointer"
                    onClick={(d: any) => setDrill({ herkomst: d.channel, status: "APPOINTMENT,WON,LOST", title: `Afspraken — ${d.channel}`, inheritGlobal: false })} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Geen afspraken</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      {trend && trend.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Afspraken Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="total" stroke="#f08300" strokeWidth={2.5} dot={{ r: 4, fill: "#f08300" }} name="Afspraken" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Province Table + Top Cities side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Province Table */}
        <Card>
          <CardHeader><CardTitle>Per Provincie</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provincie</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Afspraken</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">%</th>
                  </tr>
                </thead>
                <tbody>
                  {provinceData.map((p) => {
                    const totalGeo = provinceData.reduce((s, x) => s + x.count, 0);
                    return (
                      <tr key={p.name} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.fill }} />
                            <span className="font-medium text-foreground">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right font-medium tabular-nums">{p.count}</td>
                        <td className="py-3 text-right tabular-nums text-muted-foreground">
                          {totalGeo > 0 ? ((p.count / totalGeo) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top Cities */}
        <Card>
          <CardHeader><CardTitle>Top Steden</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stad</th>
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Postcode</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Afspraken</th>
                  </tr>
                </thead>
                <tbody>
                  {(geo || []).slice(0, 15).map((g) => (
                    <tr key={g.postcode} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                      <td className="py-3 font-medium text-foreground">{g.city || "-"}</td>
                      <td className="py-3"><Badge variant="outline">{g.postcode}</Badge></td>
                      <td className="py-3 text-right font-medium tabular-nums">{g.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Channel Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Kanaal Performance
            <InfoTooltip text="Klik op het aantal afspraken voor de bijhorende deals." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Kanaal">Kanaal</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="Afspraak">Afspraken</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip text="Aandeel van het totaal aantal afspraken">% van totaal</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip text="Som van alle kosten gekoppeld aan deze afspraken">Totale Kost</InfoTooltip></th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip code="KPA">Kost/Afspraak</InfoTooltip></th>
                </tr>
              </thead>
              <tbody>
                {channelData.map((ch: any) => (
                  <tr key={ch.channel} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                    <td className="py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: ch.fill }} />
                        <span className="font-medium text-foreground">{ch.channel}</span>
                      </div>
                    </td>
                    <td className="py-3.5 text-right font-medium tabular-nums">
                      <DrillableNumber filter={{ herkomst: ch.channel, status: "APPOINTMENT,WON,LOST", title: `Afspraken — ${ch.channel}`, inheritGlobal: false }}>
                        {ch.count}
                      </DrillableNumber>
                    </td>
                    <td className="py-3.5 text-right tabular-nums text-muted-foreground">
                      {stats?.total > 0 ? ((ch.count / stats.total) * 100).toFixed(1) : 0}%
                    </td>
                    <td className="py-3.5 text-right tabular-nums text-muted-foreground">{formatCurrency(ch.totalCost || 0)}</td>
                    <td className="py-3.5 text-right tabular-nums text-muted-foreground">
                      {ch.count > 0 ? formatCurrency(Number(ch.totalCost || 0) / ch.count) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {drill && <DealsDrillModal filter={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}
