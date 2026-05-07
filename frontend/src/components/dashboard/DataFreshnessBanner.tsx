import { useQuery } from "@tanstack/react-query";
import { CheckCircle, AlertTriangle, XCircle, FileSpreadsheet, Webhook, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Banner that summarises how up-to-date the dashboard's data is.
//
// Three signals combined:
//   1. Last successful Excel import — the bulk baseline
//   2. Most recent Teamleader webhook event received — real-time delta
//   3. Whether webhooks are registered with TL at all
//
// Status:
//   green  — webhooks active AND last event < 24h
//   amber  — webhooks active but no recent event, OR Excel never imported
//   red    — webhooks not registered (or TL not connected)
// ─────────────────────────────────────────────────────────────────────────────

interface SyncLog {
  id: string;
  source: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  recordsSynced: number;
  error: string | null;
}

interface RegisteredWebhook { url: string; types: string[] }

interface WebhookEvent {
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
  eventType: string;
}

interface PlatformStatus {
  platform: string;
  connected: boolean;
}

function timeSince(iso: string | null | undefined): string {
  if (!iso) return "nooit";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "zonet";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min geleden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} uur geleden`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} dag${days !== 1 ? "en" : ""} geleden`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} ${weeks === 1 ? "week" : "weken"} geleden`;
  return new Date(iso).toLocaleDateString("nl-BE");
}

export function DataFreshnessBanner() {
  const { data: syncLogs } = useQuery<SyncLog[]>({
    queryKey: ["sync-status"],
    queryFn: async () => (await api.get("/sync/status")).data,
    refetchInterval: 60_000,
  });

  const { data: status } = useQuery<PlatformStatus[]>({
    queryKey: ["integrations", "status"],
    queryFn: async () => (await api.get("/integrations/status")).data,
  });
  const tlConnected = status?.find((p) => p.platform === "teamleader")?.connected || false;

  const { data: webhooks } = useQuery<RegisteredWebhook[]>({
    queryKey: ["tl", "webhooks"],
    queryFn: async () => {
      try { return (await api.get("/integrations/teamleader/webhooks")).data; }
      catch { return []; }
    },
    enabled: tlConnected,
  });

  const { data: events } = useQuery<WebhookEvent[]>({
    queryKey: ["tl", "webhook-events", "freshness"],
    queryFn: async () => {
      try { return (await api.get("/integrations/teamleader/webhook-events?limit=1")).data; }
      catch { return []; }
    },
    refetchInterval: 30_000,
  });

  // Last Excel import
  const lastExcel = (syncLogs || [])
    .filter((l) => l.source.includes("excel") && l.status === "SUCCESS")
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

  // Last webhook event received
  const lastEvent = events?.[0];
  const lastEventAt = lastEvent?.receivedAt;
  const lastEventMs = lastEventAt ? Date.now() - new Date(lastEventAt).getTime() : Infinity;

  // Subscription health
  const expectedTypes = [
    "meeting.created", "meeting.updated", "meeting.deleted",
    "deal.created", "deal.updated", "deal.won", "deal.lost", "deal.deleted",
  ];
  const registeredTypes = new Set((webhooks || []).flatMap((w) => w.types));
  const missingTypes = expectedTypes.filter((t) => !registeredTypes.has(t));
  const fullyRegistered = tlConnected && missingTypes.length === 0;

  // Determine status
  let level: "green" | "amber" | "red";
  let headline: string;
  let subline: string;

  if (!tlConnected) {
    level = "red";
    headline = "Teamleader niet verbonden";
    subline = "Real-time updates zijn uit. Verbind eerst Teamleader op Settings → Integraties.";
  } else if (!fullyRegistered) {
    level = "red";
    headline = `${missingTypes.length} van ${expectedTypes.length} webhook-events niet geregistreerd`;
    subline = `Real-time updates ontbreken voor: ${missingTypes.join(", ")}. Registreer op Settings → Webhooks.`;
  } else if (lastEventMs > 24 * 3600_000) {
    level = "amber";
    headline = "Webhooks actief, maar geen recente events";
    subline = lastEventAt
      ? `Laatste event: ${timeSince(lastEventAt)}. Mogelijk is er gewoon geen activiteit, of er is een verbindingsprobleem.`
      : "Nog geen webhook events ontvangen sinds de registratie. Maak een test-event in Teamleader om te verifiëren.";
  } else {
    level = "green";
    headline = "Live — data wordt automatisch bijgewerkt";
    subline = `Laatste webhook event: ${timeSince(lastEventAt)}. Excel-imports zijn alleen nog nodig voor historische correcties.`;
  }

  const tone = {
    green: { wrap: "border-emerald-200 bg-emerald-50", icon: <CheckCircle className="h-5 w-5 text-emerald-600" />, text: "text-emerald-900", sub: "text-emerald-800" },
    amber: { wrap: "border-amber-200 bg-amber-50", icon: <AlertTriangle className="h-5 w-5 text-amber-600" />, text: "text-amber-900", sub: "text-amber-800" },
    red: { wrap: "border-red-200 bg-red-50", icon: <XCircle className="h-5 w-5 text-red-600" />, text: "text-red-900", sub: "text-red-800" },
  }[level];

  return (
    <div className={cn("rounded-2xl border px-5 py-4", tone.wrap)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{tone.icon}</div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", tone.text)}>{headline}</p>
          <p className={cn("mt-0.5 text-xs", tone.sub)}>{subline}</p>

          {/* Detail row — three signals at a glance */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <DetailCell
              icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
              label="Laatste Excel import"
              value={lastExcel ? timeSince(lastExcel.startedAt) : "nooit"}
              detail={lastExcel ? `${lastExcel.recordsSynced} records · ${lastExcel.source.replace("excel-import-", "")}` : "nog geen import gedaan"}
            />
            <DetailCell
              icon={<Webhook className="h-3.5 w-3.5" />}
              label="Webhook subscriptions"
              value={tlConnected ? `${registeredTypes.size}/${expectedTypes.length}` : "niet verbonden"}
              detail={
                !tlConnected
                  ? "TL niet gekoppeld"
                  : fullyRegistered
                    ? "alle event types actief"
                    : `mist: ${missingTypes.length} type${missingTypes.length !== 1 ? "s" : ""}`
              }
            />
            <DetailCell
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Laatste webhook event"
              value={lastEventAt ? timeSince(lastEventAt) : "geen"}
              detail={lastEvent ? lastEvent.eventType : "wachten op TL activiteit"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailCell({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-white/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">{value}</div>
      {detail && <div className="text-[10px] text-muted-foreground truncate">{detail}</div>}
    </div>
  );
}
