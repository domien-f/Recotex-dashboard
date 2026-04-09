import { create } from "zustand";
import { persist } from "zustand/middleware";

type DateMode = "creation" | "won";

interface FilterState {
  dateFrom: string;
  dateTo: string;
  dateMode: DateMode;
  activePreset: string | null;
  channels: string[];
  statuses: string[];
  typeWerken: string[];
  verantwoordelijken: string[];
  setDateRange: (from: string, to: string, preset?: string) => void;
  setDateMode: (mode: DateMode) => void;
  toggleChannel: (channel: string) => void;
  toggleStatus: (status: string) => void;
  toggleTypeWerken: (tw: string) => void;
  toggleVerantwoordelijke: (v: string) => void;
  setChannels: (channels: string[]) => void;
  setStatuses: (statuses: string[]) => void;
  setTypeWerkenAll: (tw: string[]) => void;
  setVerantwoordelijken: (v: string[]) => void;
  resetFilters: () => void;
}

const now = new Date();
const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      dateFrom: firstOfMonth,
      dateTo: today,
      dateMode: "creation" as DateMode,
      activePreset: "Deze maand",
      channels: [],
      statuses: [],
      typeWerken: [],
      verantwoordelijken: [],

      setDateRange: (dateFrom, dateTo, preset) => set({ dateFrom, dateTo, activePreset: preset || null }),
      setDateMode: (dateMode) => set({ dateMode }),
      toggleChannel: (channel) => set({ channels: toggle(get().channels, channel) }),
      toggleStatus: (status) => set({ statuses: toggle(get().statuses, status) }),
      toggleTypeWerken: (tw) => set({ typeWerken: toggle(get().typeWerken, tw) }),
      toggleVerantwoordelijke: (v) => set({ verantwoordelijken: toggle(get().verantwoordelijken, v) }),
      setChannels: (channels) => set({ channels }),
      setStatuses: (statuses) => set({ statuses }),
      setTypeWerkenAll: (typeWerken) => set({ typeWerken }),
      setVerantwoordelijken: (verantwoordelijken) => set({ verantwoordelijken }),
      resetFilters: () => set({ dateFrom: firstOfMonth, dateTo: today, dateMode: "creation" as DateMode, activePreset: "Deze maand", channels: [], statuses: [], typeWerken: [], verantwoordelijken: [] }),
    }),
    {
      name: "recotex-filters",
      version: 3,
      migrate: () => ({
        dateFrom: firstOfMonth,
        dateTo: today,
        dateMode: "creation",
        channels: [],
        statuses: [],
        typeWerken: [],
        verantwoordelijken: [],
      }),
    }
  )
);
