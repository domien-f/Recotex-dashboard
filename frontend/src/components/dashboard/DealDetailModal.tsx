import { useQuery } from "@tanstack/react-query";
import { X, Mail, Phone, MapPin, Calendar, Tag, User, Banknote, AlertTriangle, Clock, Package } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { Deal, Appointment, Contact } from "@/types";

interface DealDetailModalProps {
  dealId: string;
  onClose: () => void;
}

type FullDeal = Deal & { contact?: Contact; appointments?: Appointment[] };

const STATUS_BG: Record<string, string> = {
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
  APPOINTMENT: "bg-amber-100 text-amber-700",
  QUALIFIED: "bg-blue-100 text-blue-700",
  NEW: "bg-orange-100 text-orange-700",
};

const OUTCOME_BG: Record<string, string> = {
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  PENDING: "bg-amber-100 text-amber-700",
};

export function DealDetailModal({ dealId, onClose }: DealDetailModalProps) {
  const { data: deal, isLoading } = useQuery<FullDeal>({
    queryKey: ["deal", dealId],
    queryFn: async () => (await api.get(`/deals/${dealId}`)).data,
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border/60 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border/40 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground truncate">
                {deal?.contact?.name || deal?.title || "Deal"}
              </h3>
              {deal && (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BG[deal.status] || "bg-muted text-muted-foreground"}`}>
                  {deal.status}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">{deal?.title || "—"}</p>
          </div>
          <button onClick={onClose} className="ml-3 rounded-lg p-1.5 hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {isLoading || !deal ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Top stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={<Banknote className="h-3.5 w-3.5" />} label="Bedrag" value={deal.revenue ? formatCurrency(deal.revenue) : "—"} />
                <Stat icon={<Tag className="h-3.5 w-3.5" />} label="Kanaal" value={deal.herkomst || "—"} />
                <Stat icon={<Package className="h-3.5 w-3.5" />} label="Type werk" value={deal.typeWerken || "—"} />
                <Stat icon={<User className="h-3.5 w-3.5" />} label="Verkoper" value={deal.verantwoordelijke || "—"} />
              </div>

              {/* Contact */}
              {deal.contact && (
                <Section title="Contactgegevens">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                    {deal.contact.email && <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={<a href={`mailto:${deal.contact.email}`} className="text-primary hover:underline">{deal.contact.email}</a>} />}
                    {deal.contact.phone && <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefoon" value={<a href={`tel:${deal.contact.phone}`} className="text-primary hover:underline">{deal.contact.phone}</a>} />}
                    {(deal.contact.street || deal.contact.city) && (
                      <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Adres" value={
                        <span>{[deal.contact.street, [deal.contact.postcode, deal.contact.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</span>
                      } />
                    )}
                  </div>
                </Section>
              )}

              {/* Lifecycle */}
              <Section title="Tijdlijn">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Aangemaakt" value={fmtDate(deal.dealCreatedAt || deal.createdAt)} />
                  {deal.wonAt && <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Won op" value={fmtDate(deal.wonAt)} />}
                  <InfoRow icon={<Tag className="h-3.5 w-3.5" />} label="Fase" value={deal.phase || "—"} />
                  {deal.dealCreatedAt && deal.wonAt && (
                    <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Doorlooptijd" value={`${daysBetween(deal.dealCreatedAt, deal.wonAt)} dagen`} />
                  )}
                </div>
              </Section>

              {/* Appointments */}
              {deal.appointments && deal.appointments.length > 0 && (
                <Section title={`Afspraken (${deal.appointments.length})`}>
                  <div className="space-y-2">
                    {deal.appointments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{fmtDate(a.date)}</span>
                          {a.channel && <span className="text-xs text-muted-foreground truncate">· {a.channel}</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {a.cost !== undefined && a.cost !== null && (
                            <span className="text-xs text-muted-foreground tabular-nums">{formatCurrency(a.cost)}</span>
                          )}
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${OUTCOME_BG[a.outcome] || "bg-muted text-muted-foreground"}`}>
                            {a.outcome}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Reclamaties */}
              {deal.reclamatieRedenen && deal.reclamatieRedenen.length > 0 && (
                <Section title="Reclamaties">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        {deal.reclamatieRedenen.map((r, i) => (
                          <div key={i} className="text-sm text-amber-900">{r}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground truncate">{value}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-5 w-5 items-center justify-center text-muted-foreground flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-sm text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function fmtDate(d?: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-BE", { day: "2-digit", month: "short", year: "numeric" });
}

function daysBetween(a: string, b: string): number {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(diff / 86400000));
}
