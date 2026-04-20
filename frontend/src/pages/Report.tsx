import { useState } from "react";
import { useMetricsOverview, useChannelMetrics, useCostVsRevenue } from "@/hooks/useMetrics";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useFilterStore } from "@/store/filterStore";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatPercent, formatNumber, isFreeChannel } from "@/lib/utils";
import { Download, Loader2, Sparkles, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";

const CLR = ["#f08300", "#1a3860", "#10b981", "#8b5cf6", "#f97316", "#06b6d4", "#ec4899", "#64748b"];
const navy = "#1a3860", orange = "#f08300";

// ─── Reusable Components ───

function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center justify-between mb-6 mt-2">
      <div className="flex items-center gap-3">
        <div className="h-[3px] w-10 bg-[#f08300]" />
        <span className="text-[9px] font-bold text-[#f08300]/40 tabular-nums">{n}</span>
        <h2 className="text-lg font-bold text-[#1a3860]">{title}</h2>
      </div>
      <img src="/Recotex_Logo.png" alt="" className="h-3 w-auto opacity-15" />
    </div>
  );
}

function BodyText({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-gray-600 leading-[1.9] mb-4">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-gray-800">{children}</strong>;
}

function AiBox({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-3 my-4 bg-gradient-to-r from-[#f08300]/[0.04] to-transparent border-l-[3px] border-[#f08300] px-4 py-3 section">
      <Sparkles className="h-3.5 w-3.5 text-[#f08300] mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[8px] font-bold text-[#f08300] uppercase tracking-widest mb-1">✦ AI Inzicht</p>
        <p className="text-[10px] text-gray-600 italic leading-[1.7]">{text}</p>
      </div>
    </div>
  );
}

function DidYouKnow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 my-4 bg-blue-50/50 border border-blue-100 px-4 py-3">
      <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest mb-1">Wist je dat?</p>
        <p className="text-[10px] text-gray-600 leading-[1.7]">{text}</p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="relative border border-gray-100 p-4">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color }} />
      <p className="text-[7px] font-bold uppercase tracking-[0.15em] text-gray-400 mt-1">{label}</p>
      <p className="mt-2 text-xl font-bold" style={{ color }}>{value}</p>
      <p className="mt-1 text-[9px] text-gray-500">{sub}</p>
    </div>
  );
}

