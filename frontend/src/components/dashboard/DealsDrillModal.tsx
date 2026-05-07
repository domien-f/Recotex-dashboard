import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, Filter as FilterIcon, ChevronLeft, ChevronRight, Check } from "lucide-react";
import api from "@/lib/api";
import { useFilterStore } from "@/store/filterStore";
import { formatCurrency, cn } from "@/lib/utils";
import { exportCSV } from "@/lib/export";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DealDetailModal } from "./DealDetailModal";
import type { Deal } from "@/types";

export interface DrillFilter {
  title: string;
  subtitle?: string;
  /** Pre-applied server-side filter parameters */
  status?: string;            // e.g. "WON" or "WON,LOST"
  herkomst?: string;          // overrides global filter
  typeWerken?: string;
  verantwoordelijke?: string;
  reclamation?: "true" | "false";
  /** Whether to inherit global filters (channels, status, typeWerken, verantwoordelijken). Default true. */
  inheritGlobal?: boolean;
}

interface DealsDrillModalProps {
  filter: DrillFilter;
  onClose: () => void;
}

type SortKey = "name" | "title" | "herkomst" | "verantwoordelijke" | "phase" | "status" | "revenue" | "date";
type SortDir = "asc" | "desc";

const STATUS_BG: Record<string, string> = {
  WON: "bg-green-100 text-green-700 border-green-200",
  LOST: "bg-red-100 text-red-700 border-red-200",
  APPOINTMENT: "bg-amber-100 text-amber-700 border-amber-200",
  QUALIFIED: "bg-blue-100 text-blue-700 border-blue-200",
  NEW: "bg-orange-100 text-orange-700 border-orange-200",
};

const PAGE_SIZE = 50;

