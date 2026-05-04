import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { useFilterStore } from "../store/filterStore";
import type { MetricsOverview, ChannelMetrics } from "../types";

function useFilters() {
  const { dateFrom, dateTo, dateMode, channels, statuses, typeWerken, verantwoordelijken } = useFilterStore();
  const params: Record<string, string> = { dateFrom, dateTo, dateMode };
  if (channels.length) params.herkomst = channels.join(",");
  if (statuses.length) params.status = statuses.join(",");
  if (typeWerken.length) params.typeWerken = typeWerken.join(",");
  if (verantwoordelijken.length) params.verantwoordelijke = verantwoordelijken.join(",");
  const key = [dateFrom, dateTo, dateMode, channels.join(","), statuses.join(","), typeWerken.join(","), verantwoordelijken.join(",")];
  return { params, key };
}

export function useMetricsOverview() {
  const { params, key } = useFilters();
  return useQuery<MetricsOverview>({
    queryKey: ["metrics", "overview", ...key],
    queryFn: async () => (await api.get("/metrics/overview", { params })).data,
  });
}

export function useChannelMetrics() {
  const { params, key } = useFilters();
  return useQuery<ChannelMetrics[]>({
    queryKey: ["metrics", "channels", ...key],
    queryFn: async () => (await api.get("/metrics/channels", { params })).data,
  });
}

export function useCostVsRevenue() {
  const { params, key } = useFilters();
  return useQuery({
    queryKey: ["metrics", "cost-vs-revenue", ...key],
    queryFn: async () => (await api.get("/metrics/cost-vs-revenue", { params })).data,
  });
}

export function useLeadSources() {
  const { params, key } = useFilters();
  return useQuery({
    queryKey: ["metrics", "lead-sources", ...key],
    queryFn: async () => (await api.get("/metrics/lead-sources", { params })).data,
  });
}

export interface SalesFunnelPerson {
  verantwoordelijke: string;
  leads: number;
  afspraken: number;
  totalAppointments: number;
  cancelledAppointments: number;
  offersSent: number;
  afsprakenWithOffer: number;
  won: number;
  lost: number;
  revenue: number;
  avgDealValue: number;
  revenuePerAppointment: number;
  revenuePerOffer: number;
  offerToWon: number;
  afspraakToOffer: number;
  cancellationRate: number;
  leadToAfspraak: number;
  afspraakToWon: number;
  leadToWon: number;
  avgCycleDays: number;
  avgSpeedToAfspraakDays: number;
  topChannel: { name: string; count: number } | null;
}

export interface SalesFunnelData {
  perPerson: SalesFunnelPerson[];
  totals: SalesFunnelPerson;
}

export function useSalesFunnel() {
  const { params, key } = useFilters();
  return useQuery<SalesFunnelData>({
    queryKey: ["metrics", "sales-funnel", ...key],
    queryFn: async () => (await api.get("/metrics/sales-funnel", { params })).data,
  });
}
