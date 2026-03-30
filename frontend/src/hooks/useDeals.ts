import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useFilterStore } from "../store/filterStore";
import type { Deal } from "../types";

function useFilters() {
  const { dateFrom, dateTo, channel, status, typeWerken, verantwoordelijke } = useFilterStore();
  const params: Record<string, string> = { dateFrom, dateTo };
  if (channel) params.herkomst = channel;
  if (status) params.status = status;
  if (typeWerken) params.typeWerken = typeWerken;
  if (verantwoordelijke) params.verantwoordelijke = verantwoordelijke;
  const key = [dateFrom, dateTo, channel, status, typeWerken, verantwoordelijke];
  return { params, key };
}

export interface ReclamationStats {
  totalDeals: number;
  totalReclamations: number;
  reclamationRate: string;
  byCategory: { reason: string; count: number }[];
  byChannel: {
    channel: string;
    reclamations: number;
    totalDeals: number;
    reclamationRate: string;
    breakdown: { reason: string; count: number }[];
  }[];
  trend: { month: string; count: number; total: number; percentage: number }[];
}

export function useReclamationStats() {
  const { params, key } = useFilters();
  return useQuery<ReclamationStats>({
    queryKey: ["metrics", "reclamations", ...key],
    queryFn: async () => (await api.get("/metrics/reclamations", { params })).data,
  });
}

export function useReclamationDeals(search: string, page: number) {
  const { params, key } = useFilters();
  return useQuery<{ deals: Deal[]; total: number }>({
    queryKey: ["deals", "reclamation", ...key, search, page],
    queryFn: async () => (await api.get("/deals", { params: { ...params, search, page, limit: 25, reclamation: "true" } })).data,
  });
}

export function useWonDeals(search: string, page: number) {
  const { params, key } = useFilters();
  return useQuery<{ deals: Deal[]; total: number }>({
    queryKey: ["deals", "won", ...key, search, page],
    queryFn: async () => (await api.get("/deals", { params: { ...params, search, page, limit: 25, status: "WON" } })).data,
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Deal> }) => (await api.patch(`/deals/${id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });
}
