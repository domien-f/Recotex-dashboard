import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useFilterStore } from "@/store/filterStore";
import { Button } from "@/components/ui/button";
import { LogOut, CalendarRange, ChevronLeft, ChevronRight, ChevronDown, Filter, X } from "lucide-react";
import api from "@/lib/api";

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESETS = [
  { label: "Deze maand", get: () => { const n = new Date(); return { from: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`, to: toLocalDateStr(n) }; } },
  { label: "Vorige maand", get: () => { const n = new Date(); const p = new Date(n.getFullYear(), n.getMonth() - 1, 1); const e = new Date(n.getFullYear(), n.getMonth(), 0); return { from: toLocalDateStr(p), to: toLocalDateStr(e) }; } },
  { label: "Dit kwartaal", get: () => { const n = new Date(); const q = Math.floor(n.getMonth() / 3) * 3; return { from: `${n.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`, to: toLocalDateStr(n) }; } },
  { label: "Dit jaar", get: () => { const n = new Date(); return { from: `${n.getFullYear()}-01-01`, to: toLocalDateStr(n) }; } },
  { label: "Alles", get: () => ({ from: "2025-09-01", to: toLocalDateStr(new Date()) }) },
];

function formatMonth(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("nl-BE", { month: "short", year: "numeric" });
}

function FilterSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-7 rounded-lg border border-border/60 bg-white pl-2 pr-6 text-[11px] appearance-none cursor-pointer transition-colors ${value ? "text-foreground font-medium border-primary/40" : "text-muted-foreground"}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {value && (
        <button onClick={(e) => { e.stopPropagation(); onChange(""); }} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted">
          <X className="h-2.5 w-2.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export function Header() {
  const { user, logout } = useAuthStore();
  const { dateFrom, dateTo, channel, status, typeWerken, verantwoordelijke, setDateRange, setChannel, setStatus, setTypeWerken, setVerantwoordelijke, resetFilters } = useFilterStore();
  const [showFilters, setShowFilters] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const { data: filterOptions } = useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => (await api.get("/deals/filter-options")).data as {
      channels: string[];
      statuses: string[];
      typeWerken: string[];
      verantwoordelijken: string[];
    },
    staleTime: 60000,
  });

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    logout();
  };

  // Navigate: shift the entire range by 1 month
  const shiftMonth = (dir: number) => {
    const from = new Date(dateFrom + "T12:00:00");
    const to = new Date(dateTo + "T12:00:00");
    from.setMonth(from.getMonth() + dir);
    to.setMonth(to.getMonth() + dir);
    const newFrom = new Date(from.getFullYear(), from.getMonth(), 1);
    const newTo = new Date(to.getFullYear(), to.getMonth() + 1, 0);
    setDateRange(toLocalDateStr(newFrom), toLocalDateStr(newTo));
  };

  // Click on label = select just that 1 month (reset to single month)
  const selectSingleMonth = () => {
    const from = new Date(dateFrom + "T12:00:00");
    const start = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    setDateRange(toLocalDateStr(start), toLocalDateStr(end));
  };

  const fromDate = new Date(dateFrom + "T12:00:00");
  const toDate = new Date(dateTo + "T12:00:00");
  const sameMonth = fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear();
  const rangeLabel = sameMonth ? formatMonth(dateFrom) : `${formatMonth(dateFrom)} — ${formatMonth(dateTo)}`;

  const activeFilterCount = [channel, status, typeWerken, verantwoordelijke].filter(Boolean).length;

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-white/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-8">
        {/* Left: Date + filters */}
        <div className="flex items-center gap-3">
          {/* Month picker */}
          <div className="relative">
            <button
              onClick={() => { setShowMonthPicker(!showMonthPicker); setPickingEnd(false); setPickerYear(new Date(dateFrom + "T12:00:00").getFullYear()); }}
              className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-1.5 shadow-sm hover:border-primary/40 transition-colors"
            >
              <CalendarRange className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">{rangeLabel}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>

            {showMonthPicker && (
              <div className="absolute left-0 top-full mt-2 z-50 rounded-lg border border-border/60 bg-white p-4 shadow-xl min-w-[320px]">
                {(() => {
                  const months = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
                  const fromMonth = new Date(dateFrom + "T12:00:00").getMonth();
                  const fromYear = new Date(dateFrom + "T12:00:00").getFullYear();
                  const toMonth = new Date(dateTo + "T12:00:00").getMonth();
                  const toYear = new Date(dateTo + "T12:00:00").getFullYear();

                  const handleMonthClick = (monthIdx: number) => {
                    const year = pickerYear;
                    const start = new Date(year, monthIdx, 1);
                    const end = new Date(year, monthIdx + 1, 0);

                    if (!pickingEnd) {
                      // First click = select single month and close
                      setDateRange(toLocalDateStr(start), toLocalDateStr(end));
                      setShowMonthPicker(false);
                      setPickingEnd(false);
                    } else {
                      // Range mode: picking end month
                      const startDate = new Date(dateFrom + "T12:00:00");
                      if (end < startDate) {
                        setDateRange(toLocalDateStr(start), toLocalDateStr(new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)));
                      } else {
                        setDateRange(dateFrom, toLocalDateStr(end));
                      }
                      setPickingEnd(false);
                      setShowMonthPicker(false);
                    }
                  };

                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <button onClick={(e) => { e.stopPropagation(); setPickerYear(pickerYear - 1); }} className="p-1 hover:bg-muted rounded"><ChevronLeft className="h-4 w-4" /></button>
                        <span className="text-sm font-semibold">{pickerYear}</span>
                        <button onClick={(e) => { e.stopPropagation(); setPickerYear(pickerYear + 1); }} className="p-1 hover:bg-muted rounded"><ChevronRight className="h-4 w-4" /></button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2">{pickingEnd ? "Selecteer eindmaand" : "Klik op een maand"}</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {months.map((m, i) => {
                          const isStart = i === fromMonth && pickerYear === fromYear;
                          const isEnd = i === toMonth && pickerYear === toYear;
                          const isInRange = (pickerYear > fromYear || (pickerYear === fromYear && i >= fromMonth)) &&
                                          (pickerYear < toYear || (pickerYear === toYear && i <= toMonth));
                          return (
                            <button
                              key={m}
                              onClick={() => handleMonthClick(i)}
                              className={`rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                                isStart || isEnd
                                  ? "bg-primary text-white"
                                  : isInRange
                                  ? "bg-primary/10 text-primary"
                                  : "text-foreground hover:bg-muted"
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                      {!pickingEnd ? (
                        <button onClick={() => setPickingEnd(true)} className="mt-3 w-full rounded-lg border border-border/60 py-1.5 text-center text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                          Periode selecteren (van → tot)
                        </button>
                      ) : (
                        <button onClick={() => { setPickingEnd(false); setShowMonthPicker(false); }} className="mt-3 w-full rounded-lg border border-primary/30 bg-primary/5 py-1.5 text-center text-[10px] font-medium text-primary">
                          Annuleren
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Presets */}
          <div className="flex items-center gap-1">
            {PRESETS.map((p) => {
              const { from, to } = p.get();
              const active = from === dateFrom && to === dateTo;
              return (
                <button key={p.label} onClick={() => setDateRange(from, to)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${active ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              showFilters || activeFilterCount > 0 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Filter className="h-3 w-3" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* Right: User */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-white px-3 py-1.5 shadow-sm transition-all hover:border-border hover:shadow-md">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-gradient-end text-[11px] font-bold text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-foreground">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground">{user?.role}</p>
            </div>
          </button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 w-8 rounded-xl p-0 text-muted-foreground hover:text-destructive">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-3 border-t border-border/40 bg-muted/20 px-8 py-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Filters:</span>
          <FilterSelect value={channel} onChange={setChannel} options={filterOptions?.channels || []} placeholder="Kanaal" />
          <FilterSelect value={status} onChange={setStatus} options={filterOptions?.statuses || []} placeholder="Status" />
          <FilterSelect value={typeWerken} onChange={setTypeWerken} options={filterOptions?.typeWerken || []} placeholder="Type werken" />
          <FilterSelect value={verantwoordelijke} onChange={setVerantwoordelijke} options={filterOptions?.verantwoordelijken || []} placeholder="Verantwoordelijke" />
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-[10px] text-destructive hover:underline">
              Alles wissen
            </button>
          )}
        </div>
      )}
    </header>
  );
}