function T({ h, r }: { h: string[]; r: (string | number)[][] }) {
  return (
    <table className="w-full text-[9px] border-collapse my-3">
      <thead><tr className="border-b-2 border-[#1a3860]">{h.map((c, i) => <th key={c} className={`py-1.5 text-[8px] font-bold uppercase tracking-wider text-[#1a3860] ${i > 0 ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
      <tbody>{r.map((row, i) => (<tr key={i} className={i % 2 === 0 ? "bg-gray-50/60" : ""}>{row.map((cell, j) => <td key={j} className={`py-1.5 ${j === 0 ? "font-medium text-gray-800" : "text-right tabular-nums text-gray-500"}`}>{cell}</td>)}</tr>))}</tbody>
    </table>
  );
}

// ─── Main Report Page ───

export function ReportPage() {
  const { dateFrom, dateTo } = useFilterStore();
  const [params] = useSearchParams();
  const isPrint = params.get("print") === "true";
  const { data: ov } = useMetricsOverview();
  const { data: channels } = useChannelMetrics();
  const { data: cvr } = useCostVsRevenue();
  const [ai, setAi] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("recotex-report-ai") || "{}"); } catch { return {}; }
  });
  const [hideWarning, setHideWarning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [audience, setAudience] = useState<"investor" | "internal">("investor");

  const { data: recl } = useQuery({ queryKey: ["rpt-r", dateFrom, dateTo], queryFn: async () => (await api.get("/metrics/reclamations", { params: { dateFrom, dateTo } })).data });
  const { data: geo } = useQuery({ queryKey: ["rpt-g", dateFrom, dateTo], queryFn: async () => (await api.get("/appointments/geo", { params: { dateFrom, dateTo } })).data as { postcode: string; city: string; count: number }[] });
  const { data: apptTrend } = useQuery({ queryKey: ["rpt-a", dateFrom, dateTo], queryFn: async () => (await api.get("/appointments/trend", { params: { dateFrom, dateTo } })).data });

  const aiMutation = useMutation({
    mutationFn: async () => {
      const tone = audience === "investor" ? "formeel, positief, groei-gericht" : "direct, actionable, met verbeterpunten";
      const res = await api.post("/ai/chat", {
        noSave: true,
        message: `Genereer highlights voor een ${audience === "investor" ? "investeerders" : "intern management"} rapport. Return ALLEEN JSON, geen tekst eromheen:
{"summary":"2-3 zinnen over overall performance, ${tone}",
"revenue":"1-2 zinnen over omzet en groei",
"costs":"1-2 zinnen over kosten efficiëntie en ROI",
"quality":"1-2 zinnen over leadkwaliteit",
"appointments":"1-2 zinnen over afspraken en conversie",
"geo":"1 zin over geografische focus",
"outlook":"2-3 zinnen over vooruitzichten en groeistrategie",
"insights":"5 korte bullet points met concrete cijfers"}
Gebruik concrete cijfers uit de data. Nederlands. ${tone}. GEEN emojis gebruiken.`
      });
      const json = res.data.answer.match(/\{[\s\S]*\}/)?.[0];
      return json ? JSON.parse(json) : {};
    },
    onSuccess: (data) => { setAi(data); localStorage.setItem("recotex-report-ai", JSON.stringify(data)); },
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = JSON.parse(localStorage.getItem("recotex-auth") || "{}").state?.token;
      const aiParam = encodeURIComponent(JSON.stringify(ai));
      const res = await fetch(`/api/report/pdf?token=${token}&dateFrom=${dateFrom}&dateTo=${dateTo}&ai=${aiParam}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Recotex_Rapport_${dateFrom}_${dateTo}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  if (!ov || !channels) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const top = [...channels].sort((a, b) => b.revenue - a.revenue).filter((c) => c.deals > 5);
  const topWon = [...channels].sort((a, b) => b.won - a.won).filter((c) => c.won > 0);
  const topROI = [...channels].filter((c) => c.cost > 0 && parseFloat(c.roi) > 0).sort((a, b) => parseFloat(b.roi) - parseFloat(a.roi));
  const rev = ov.totalRevenue, cost = ov.totalCost;
  const pie = top.filter((c) => c.revenue > 0).map((c, i) => ({ name: c.channel, value: c.revenue, fill: CLR[i % CLR.length] }));
  const topCities = (geo || []).slice(0, 15);
  const inc = channels.filter((ch) => ch.deals > 20 && !ch.costComplete && ch.cost === 0);
  const part = channels.filter((ch) => ch.cost > 0 && !ch.costComplete);
  const hasInc = inc.length > 0 || part.length > 0;
  const gen = new Date().toLocaleDateString("nl-BE");
  const bestChannel = topWon[0];
  const bestROI = topROI[0];

  return (
    <div>
      {/* Controls */}
      {!isPrint && (
        <div className="mb-6 space-y-3 print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Rapport Exporteren</h1>
              <p className="mt-1 text-sm text-muted-foreground">{dateFrom} t/m {dateTo} — 12+ pagina's</p>
            </div>
            <div className="flex gap-3 items-center">
              <select className="text-sm border rounded-lg px-3 py-1.5" value={audience} onChange={(e) => setAudience(e.target.value as any)}>
                <option value="investor">Investeerders</option>
                <option value="internal">Intern</option>
              </select>
              {Object.keys(ai).length === 0 ? <Button variant="outline" onClick={() => aiMutation.mutate()} disabled={aiMutation.isPending}><Sparkles className="mr-1.5 h-4 w-4" />{aiMutation.isPending ? "Genereren..." : "AI Highlights"}</Button> : <Button variant="ghost" size="sm" onClick={() => { setAi({}); localStorage.removeItem("recotex-report-ai"); }}>AI verwijderen</Button>}
              <Button onClick={handleDownload} disabled={downloading}><Download className="mr-1.5 h-4 w-4" />{downloading ? "PDF..." : "Download PDF"}</Button>
            </div>
          </div>
          {hasInc && <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"><input type="checkbox" checked={hideWarning} onChange={(e) => setHideWarning(e.target.checked)} /> Verberg data waarschuwing</label>}
        </div>
      )}

      <div data-report-ready className="bg-white report-doc" style={{ width: isPrint ? "794px" : undefined }}>

        {/* ════════════════ PAGINA 1: COVER ════════════════ */}
        <div className="relative overflow-hidden bg-[#1a3860] text-white" style={{ height: isPrint ? "1123px" : "90vh", minHeight: "600px" }}>
          <div className="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-[#f08300]/15 blur-[120px]" />
          <div className="absolute -left-48 bottom-0 h-[600px] w-[600px] rounded-full bg-[#f08300]/10 blur-[140px]" />
          <div className="absolute right-16 bottom-16 h-60 w-60 rounded-full border border-white/[0.03]" />
          <div className="absolute right-24 bottom-24 h-44 w-44 rounded-full border border-white/[0.03]" />
          <div className="relative z-10 flex h-full flex-col justify-between p-14">
            <img src="/Recotex_Logo.png" alt="Recotex" className="h-10 w-auto self-start brightness-0 invert opacity-80" />
            <div>
              <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.3em] text-[#f08300]">Marketing Performance Rapport</p>
              <h1 className="text-6xl font-bold leading-none">{dateFrom}</h1>
              <h1 className="text-6xl font-bold leading-none text-white/20 mt-1">{dateTo}</h1>
              <div className="mt-14 grid grid-cols-4 gap-6 border-t border-white/10 pt-6">
                {[{ v: formatNumber(ov.totalDeals), l: "Leads" }, { v: formatNumber(ov.wonDeals), l: "Won Deals" }, { v: formatCurrency(rev), l: "Omzet" }, { v: `${ov.roi}x`, l: "ROI" }].map((s, i) => (
                  <div key={i}><p className="text-2xl font-bold">{s.v}</p><p className="mt-0.5 text-[8px] text-white/35 uppercase tracking-widest">{s.l}</p></div>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-[7px] text-white/15"><span>recotex.be — Vertrouwelijk</span><span>Gegenereerd {gen}</span></div>
          </div>
        </div>

        {/* ════════════════ PAGINA 2-3: EXECUTIVE SUMMARY ════════════════ */}
        <div className="px-10 py-8">
          <SectionHeader n="01" title="Executive Summary" />

          {/* Over Recotex */}
          <div className="bg-[#1a3860]/[0.03] border-l-[3px] border-[#1a3860] px-5 py-4 mb-6">
            <p className="text-[8px] font-bold text-[#1a3860] uppercase tracking-widest mb-2">Over Recotex</p>
            <BodyText>
              Recotex is een Belgisch bouwbedrijf gespecialiseerd in <B>dakwerken en gevelwerken</B>. Met een team van ervaren vakmensen
              bedienen wij particuliere en zakelijke klanten in heel België. Onze marketing strategie combineert meerdere leadgeneratie
              kanalen — van online advertising tot samenwerkingen met gespecialiseerde lead providers — om een constante stroom van
              kwalitatieve leads te garanderen.
            </BodyText>
          </div>

          {hasInc && !hideWarning && (
            <div className="mb-4 flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[8px] font-bold text-amber-700 uppercase tracking-wider mb-0.5">Opmerking over datakwaliteit</p>
                <p className="text-[9px] text-amber-700">{[...inc.map((c) => c.channel), ...part.map((c) => `${c.channel} (${c.costMonths}/${c.totalMonths} mnd)`)].join(", ")} — kosten data incompleet. ROI berekeningen voor deze kanalen kunnen onnauwkeurig zijn.</p>
              </div>
            </div>
          )}

          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Kerncijfers Periode</p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <KpiCard label="Totaal Leads" value={formatNumber(ov.totalDeals)} sub={`${formatNumber(ov.uniqueContacts)} unieke contacten`} color={navy} />
            <KpiCard label="Gewonnen Deals" value={formatNumber(ov.wonDeals)} sub={`Win rate: ${formatPercent(ov.winRateGlobal)}`} color="#10b981" />
            <KpiCard label="Totale Omzet" value={formatCurrency(rev)} sub={`Gem. ${formatCurrency(ov.avgRevenuePerDeal)} per deal`} color={orange} />
            <KpiCard label="Marketing Kosten" value={formatCurrency(cost)} sub={`CPL: ${formatCurrency(ov.cpl)}`} color="#ef4444" />
            <KpiCard label="Netto Resultaat" value={formatCurrency(rev - cost)} sub={cost > 0 ? `ROI: ${ov.roi}x` : "Onvoldoende kostendata"} color="#10b981" />
            <KpiCard label="Afspraken" value={formatNumber(ov.totalAppointments)} sub={`KPA: ${formatCurrency(ov.kpa)}`} color="#8b5cf6" />
          </div>

          <div className="bg-gray-50 px-5 py-4 mb-4">
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Samenvatting</p>
            <BodyText>
              In de rapportageperiode <B>{dateFrom}</B> tot <B>{dateTo}</B> genereerde Recotex <B>{formatNumber(ov.totalDeals)} leads</B> via
              {" "}<B>{channels.length} marketing kanalen</B>. Van deze leads werden <B>{formatNumber(ov.wonDeals)} deals succesvol afgesloten</B>,
              goed voor een totale omzet van <B>{formatCurrency(rev)}</B>. De gemiddelde dealwaarde bedraagt <B>{formatCurrency(ov.avgRevenuePerDeal)}</B>.
              {cost > 0 && <> De totale marketing investering van <B>{formatCurrency(cost)}</B> resulteert in een Return on Investment van <B>{ov.roi}x</B> — voor elke geïnvesteerde euro komt er <B>{formatCurrency(parseFloat(ov.roi))}</B> aan omzet terug.</>}
              {ov.totalAppointments > 0 && <> Het sales team realiseerde <B>{formatNumber(ov.totalAppointments)} afspraken</B> met een gemiddelde kost van <B>{formatCurrency(ov.kpa)}</B> per afspraak.</>}
            </BodyText>
          </div>

          <AiBox text={ai.summary} />

          <DidYouKnow text={bestChannel ? `${bestChannel.channel} is het sterkste kanaal met ${formatNumber(bestChannel.won)} gewonnen deals en een totale omzet van ${formatCurrency(bestChannel.revenue)}.` : `Recotex genereert leads via ${channels.length} verschillende kanalen.`} />
        </div>

        {/* ════════════════ PAGINA 4-5: OMZET ANALYSE ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n="02" title="Omzet Analyse" />

          <BodyText>
            De omzet van Recotex wordt gegenereerd via een <B>multichannel leadgeneratie strategie</B>. Elke deal doorloopt
            een pipeline van lead tot klant. Een deal wordt als "gewonnen" beschouwd wanneer het contract is getekend en
            de slaagkans op 100% staat. De onderstaande analyse toont de verdeling van omzet over de verschillende kanalen
            en de ontwikkeling over tijd.
          </BodyText>

          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Omzetverdeling per Kanaal</p>
              <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pie} cx="50%" cy="50%" innerRadius={40} outerRadius={85} paddingAngle={2} dataKey="value" strokeWidth={0}>{pie.map((_, i) => <Cell key={i} fill={CLR[i % CLR.length]} />)}</Pie></PieChart></ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">{pie.map((d, i) => (<div key={i} className="flex items-center gap-1.5 text-[8px]"><div className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} /><span className="text-gray-500 truncate">{d.name}</span><span className="ml-auto text-gray-400 tabular-nums">{formatCurrency(d.value)}</span></div>))}</div>
            </div>
            <div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Kosten vs Omzet over Tijd</p>
              {cvr && <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={cvr}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 8, fill: "#999" }} axisLine={false} /><YAxis tick={{ fontSize: 8, fill: "#999" }} axisLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} /><Bar dataKey="cost" fill="#ef4444" radius={[2, 2, 0, 0]} barSize={16} /><Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 2.5 }} /></ComposedChart>
              </ResponsiveContainer>}
              <p className="text-[8px] text-gray-400 mt-1">Rode bars = kosten, groene lijn = omzet</p>
            </div>
          </div>

          <AiBox text={ai.revenue} />

          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3 mt-4">Top Kanalen op Omzet</p>
          <T h={["Kanaal", "Deals", "Won", "Win%", "Omzet", "Gem./Deal"]} r={topWon.slice(0, 12).map((ch) => [ch.channel, ch.deals, ch.won, formatPercent(ch.winRate), formatCurrency(ch.revenue), formatCurrency(ch.avgRevenuePerDeal)])} />

          <DidYouKnow text={`De gemiddelde deal bij Recotex is ${formatCurrency(ov.avgRevenuePerDeal)} waard. ${bestChannel ? `${bestChannel.channel} levert ${formatPercent(bestChannel.winRate)} van alle leads om in betalende klanten.` : ""}`} />
        </div>

        {/* ════════════════ PAGINA 6-7: KOSTEN & ROI ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n="03" title="Kosten & Rendement" />

          <BodyText>
            Recotex investeert in meerdere marketing kanalen om leads te genereren. Elk kanaal heeft een
            verschillende kostenstructuur — van pay-per-lead platforms zoals Solvari tot online advertising via
            Meta Ads. De effectiviteit wordt gemeten aan de hand van de <B>Return on Investment (ROI)</B>: hoeveel
            euro omzet elke geïnvesteerde euro oplevert. Een ROI van 10x betekent dat €1 investering €10 omzet
            genereert.
          </BodyText>

          {topROI.length > 0 && (
            <>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Meest Rendabele Kanalen</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {topROI.slice(0, 3).map((ch, i) => (
                  <div key={ch.channel} className="border border-gray-100 p-4 text-center relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-[#f08300]" />
                    <p className="text-[7px] text-gray-400 uppercase tracking-widest">{["Beste", "2e", "3e"][i]} ROI</p>
                    <p className="text-sm font-bold text-[#1a3860] mt-1">{ch.channel}</p>
                    <p className="text-2xl font-bold text-[#f08300] mt-1">{ch.roi}x</p>
                    <p className="text-[8px] text-gray-400 mt-1">{formatCurrency(ch.cost)} geïnvesteerd → {formatCurrency(ch.revenue)} omzet</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <AiBox text={ai.costs} />

          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Kosten Detail per Kanaal</p>
          <T h={["Kanaal", "Kosten", "Omzet", "CPL", "KPA", "COA", "ROI"]} r={topROI.map((ch) => {
            const free = isFreeChannel(ch.channel);
            return [ch.channel, free ? "NVT" : formatCurrency(ch.cost), formatCurrency(ch.revenue), free ? "NVT" : formatCurrency(ch.cpl), free ? "NVT" : formatCurrency(ch.kpa), free ? "NVT" : formatCurrency(ch.coa), free ? "NVT" : `${ch.roi}x`];
          })} />

          {cvr && cvr.length > 0 && (
            <>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3 mt-5">Maandelijks Kosten Overzicht</p>
              <T h={["Maand", "Kosten", "Omzet", "Netto", "Kost/Omzet"]} r={cvr.map((row: any) => [row.month, formatCurrency(row.cost), formatCurrency(row.revenue), formatCurrency(row.revenue - row.cost), row.revenue > 0 ? `${((row.cost / row.revenue) * 100).toFixed(1)}%` : "-"])} />
            </>
          )}

          <DidYouKnow text={bestROI ? `${bestROI.channel} genereert ${formatCurrency(bestROI.revenue)} omzet op een investering van slechts ${formatCurrency(bestROI.cost)} — dat is een rendement van ${bestROI.roi}x.` : "Recotex optimaliseert continu de marketing mix voor het beste rendement."} />
        </div>

        {/* ════════════════ PAGINA 8: METHODOLOGIE ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n="04" title="Methodologie & Data Bronnen" />

          <BodyText>
            Dit rapport is gebaseerd op data uit meerdere systemen die dagelijks worden gesynchroniseerd. Hieronder
            een toelichting op de gebruikte metrics, data bronnen en het lead tracking proces.
          </BodyText>

          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Metrics</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { code: "CPL", name: "Cost Per Lead", formula: "Totale kost ÷ aantal leads", desc: "Hoeveel kost het om één potentiële klant aan te trekken? Een lagere CPL betekent efficiëntere leadgeneratie." },
              { code: "KPA", name: "Kost Per Afspraak", formula: "Totale kost ÷ aantal afspraken", desc: "Hoeveel kost het om één verkoopafspraak te realiseren? Dit is de belangrijkste metric voor sales efficiëntie." },
              { code: "COA", name: "Cost Of Acquisition", formula: "Totale kost ÷ gewonnen deals", desc: "De totale kost om één betalende klant te werven. Omvat alle marketing kosten van lead tot contract." },
              { code: "ROI", name: "Return On Investment", formula: "Omzet ÷ totale kost", desc: "Hoeveel euro omzet genereert elke geïnvesteerde euro? Een ROI van 5x betekent €5 omzet per €1 geïnvesteerd." },
            ].map((m) => (
              <div key={m.code} className="border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center bg-[#1a3860] px-2 py-0.5 text-[7px] font-bold text-white tracking-wider">{m.code}</span>
                  <span className="text-[10px] font-bold text-[#1a3860]">{m.name}</span>
                </div>
                <p className="text-[8px] font-mono text-gray-400 mb-2">{m.formula}</p>
                <p className="text-[9px] text-gray-600 leading-[1.7]">{m.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Data Bronnen</p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { name: "Teamleader Focus", type: "CRM Systeem", desc: "Centraal systeem voor lead management, deals, afspraken en omzet tracking. Alle klantinteracties worden hier geregistreerd." },
              { name: "Meta Ads API", type: "Advertising Platform", desc: "Automatische synchronisatie van Facebook en Instagram advertentie kosten. Data wordt dagelijks opgehaald." },
              { name: "Solvari API", type: "Lead Provider", desc: "Automatische import van lead kosten en transacties. Inclusief refunds en coulance correcties." },
            ].map((s) => (
              <div key={s.name} className="border border-gray-100 p-4">
                <p className="text-[10px] font-bold text-[#1a3860]">{s.name}</p>
                <p className="text-[7px] text-[#f08300] uppercase tracking-wider mt-0.5 mb-2">{s.type}</p>
                <p className="text-[9px] text-gray-500 leading-[1.6]">{s.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Lead Pipeline</p>
          <div className="border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              {["Lead binnenkomst", "Eerste contact", "Afspraak", "Offerte", "Gewonnen"].map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: [orange, navy, "#8b5cf6", "#06b6d4", "#10b981"][i] }}>{i + 1}</div>
                    <span className="text-[9px] text-gray-600">{step}</span>
                  </div>
                  {i < 4 && <span className="text-gray-200 text-sm ml-2">→</span>}
                </div>
              ))}
            </div>
            <BodyText>
              Elke lead doorloopt bovenstaande pipeline. De <B>win rate van {formatPercent(ov.winRateGlobal)}</B> geeft aan
              welk percentage van alle leads uiteindelijk klant wordt. De doorlooptijd en conversie per fase variëren per kanaal.
              Leads die niet bruikbaar blijken worden als <B>reclamatie</B> geregistreerd — dit kan door foute contactgegevens,
              geen interesse, of leads buiten het werkgebied.
            </BodyText>
          </div>
        </div>

        {/* ════════════════ PAGINA 9-10: LEADKWALITEIT ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n="05" title="Leadkwaliteit & Conversie" />

          <BodyText>
            Niet elke lead resulteert in een klant. De kwaliteit van binnenkomende leads is een cruciale factor
            in de overall marketing performance. Recotex meet de leadkwaliteit via de <B>reclamatie ratio</B> — het
            percentage leads dat niet bruikbaar blijkt. Een lagere ratio betekent hogere kwaliteit.
          </BodyText>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <KpiCard label="Reclamatie %" value={formatPercent(recl?.reclamationRate || 0)} sub="van alle deals" color={navy} />
            <KpiCard label="Win Rate" value={formatPercent(ov.winRateGlobal)} sub={`${formatNumber(ov.wonDeals)} gewonnen`} color="#10b981" />
            <KpiCard label="Afspraken" value={formatNumber(ov.totalAppointments)} sub="geplande meetings" color={orange} />
            <KpiCard label="Kost/Afspraak" value={formatCurrency(ov.kpa)} sub="gemiddeld per meeting" color="#8b5cf6" />
          </div>

          <AiBox text={ai.quality} />

          <div className="grid grid-cols-2 gap-6 my-4">
            <div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Reclamatie Ratio per Kanaal</p>
              <T h={["Kanaal", "Totaal", "Reclamaties", "Ratio"]} r={(recl?.byChannel || []).slice(0, 10).map((ch: any) => [ch.channel, ch.totalDeals, ch.reclamations, formatPercent(ch.reclamationRate)])} />
            </div>
            <div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Afspraken per Maand</p>
              {apptTrend && apptTrend.length > 0 && <ResponsiveContainer width="100%" height={180}><BarChart data={apptTrend}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 8, fill: "#999" }} axisLine={false} /><YAxis tick={{ fontSize: 8, fill: "#999" }} axisLine={false} /><Bar dataKey="total" fill={orange} radius={[2, 2, 0, 0]} barSize={16} /></BarChart></ResponsiveContainer>}
              <AiBox text={ai.appointments} />
            </div>
          </div>

          <div className="bg-gray-50 px-5 py-4">
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Waarom varieert de reclamatie ratio?</p>
            <BodyText>
              Third-party lead providers (zoals Solvari, Red Pepper) leveren leads op basis van zoekgedrag van consumenten.
              Niet elke consument die informatie aanvraagt is daadwerkelijk geïnteresseerd — vandaar een hogere reclamatie ratio.
              <B> Eigen kanalen</B> (Website, Referentie) hebben doorgaans een lagere ratio omdat de intentie hoger is.
              De overall reclamatie ratio van <B>{formatPercent(recl?.reclamationRate || 0)}</B> is
              {Number(recl?.reclamationRate || 0) > 50 ? " typisch voor de bouwsector met third-party lead providers" : " acceptabel voor deze marktsegment"}.
            </BodyText>
          </div>
        </div>

        {/* ════════════════ PAGINA 11: GEOGRAFIE ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n="06" title="Geografische Spreiding" />

          <BodyText>
            Recotex is actief in heel België, met een focus op Vlaanderen. De onderstaande analyse toont waar onze
            afspraken geografisch plaatsvinden en welke regio's het meest actief zijn. Dit helpt bij het optimaliseren
            van de marketing strategie en het plannen van de werkzaamheden.
          </BodyText>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Top Steden op Afspraken</p>
              <T h={["Stad", "Postcode", "Afspraken"]} r={topCities.map((g) => [g.city || "-", g.postcode, g.count])} />
            </div>
            <div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Afspraken per Kanaal</p>
              <ResponsiveContainer width="100%" height={240}><BarChart data={channels.filter((c) => c.appointments > 0).sort((a, b) => b.appointments - a.appointments).slice(0, 8)} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} /><XAxis type="number" tick={{ fontSize: 8, fill: "#999" }} axisLine={false} /><YAxis type="category" dataKey="channel" tick={{ fontSize: 8, fill: "#999" }} axisLine={false} width={85} /><Bar dataKey="appointments" fill={navy} radius={[0, 2, 2, 0]} barSize={12} /></BarChart></ResponsiveContainer>
            </div>
          </div>

          <AiBox text={ai.geo} />
        </div>

        {/* ════════════════ PAGINA 12: KANAAL DETAIL ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n="07" title="Volledige Kanaal Breakdown" />

          <BodyText>
            Onderstaande tabel toont de volledige breakdown van alle actieve marketing kanalen met meer dan 5 deals
            in de rapportageperiode. Kanalen zonder kosten data tonen "-" voor kosten-gerelateerde metrics.
          </BodyText>

          <T h={["Kanaal", "Deals", "Won", "Win%", "Afspr.", "Omzet", "Kosten", "CPL", "KPA", "ROI"]} r={top.map((ch) => {
            const free = isFreeChannel(ch.channel);
            return [
              ch.channel, ch.deals, ch.won, formatPercent(ch.winRate), ch.appointments,
              formatCurrency(ch.revenue), free ? "NVT" : ch.cost > 0 ? formatCurrency(ch.cost) : "-",
              free ? "NVT" : ch.cost > 0 ? formatCurrency(ch.cpl) : "-",
              free ? "NVT" : ch.cost > 0 ? formatCurrency(ch.kpa) : "-",
              free ? "NVT" : ch.cost > 0 ? `${ch.roi}x` : "-",
            ];
          })} />

          <div className="text-[8px] text-gray-400 mt-2 space-y-1">
            <p>* Alle bedragen zijn exclusief BTW</p>
            <p>* Win% = percentage deals dat resulteert in een contract</p>
            <p>* Kanalen zonder kosten data: kosten facturen nog niet volledig verwerkt</p>
            {hasInc && <p>* Zie pagina 2 voor details over incomplete kosten data</p>}
          </div>
        </div>

        {/* ════════════════ PAGINA 13: AI INZICHTEN (optioneel) ════════════════ */}
        {ai.insights && String(ai.insights).length > 0 && (
          <div className="px-10 py-8">
            <SectionHeader n="08" title="Inzichten & Vooruitzichten" />

            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-[#f08300]" />
              <p className="text-[10px] font-bold text-[#1a3860]">✦ Automatisch Gegenereerde Analyse</p>
              <span className="text-[7px] bg-[#f08300]/10 text-[#f08300] px-1.5 py-0.5 font-bold">AI</span>
            </div>

            <div className="border border-gray-100 p-5 mb-6">
              {typeof ai.insights === "string" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  p: ({ children }) => <p className="text-[10px] text-gray-600 leading-[1.8] my-2">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
                  ol: ({ children }) => <ol className="ml-4 list-decimal space-y-2 my-2">{children}</ol>,
                  ul: ({ children }) => <ul className="ml-4 list-disc space-y-1 my-2">{children}</ul>,
                  li: ({ children }) => <li className="text-[10px] text-gray-600 leading-[1.7]">{children}</li>,
                }}>{String(ai.insights)}</ReactMarkdown>
              ) : Array.isArray(ai.insights) ? (
                <ul className="ml-4 list-decimal space-y-2">
                  {(ai.insights as string[]).map((item, i) => (
                    <li key={i} className="text-[10px] text-gray-600 leading-[1.7]">{String(item)}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <AiBox text={ai.outlook} />

            <div className="bg-[#1a3860]/[0.03] border-l-[3px] border-[#1a3860] px-5 py-4 mt-4">
              <p className="text-[8px] font-bold text-[#1a3860] uppercase tracking-widest mb-2">Vooruitzichten</p>
              <BodyText>
                Recotex blijft investeren in de optimalisatie van de marketing mix. De focus ligt op het verhogen van de
                conversieratio via betere leadkwalificatie, het uitbreiden van eigen kanalen (website, referenties), en
                het verlagen van de acquisitiekost per klant. De combinatie van data-gedreven beslissingen en een sterk
                sales team vormt de basis voor duurzame groei.
              </BodyText>
            </div>
          </div>
        )}

        {/* ════════════════ GLOSSARY ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n={ai.insights ? "10" : "09"} title="Woordenlijst & Begrippen" />

          <BodyText>
            Dit rapport bevat verschillende vakbegrippen en afkortingen die gebruikt worden in marketing performance analyse.
            Hieronder vindt u een overzicht van de belangrijkste termen.
          </BodyText>

          <div className="space-y-3">
            {[
              { term: "Lead", def: "Een potentiële klant die interesse toont in de diensten van Recotex. Een lead komt binnen via een marketing kanaal en wordt opgenomen in het CRM systeem (Teamleader Focus) voor opvolging." },
              { term: "Deal", def: "Een commercieel traject gekoppeld aan een lead. Elke lead resulteert in één of meerdere deals die de verkoop pipeline doorlopen — van eerste contact tot gewonnen of verloren." },
              { term: "Won Deal", def: "Een deal die succesvol is afgesloten — het contract is getekend en de werkzaamheden kunnen starten. De slaagkans staat op 100% in het CRM." },
              { term: "Herkomst / Kanaal", def: "De bron waaruit een lead afkomstig is. Voorbeelden: Solvari (lead provider), Meta Ads (Facebook/Instagram advertenties), Red Pepper (marketing bureau), Website (organisch via recotex.be)." },
              { term: "CPL — Cost Per Lead", def: "De gemiddelde kost om één lead te genereren. Berekening: totale marketing kost ÷ aantal leads. Een lagere CPL betekent efficiëntere leadgeneratie." },
              { term: "KPA — Kost Per Afspraak", def: "De gemiddelde kost om één verkoopafspraak te realiseren. Berekening: totale kost ÷ aantal afspraken. Dit is de belangrijkste metric voor sales efficiëntie." },
              { term: "COA — Cost Of Acquisition", def: "De totale kost om één betalende klant te werven. Berekening: totale kost ÷ aantal gewonnen deals. Omvat alle marketing en sales kosten." },
              { term: "ROI — Return On Investment", def: "Het rendement op de marketing investering. Berekening: omzet ÷ totale kost. Een ROI van 10x betekent dat elke geïnvesteerde euro €10 aan omzet genereert." },
              { term: "Win Rate", def: "Het percentage leads dat uiteindelijk resulteert in een gewonnen deal. Berekening: gewonnen deals ÷ totaal afgeronde deals × 100%." },
              { term: "Reclamatie", def: "Een lead die niet bruikbaar blijkt — door foute contactgegevens, geen interesse, niet bereikbaar, of buiten het werkgebied. Reclamaties worden gecategoriseerd en geanalyseerd per kanaal." },
              { term: "Pipeline", def: "Het verkoopproces dat een lead doorloopt: Lead binnenkomst → Eerste contact → Afspraak → Offerte → Gewonnen/Verloren." },
              { term: "Third-party Lead Provider", def: "Een extern bedrijf dat leads levert aan Recotex, zoals Solvari of Red Pepper. De kwaliteit en kosten variëren per provider." },
            ].map((item) => (
              <div key={item.term} className="flex gap-3 section">
                <div className="w-36 flex-shrink-0">
                  <p className="text-[10px] font-bold text-[#1a3860]">{item.term}</p>
                </div>
                <p className="text-[9px] text-gray-600 leading-[1.7] border-l border-gray-100 pl-3">{item.def}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-blue-50/50 border border-blue-100 px-4 py-3">
            <p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest mb-1">Over dit rapport</p>
            <p className="text-[9px] text-gray-600 leading-[1.7]">
              Dit rapport wordt automatisch gegenereerd door het Recotex Lead Performance Dashboard. De data wordt verzameld uit
              Teamleader Focus (CRM), Meta Ads API (advertentiekosten), en Solvari API (lead provider kosten). Alle bedragen
              zijn exclusief BTW. {Object.keys(ai).length > 0 && "Secties gemarkeerd met ✦ bevatten door AI gegenereerde inzichten op basis van de actuele data."}
            </p>
          </div>
        </div>

        {/* ════════════════ LAATSTE PAGINA: CONCLUSIE ════════════════ */}
        <div className="px-10 py-8 new-page">
          <SectionHeader n={ai.insights ? "09" : "08"} title="Conclusie" />

          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Omzet", value: formatCurrency(rev), color: orange },
              { label: "ROI", value: cost > 0 ? `${ov.roi}x` : "-", color: navy },
              { label: "Won Deals", value: formatNumber(ov.wonDeals), color: "#10b981" },
              { label: "Afspraken", value: formatNumber(ov.totalAppointments), color: "#8b5cf6" },
            ].map((k, i) => (
              <div key={i} className="text-center border border-gray-100 p-4">
                <p className="text-3xl font-bold" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[8px] text-gray-400 uppercase tracking-widest mt-1">{k.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 px-5 py-4 mb-8">
            <BodyText>
              Dit rapport geeft een volledig overzicht van de marketing performance van Recotex in de
              periode <B>{dateFrom}</B> tot <B>{dateTo}</B>. Met <B>{formatNumber(ov.wonDeals)} gewonnen deals</B> en
              een omzet van <B>{formatCurrency(rev)}</B> bevestigt Recotex haar positie als een groeiend bedrijf
              in de Belgische renovatiemarkt. De data-gedreven aanpak via het Lead Performance Dashboard stelt
              ons in staat om marketing budgetten efficiënt te alloceren en de beste kanalen te identificeren.
            </BodyText>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <div className="flex items-start justify-between">
              <div>
                <img src="/Recotex_Logo.png" alt="Recotex" className="h-6 w-auto mb-3 opacity-60" />
                <p className="text-[9px] text-gray-500">Dakwerken & Gevelwerken</p>
                <p className="text-[9px] text-gray-500">recotex.be</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-gray-400">Rapport gegenereerd op {gen}</p>
                <p className="text-[8px] text-gray-400">Periode: {dateFrom} t/m {dateTo}</p>
                <p className="text-[8px] text-gray-400 mt-2">Bronnen: Teamleader Focus, Meta Ads API, Solvari API</p>
                <p className="text-[8px] text-gray-400">Alle bedragen exclusief BTW</p>
              </div>
            </div>
            <p className="text-[7px] text-gray-300 mt-4 text-center">Dit document is vertrouwelijk en uitsluitend bestemd voor de geadresseerde.</p>
          </div>
        </div>
      </div>

      {/* PDF page break CSS */}
      <style>{`
        .report-doc table { break-inside: avoid; }
        .report-doc .section { break-inside: avoid; }
        .report-doc .new-page { break-before: page; }
      `}</style>
    </div>
  );
}
