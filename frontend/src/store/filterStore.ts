import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FilterState {
  dateFrom: string;
  dateTo: string;
  channel: string;
  status: string;
  typeWerken: string;
  verantwoordelijke: string;
  setDateRange: (from: string, to: string) => void;
  setChannel: (channel: string) => void;
  setStatus: (status: string) => void;
  setTypeWerken: (tw: string) => void;
  setVerantwoordelijke: (v: string) => void;
  resetFilters: () => void;
}

const now = new Date();
const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      dateFrom: firstOfMonth,
      dateTo: today,
      channel: "",
      status: "",
      typeWerken: "",
      verantwoordelijke: "",

      setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo }),
      setChannel: (channel) => set({ channel }),
      setStatus: (status) => set({ status }),
      setTypeWerken: (typeWerken) => set({ typeWerken }),
      setVerantwoordelijke: (verantwoordelijke) => set({ verantwoordelijke }),
      resetFilters: () => set({ dateFrom: firstOfMonth, dateTo: today, channel: "", status: "", typeWerken: "", verantwoordelijke: "" }),
    }),
    {
      name: "recotex-filters",
    }
  )
);
