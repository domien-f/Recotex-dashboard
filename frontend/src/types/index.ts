export type Role = "ADMIN" | "MANAGER" | "VIEWER";
export type DealStatus = "NEW" | "QUALIFIED" | "APPOINTMENT" | "WON" | "LOST";
export type AppointmentOutcome = "PENDING" | "WON" | "LOST" | "CANCELLED";
export type CostType = "AD_SPEND" | "INVOICE" | "MANUAL";
export type InvoiceStatus = "PENDING" | "PARSED" | "CONFIRMED" | "ERROR";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Contact {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  street?: string;
  postcode?: string;
  city?: string;
}

export interface Deal {
  id: string;
  contactId: string;
  title?: string;
  phase?: string;
  status: DealStatus;
  herkomst?: string;
  typeWerken?: string;
  reclamatieRedenen: string[];
  verantwoordelijke?: string;
  revenue?: number;
  probability: number;
  wonAt?: string;
  dealCreatedAt?: string;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
  appointments?: Appointment[];
}

export interface Appointment {
  id: string;
  dealId: string;
  date: string;
  scheduledAt?: string;
  cost?: number;
  outcome: AppointmentOutcome;
  channel?: string;
  notes?: string;
  responsibleUserId?: string;
  responsibleUserName?: string;
  cancelledAt?: string;
  completedAt?: string;
  source?: string;
  deal?: Deal & { contact?: Contact };
}

export interface BezettingRow {
  verantwoordelijke: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  ingepland: number;
  doorgegaan: number;
  geannuleerd: number;
  pending: number;
  won: number;
  futurePending: number;
  target: number | null;
  bezettingsgraad: number | null;
  doorgangsRatio: number | null;     // doorgegaan / (doorgegaan + geannuleerd) × 100
  annulatieRatio: number | null;     // geannuleerd / (doorgegaan + geannuleerd) × 100
}

export interface BezettingResponse {
  rows: BezettingRow[];
  weekTotals: Array<{
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    ingepland: number;
    doorgegaan: number;
    geannuleerd: number;
    pending: number;
    won: number;
    futurePending: number;
  }>;
  targets: Record<string, number>;
  summary: {
    totalIngepland: number;
    totalDoorgegaan: number;
    totalGeannuleerd: number;
    doorgangsRatio: number | null;
    annulatieRatio: number | null;
  };
}

export interface AppointmentTargetRow {
  verantwoordelijke: string;
  weeklyTarget: number | null;
  teamleaderUserId: string | null;
  effectiveFrom: string | null;
  targetId: string | null;
}

export interface Cost {
  id: string;
  channel: string;
  amount: number;
  date: string;
  type: CostType;
  description?: string;
  isEstimated: boolean;
  invoice?: { filename: string; vendor: string };
}

export interface Invoice {
  id: string;
  filename: string;
  filePath: string;
  parsedData?: any;
  totalAmount?: number;
  vendor?: string;
  date?: string;
  status: InvoiceStatus;
  createdAt: string;
  uploader?: { name: string };
}

export interface MetricsOverview {
  totalDeals: number;
  uniqueContacts: number;
  wonDeals: number;
  winRateGlobal: string;
  totalRevenue: number;
  totalCost: number;
  netResult: number;
  costVsRevenuePercent: string;
  returnMarketingCost: string;
  cpl: string;
  kpa: string;
  coa: string;
  roi: string;
  avgRevenuePerDeal: string;
  totalAppointments: number;
  wonAppointments: number;
  appointmentWinRate: string;
  hasEstimatedCosts: boolean;
}

export interface ChannelMetrics {
  channel: string;
  deals: number;
  won: number;
  lost: number;
  winRate: string;
  cost: number;
  revenue: number;
  cpl: string;
  kpa: string;
  coa: string;
  roi: string;
  appointments: number;
  avgRevenuePerDeal: string;
  costMonths: number;
  totalMonths: number;
  costComplete: boolean;
  missingMonths: string[];
  invoiceCoverage: { from: string; to: string; gaps: string[] }[];
}

export interface KpiTarget {
  id: string;
  category: string;
  metric: string;
  targetValue: number;
  channel?: string;
  period: string;
  creator?: { name: string };
}