export function DealsDrillModal({ filter, onClose }: DealsDrillModalProps) {
  const { dateFrom, dateTo, dateMode, channels, typeWerken: gTypeWerken, verantwoordelijken: gVerant } = useFilterStore();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  // In-modal column narrow filters — populated from header dropdowns
  const [statusNarrow, setStatusNarrow] = useState<string[]>([]);
  const [channelNarrow, setChannelNarrow] = useState<string[]>([]);
  const [verkoperNarrow, setVerkoperNarrow] = useState<string[]>([]);
  const [phaseNarrow, setPhaseNarrow] = useState<string[]>([]);
  const [openDealId, setOpenDealId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusNarrow, channelNarrow, verkoperNarrow, phaseNarrow]);

  // Build params (server-side fetch — only date + locked-in filters)
  const inherit = filter.inheritGlobal !== false;
  const params: Record<string, string | number> = {
    dateFrom, dateTo, dateMode,
    limit: 500,
  };
  if (filter.status) params.status = filter.status;
  if (filter.reclamation) params.reclamation = filter.reclamation;
  if (filter.herkomst) {
    params.herkomst = filter.herkomst;
  } else if (inherit && channels.length) {
    params.herkomst = channels.join(",");
  }
  if (filter.typeWerken) {
    params.typeWerken = filter.typeWerken;
  } else if (inherit && gTypeWerken.length) {
    params.typeWerken = gTypeWerken.join(",");
  }
  if (filter.verantwoordelijke) {
    params.verantwoordelijke = filter.verantwoordelijke;
  } else if (inherit && gVerant.length) {
    params.verantwoordelijke = gVerant.join(",");
  }
  if (debouncedSearch) params.search = debouncedSearch;

  const { data, isLoading } = useQuery({
    queryKey: ["drill-deals", filter, params],
    queryFn: async () => (await api.get("/deals", { params })).data as { deals: Deal[]; total: number },
  });

  const allDeals = data?.deals || [];

  // Distinct values from current dataset for column header dropdowns
  const distinctChannels = useMemo(() => {
    const s = new Set(allDeals.map((d) => d.herkomst).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [allDeals]);
  const distinctStatuses = useMemo(() => {
    const s = new Set(allDeals.map((d) => d.status));
    return Array.from(s).sort();
  }, [allDeals]);
  const distinctVerkopers = useMemo(() => {
    const s = new Set(allDeals.map((d) => d.verantwoordelijke).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [allDeals]);
  const distinctPhases = useMemo(() => {
    const s = new Set(allDeals.map((d) => d.phase).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [allDeals]);

  // Client-side filter narrow (column dropdowns)
  const filteredDeals = useMemo(() => {
    let out = allDeals;
    if (statusNarrow.length) out = out.filter((d) => statusNarrow.includes(d.status));
    if (channelNarrow.length) out = out.filter((d) => d.herkomst && channelNarrow.includes(d.herkomst));
    if (verkoperNarrow.length) out = out.filter((d) => d.verantwoordelijke && verkoperNarrow.includes(d.verantwoordelijke));
    if (phaseNarrow.length) out = out.filter((d) => d.phase && phaseNarrow.includes(d.phase));
    return out;
  }, [allDeals, statusNarrow, channelNarrow, verkoperNarrow, phaseNarrow]);

  const sortedDeals = useMemo(() => {
    const sorted = [...filteredDeals].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "name": av = a.contact?.name || ""; bv = b.contact?.name || ""; break;
        case "title": av = a.title || ""; bv = b.title || ""; break;
        case "herkomst": av = a.herkomst || ""; bv = b.herkomst || ""; break;
        case "verantwoordelijke": av = a.verantwoordelijke || ""; bv = b.verantwoordelijke || ""; break;
        case "phase": av = a.phase || ""; bv = b.phase || ""; break;
        case "status": av = a.status; bv = b.status; break;
        case "revenue": av = a.revenue || 0; bv = b.revenue || 0; break;
        case "date":
          av = new Date(a.wonAt || a.dealCreatedAt || a.createdAt || 0).getTime();
          bv = new Date(b.wonAt || b.dealCreatedAt || b.createdAt || 0).getTime();
          break;
      }
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [filteredDeals, sortKey, sortDir]);

  const totalCount = sortedDeals.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedDeals = sortedDeals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalRevenue = sortedDeals.reduce((s, d) => s + (d.revenue || 0), 0);
  const wonCount = sortedDeals.filter((d) => d.status === "WON").length;
  const totalActiveNarrows = statusNarrow.length + channelNarrow.length + verkoperNarrow.length + phaseNarrow.length;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "revenue" || key === "date" ? "desc" : "asc");
    }
  };

  const handleExport = () => {
    exportCSV(
      `deals_${filter.title.toLowerCase().replace(/\s+/g, "_")}`,
      ["Klant", "Email", "Telefoon", "Titel", "Kanaal", "Type werken", "Verkoper", "Fase", "Status", "Bedrag", "Aangemaakt", "Won op"],
      sortedDeals.map((d) => [
        d.contact?.name || "",
        d.contact?.email || "",
        d.contact?.phone || "",
        d.title || "",
        d.herkomst || "",
        d.typeWerken || "",
        d.verantwoordelijke || "",
        d.phase || "",
        d.status,
        d.revenue || 0,
        d.dealCreatedAt ? new Date(d.dealCreatedAt).toLocaleDateString("nl-BE") : "",
        d.wonAt ? new Date(d.wonAt).toLocaleDateString("nl-BE") : "",
      ])
    );
  };

  const clearAllNarrows = () => {
    setStatusNarrow([]); setChannelNarrow([]); setVerkoperNarrow([]); setPhaseNarrow([]);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-border/60 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border/40 px-6 py-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground truncate">{filter.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span><span className="font-semibold text-foreground">{totalCount}</span> deals</span>
                <span>·</span>
                <span><span className="font-semibold text-foreground">{wonCount}</span> won</span>
                <span>·</span>
                <span>Omzet: <span className="font-semibold text-foreground">{formatCurrency(totalRevenue)}</span></span>
                {filter.subtitle && <><span>·</span><span>{filter.subtitle}</span></>}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors flex-shrink-0">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Toolbar */}
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
              <button
                onClick={clearAllNarrows}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                Wis kolomfilters ({totalActiveNarrows})
              </button>
            )}
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-white px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>

          {/* Table */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : pagedDeals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-sm text-muted-foreground">Geen deals gevonden</div>
                <div className="mt-1 text-xs text-muted-foreground/70">Pas je zoekterm of filters aan</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-border/40 z-10">
                  <tr className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <SortHeader label="Klant" active={sortKey === "name"} dir={sortDir} onClick={() => handleSort("name")} className="px-6 py-2.5" />
                    <SortHeader label="Titel" active={sortKey === "title"} dir={sortDir} onClick={() => handleSort("title")} className="py-2.5" />
                    <FilterHeader
                      label="Kanaal" tooltip="Kanaal"
                      sortActive={sortKey === "herkomst"} sortDir={sortDir} onSort={() => handleSort("herkomst")}
                      options={distinctChannels} selected={channelNarrow} onChange={setChannelNarrow}
                      className="py-2.5"
                    />
                    <FilterHeader
                      label="Verkoper" tooltip="Verantwoordelijke"
                      sortActive={sortKey === "verantwoordelijke"} sortDir={sortDir} onSort={() => handleSort("verantwoordelijke")}
                      options={distinctVerkopers} selected={verkoperNarrow} onChange={setVerkoperNarrow}
                      className="py-2.5"
                    />
                    <FilterHeader
                      label="Fase" tooltip="Fase"
                      sortActive={sortKey === "phase"} sortDir={sortDir} onSort={() => handleSort("phase")}
                      options={distinctPhases} selected={phaseNarrow} onChange={setPhaseNarrow}
                      className="py-2.5"
                    />
                    <FilterHeader
                      label="Status" tooltip="Status"
                      sortActive={sortKey === "status"} sortDir={sortDir} onSort={() => handleSort("status")}
                      options={distinctStatuses} selected={statusNarrow} onChange={setStatusNarrow}
                      colorMap={STATUS_BG}
                      className="py-2.5"
                    />
                    <SortHeader label="Bedrag" active={sortKey === "revenue"} dir={sortDir} onClick={() => handleSort("revenue")} className="py-2.5 text-right" align="right" />
                    <SortHeader label="Datum" active={sortKey === "date"} dir={sortDir} onClick={() => handleSort("date")} className="px-6 py-2.5 text-right" align="right" />
                  </tr>
                </thead>
                <tbody>
                  {pagedDeals.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setOpenDealId(d.id)}
                      className="border-b border-border/20 hover:bg-primary/5 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-2.5 font-medium text-foreground">{d.contact?.name || "—"}</td>
                      <td className="py-2.5 text-muted-foreground max-w-[180px] truncate" title={d.title || ""}>{d.title || "—"}</td>
                      <td className="py-2.5 text-muted-foreground">{d.herkomst || "—"}</td>
                      <td className="py-2.5 text-muted-foreground">{d.verantwoordelijke || "—"}</td>
                      <td className="py-2.5 text-muted-foreground max-w-[140px] truncate" title={d.phase || ""}>{d.phase || "—"}</td>
                      <td className="py-2.5">
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", STATUS_BG[d.status] || "bg-muted text-muted-foreground border-border")}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{d.revenue ? formatCurrency(d.revenue) : "—"}</td>
                      <td className="px-6 py-2.5 text-right text-muted-foreground tabular-nums">
                        {d.wonAt ? new Date(d.wonAt).toLocaleDateString("nl-BE") :
                          d.dealCreatedAt ? new Date(d.dealCreatedAt).toLocaleDateString("nl-BE") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/40 px-6 py-3 text-xs text-muted-foreground">
              <div>
                Tonen <span className="font-semibold text-foreground">{(page - 1) * PAGE_SIZE + 1}</span>–<span className="font-semibold text-foreground">{Math.min(page * PAGE_SIZE, totalCount)}</span> van <span className="font-semibold text-foreground">{totalCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-border/60 bg-white p-1.5 disabled:opacity-40 hover:bg-muted/30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-semibold text-foreground">{page}</span>
                <span>/</span>
                <span>{totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-border/60 bg-white p-1.5 disabled:opacity-40 hover:bg-muted/30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
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
  align?: "left" | "right";
}

function SortHeader({ label, tooltip, active, dir, onClick, className, align = "left" }: SortHeaderProps) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          active && "text-foreground"
        )}
      >
        {tooltip ? <InfoTooltip code={tooltip}>{label}</InfoTooltip> : label}
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
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const Icon = !sortActive ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const filteredOptions = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <th className={className}>
      <div ref={wrapRef} className="relative inline-flex items-center gap-1">
        <button
          onClick={onSort}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground transition-colors",
            sortActive && "text-foreground"
          )}
        >
          {tooltip ? <InfoTooltip code={tooltip}>{label}</InfoTooltip> : label}
          <Icon className="h-3 w-3 opacity-60" />
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex items-center justify-center rounded p-0.5 hover:bg-muted/40 transition-colors",
            selected.length > 0 && "text-primary"
          )}
          title={selected.length > 0 ? `${selected.length} actief` : "Filter"}
        >
          <FilterIcon className="h-3 w-3" />
          {selected.length > 0 && (
            <span className="ml-0.5 text-[9px] font-bold tabular-nums">{selected.length}</span>
          )}
        </button>

        {open && (
          <div
            className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-border/60 bg-white p-2 shadow-2xl normal-case tracking-normal"
            onClick={(e) => e.stopPropagation()}
          >
            {options.length > 8 && (
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek..."
                  className="w-full rounded-md border border-border/60 bg-white pl-7 pr-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">Geen waarden</div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggle(opt)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-normal text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <span className={cn(
                        "flex h-3.5 w-3.5 items-center justify-center rounded border flex-shrink-0",
                        isSelected ? "border-primary bg-primary text-white" : "border-border bg-white"
                      )}>
                        {isSelected && <Check className="h-2.5 w-2.5" />}
                      </span>
                      {colorMap && colorMap[opt] ? (
                        <span className={cn("inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase", colorMap[opt])}>
                          {opt}
                        </span>
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
                <button
                  onClick={() => onChange([])}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Wis ({selected.length})
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary/90"
                >
                  Sluit
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </th>
  );
}
