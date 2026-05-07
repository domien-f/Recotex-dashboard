import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, Filter as FilterIcon, ChevronLeft, ChevronRight, Check } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import { exportCSV } from "@/lib/export";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DealDetailModal } from "./DealDetailModal";
import type { Appointment } from "@/types";

export interface AppointmentDrillFilter {
  title: string;
  subtitle?: string;
  /** ISO week key like "2026-W18" — overrides dateFrom/dateTo if provided */
  week?: string;
  dateFrom?: string;
  dateTo?: string;
  verantwoordelijke?: string;
  /** Filter to outcomes (CSV: "WON,LOST"). Otherwise all. */
  outcome?: string;
}

interface AppointmentsDrillModalProps {
  filter: AppointmentDrillFilter;
  onClose: () => void;
}

type SortKey = "klant" | "verkoper" | "outcome" | "scheduledAt" | "date" | "channel";
type SortDir = "asc" | "desc";

const OUTCOME_BG: Record<string, string> = {
  WON: "bg-green-100 text-green-700 border-green-200",
  LOST: "bg-red-100 text-red-700 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-700 border-gray-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
};

const PAGE_SIZE = 50;

export function AppointmentsDrillModal({ filter, onClose }: AppointmentsDrillModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("scheduledAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [outcomeNarrow, setOutcomeNarrow] = useState<string[]>([]);
  const [verkoperNarrow, setVerkoperNarrow] = useState<string[]>([]);
  const [channelNarrow, setChannelNarrow] = useState<string[]>([]);
  const [openDealId, setOpenDealId] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 250); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, outcomeNarrow, verkoperNarrow, channelNarrow]);

  const params: Record<string, string | number> = {};
  if (filter.week) params.week = filter.week;
  if (filter.dateFrom) params.dateFrom = filter.dateFrom;
  if (filter.dateTo) params.dateTo = filter.dateTo;
  if (filter.verantwoordelijke) params.verantwoordelijke = filter.verantwoordelijke;
  if (filter.outcome) params.outcome = filter.outcome;

  const { data, isLoading } = useQuery({
    queryKey: ["drill-appointments", filter, params],
    queryFn: async () => (await api.get("/appointments/list", { params })).data as { appointments: Appointment[]; total: number },
  });

  const allAppointments = data?.appointments || [];

  // Search & narrow filter (client-side)
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return allAppointments.filter((a) => {
      if (outcomeNarrow.length && !outcomeNarrow.includes(a.outcome)) return false;
      const verkoper = a.responsibleUserName || a.deal?.verantwoordelijke || "";
      if (verkoperNarrow.length && !verkoperNarrow.includes(verkoper)) return false;
      if (channelNarrow.length && !(a.channel && channelNarrow.includes(a.channel))) return false;
      if (q) {
        const hay = [
          a.deal?.contact?.name,
          a.deal?.contact?.email,
          a.deal?.title,
          verkoper,
          a.channel,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allAppointments, outcomeNarrow, verkoperNarrow, channelNarrow, debouncedSearch]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "klant": av = a.deal?.contact?.name || ""; bv = b.deal?.contact?.name || ""; break;
        case "verkoper":
          av = a.responsibleUserName || a.deal?.verantwoordelijke || "";
          bv = b.responsibleUserName || b.deal?.verantwoordelijke || "";
          break;
        case "outcome": av = a.outcome; bv = b.outcome; break;
        case "channel": av = a.channel || ""; bv = b.channel || ""; break;
        case "scheduledAt":
          av = new Date(a.scheduledAt || a.date || 0).getTime();
          bv = new Date(b.scheduledAt || b.date || 0).getTime();
          break;
        case "date":
          av = new Date(a.date || 0).getTime();
          bv = new Date(b.date || 0).getTime();
          break;
      }
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortDir]);

  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const distinctOutcomes = useMemo(() => Array.from(new Set(allAppointments.map((a) => a.outcome))).sort(), [allAppointments]);
  const distinctVerkopers = useMemo(() => Array.from(new Set(allAppointments.map((a) => a.responsibleUserName || a.deal?.verantwoordelijke).filter(Boolean) as string[])).sort(), [allAppointments]);
  const distinctChannels = useMemo(() => Array.from(new Set(allAppointments.map((a) => a.channel).filter(Boolean) as string[])).sort(), [allAppointments]);

  const wonCount = sorted.filter((a) => a.outcome === "WON").length;
  const cancelledCount = sorted.filter((a) => a.outcome === "CANCELLED").length;
  const doorgegaan = sorted.filter((a) => a.outcome === "WON" || a.outcome === "LOST").length;
  const totalActiveNarrows = outcomeNarrow.length + verkoperNarrow.length + channelNarrow.length;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "scheduledAt" || key === "date" ? "desc" : "asc"); }
  };

  const handleExport = () => {
    exportCSV(
      `afspraken_${filter.title.toLowerCase().replace(/\s+/g, "_")}`,
      ["Klant", "Email", "Telefoon", "Verkoper", "Datum gepland", "Datum afspraak", "Kanaal", "Status", "Kost"],
      sorted.map((a) => [
        a.deal?.contact?.name || "",
        a.deal?.contact?.email || "",
        a.deal?.contact?.phone || "",
        a.responsibleUserName || a.deal?.verantwoordelijke || "",
        a.scheduledAt ? new Date(a.scheduledAt).toLocaleDateString("nl-BE") : "",
        a.date ? new Date(a.date).toLocaleDateString("nl-BE") : "",
        a.channel || "",
        a.outcome,
        a.cost || 0,
      ])
    );
  };

  const clearAllNarrows = () => { setOutcomeNarrow([]); setVerkoperNarrow([]); setChannelNarrow([]); };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-border/60 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 border-b border-border/40 px-6 py-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground truncate">{filter.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span><span className="font-semibold text-foreground">{totalCount}</span> afspraken</span>
                <span>·</span>
                <span><span className="font-semibold text-foreground">{doorgegaan}</span> doorgegaan</span>
                <span>·</span>
                <span><span className="font-semibold text-foreground">{wonCount}</span> won</span>
                <span>·</span>
                <span><span className="font-semibold text-foreground">{cancelledCount}</span> geannuleerd</span>
                {filter.subtitle && <><span>·</span><span>{filter.subtitle}</span></>}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors flex-shrink-0"><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-6 py-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op klant, titel of email..."
                className="w-full rounded-lg border border-border/60 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {totalActiveNarrows > 0 && (
              <button onClick={clearAllNarrows} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10">
                <FilterIcon className="h-3.5 w-3.5" />
                Wis kolomfilters ({totalActiveNarrows})
              </button>
            )}
            <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-white px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/30">
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
            ) : paged.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-sm text-muted-foreground">Geen afspraken gevonden</div>
                <div className="mt-1 text-xs text-muted-foreground/70">Pas je zoekterm of filters aan</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-border/40 z-10">
                  <tr className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <SortHeader label="Klant" active={sortKey === "klant"} dir={sortDir} onClick={() => handleSort("klant")} className="px-6 py-2.5" />
                    <FilterHeader
                      label="Verkoper" tooltip="Verantwoordelijke"
                      sortActive={sortKey === "verkoper"} sortDir={sortDir} onSort={() => handleSort("verkoper")}
                      options={distinctVerkopers} selected={verkoperNarrow} onChange={setVerkoperNarrow}
                      className="py-2.5"
                    />
                    <SortHeader label="Gepland op" tooltip="Datum waarop de afspraak ingepland werd" active={sortKey === "scheduledAt"} dir={sortDir} onClick={() => handleSort("scheduledAt")} className="py-2.5" />
                    <SortHeader label="Datum afspraak" tooltip="Datum waarop de afspraak doorgaat" active={sortKey === "date"} dir={sortDir} onClick={() => handleSort("date")} className="py-2.5" />
                    <FilterHeader
                      label="Kanaal" tooltip="Kanaal"
                      sortActive={sortKey === "channel"} sortDir={sortDir} onSort={() => handleSort("channel")}
                      options={distinctChannels} selected={channelNarrow} onChange={setChannelNarrow}
                      className="py-2.5"
                    />
                    <FilterHeader
                      label="Status" tooltip="Status"
                      sortActive={sortKey === "outcome"} sortDir={sortDir} onSort={() => handleSort("outcome")}
                      options={distinctOutcomes} selected={outcomeNarrow} onChange={setOutcomeNarrow}
                      colorMap={OUTCOME_BG}
                      className="py-2.5"
                    />
                    <th className="px-6 py-2.5 text-right">Kost</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((a) => {
                    const verkoper = a.responsibleUserName || a.deal?.verantwoordelijke;
                    return (
                      <tr key={a.id} onClick={() => a.dealId && setOpenDealId(a.dealId)} className="border-b border-border/20 hover:bg-primary/5 cursor-pointer transition-colors">
                        <td className="px-6 py-2.5 font-medium text-foreground">{a.deal?.contact?.name || "—"}</td>
                        <td className="py-2.5 text-muted-foreground">{verkoper || "—"}</td>
                        <td className="py-2.5 text-muted-foreground tabular-nums">{a.scheduledAt ? new Date(a.scheduledAt).toLocaleDateString("nl-BE") : "—"}</td>
                        <td className="py-2.5 text-muted-foreground tabular-nums">{a.date ? new Date(a.date).toLocaleDateString("nl-BE") : "—"}</td>
                        <td className="py-2.5 text-muted-foreground">{a.channel || "—"}</td>
                        <td className="py-2.5">
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", OUTCOME_BG[a.outcome] || "bg-muted text-muted-foreground border-border")}>
                            {a.outcome}
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right tabular-nums text-muted-foreground">{a.cost ? formatCurrency(a.cost) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/40 px-6 py-3 text-xs text-muted-foreground">
              <div>Tonen <span className="font-semibold text-foreground">{(page - 1) * PAGE_SIZE + 1}</span>–<span className="font-semibold text-foreground">{Math.min(page * PAGE_SIZE, totalCount)}</span> van <span className="font-semibold text-foreground">{totalCount}</span></div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-border/60 bg-white p-1.5 disabled:opacity-40 hover:bg-muted/30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="font-semibold text-foreground">{page}</span><span>/</span><span>{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-lg border border-border/60 bg-white p-1.5 disabled:opacity-40 hover:bg-muted/30"><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {openDealId && <DealDetailModal dealId={openDealId} onClose={() => setOpenDealId(null)} />}
    </>
  );
}

interface SortHeaderProps {
  label: string;
  tooltip?: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}

function SortHeader({ label, tooltip, active, dir, onClick, className }: SortHeaderProps) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className}>
      <button onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", active && "text-foreground")}>
        {tooltip ? <InfoTooltip text={tooltip}>{label}</InfoTooltip> : label}
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

interface FilterHeaderProps {
  label: string;
  tooltip?: string;
  sortActive: boolean;
  sortDir: SortDir;
  onSort: () => void;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  colorMap?: Record<string, string>;
  className?: string;
}

function FilterHeader({ label, tooltip, sortActive, sortDir, onSort, options, selected, onChange, colorMap, className }: FilterHeaderProps) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const Icon = !sortActive ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const filteredOpts = options.filter((o) => o.toLowerCase().includes(s.toLowerCase()));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <th className={className}>
      <div ref={wrapRef} className="relative inline-flex items-center gap-1">
        <button onClick={onSort} className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", sortActive && "text-foreground")}>
          {tooltip ? <InfoTooltip code={tooltip}>{label}</InfoTooltip> : label}
          <Icon className="h-3 w-3 opacity-60" />
        </button>
        <button onClick={() => setOpen((o) => !o)} className={cn("inline-flex items-center justify-center rounded p-0.5 hover:bg-muted/40 transition-colors", selected.length > 0 && "text-primary")} title={selected.length > 0 ? `${selected.length} actief` : "Filter"}>
          <FilterIcon className="h-3 w-3" />
          {selected.length > 0 && <span className="ml-0.5 text-[9px] font-bold tabular-nums">{selected.length}</span>}
        </button>
        {open && (
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-border/60 bg-white p-2 shadow-2xl normal-case tracking-normal" onClick={(e) => e.stopPropagation()}>
            {options.length > 8 && (
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input type="text" value={s} onChange={(e) => setS(e.target.value)} placeholder="Zoek..." className="w-full rounded-md border border-border/60 bg-white pl-7 pr-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" onClick={(e) => e.stopPropagation()} />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {filteredOpts.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">Geen waarden</div>
              ) : (
                filteredOpts.map((opt) => {
                  const isSelected = selected.includes(opt);
                  return (
                    <button key={opt} onClick={() => toggle(opt)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-normal text-foreground hover:bg-muted/40 transition-colors">
                      <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded border flex-shrink-0", isSelected ? "border-primary bg-primary text-white" : "border-border bg-white")}>
                        {isSelected && <Check className="h-2.5 w-2.5" />}
                      </span>
                      {colorMap && colorMap[opt] ? (
                        <span className={cn("inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase", colorMap[opt])}>{opt}</span>
                      ) : (
                        <span className="truncate">{opt}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {selected.length > 0 && (
              <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
                <button onClick={() => onChange([])} className="text-[11px] font-semibold text-primary hover:underline">Wis ({selected.length})</button>
                <button onClick={() => setOpen(false)} className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary/90">Sluit</button>
              </div>
            )}
          </div>
        )}
      </div>
    </th>
  );
}
