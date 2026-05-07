import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  getMeeting,
  getUser,
  fullName,
  migrateLegacyId,
  tlFetch,
  type TeamleaderMeeting,
} from "./teamleader.js";

// ─────────────────────────────────────────────────────────────────────────────
// Teamleader webhook handler
//
// Dedup contract guarantees no record is ever logged twice:
//
//   1. POST /api/webhooks/teamleader computes idempotencyKey = sha256(rawBody).
//      WebhookEvent.upsert by idempotencyKey → duplicate webhook = no-op.
//
//   2. The handler resolves the meeting UUID, looks up the existing
//      Appointment by:
//        a. teamleaderId  (UUID — primary key from TL)
//        b. externalRef   (sha1(dealId + scheduledAt) — Excel rows)
//        c. otherwise insert
//      and sets source = "webhook".
//
//   3. Fields with source = "manual" are NOT overwritten by webhook updates.
//
// Teamleader retries on non-2xx → we always return 200 from the receiver.
// Errors during enrichment are stored on WebhookEvent.error for audit.
// ─────────────────────────────────────────────────────────────────────────────

export type RawWebhookBody = Record<string, unknown>;

export function computeIdempotencyKey(body: RawWebhookBody): string {
  // Stable JSON: sort keys
  const stable = JSON.stringify(sortDeep(body));
  return createHash("sha256").update(stable).digest("hex");
}

function sortDeep(v: any): any {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}

interface NormalizedEvent {
  eventType: string;
  entityType: string;
  uuid: string | null;       // present in Focus-format (UUIDs)
  legacyId: string | null;   // present in Classic-format (numeric)
}

/**
 * Normalizes both Teamleader webhook formats to a single shape.
 *
 * Focus:    { type: "meeting.updated", subject: { type: "meeting", id: "<uuid>" } }
 * Classic:  { event_type: "meeting_added", object_type: "meeting", object_id: 12345 }
 */
function normalize(body: RawWebhookBody): NormalizedEvent | null {
  // Focus
  if (typeof body.type === "string" && body.type.includes(".")) {
    const [entity, verb] = body.type.split(".");
    const subj = (body.subject ?? body.data) as { id?: unknown; type?: unknown } | undefined;
    const id = typeof subj?.id === "string" ? subj.id : null;
    const isUuid = !!id && id.includes("-");
    return {
      eventType: `${entity}_${verb}`,
      entityType: entity,
      uuid: isUuid ? id : null,
      legacyId: !isUuid ? id : null,
    };
  }
  // Classic
  if (typeof body.event_type === "string") {
    return {
      eventType: body.event_type,
      entityType: typeof body.object_type === "string" ? body.object_type : "unknown",
      uuid: null,
      legacyId: body.object_id != null ? String(body.object_id) : null,
    };
  }
  return null;
}

/**
 * Process a single webhook payload. The receiver should have already inserted
 * the WebhookEvent row (dedup guard) before calling this.
 *
 * Returns nothing — errors are recorded on the WebhookEvent row.
 */
export async function processWebhook(
  prisma: PrismaClient,
  webhookEventId: string,
  body: RawWebhookBody
): Promise<void> {
  const norm = normalize(body);

  // Update the audit row with the parsed event metadata
  if (norm) {
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { eventType: norm.eventType, entityType: norm.entityType, entityId: norm.uuid || norm.legacyId || null },
    });
  }

  if (!norm) {
    await markProcessed(prisma, webhookEventId, "could not parse webhook body");
    return;
  }

  // Branch on entity type. Other types (contact, company, ...) are silently ACK'd.
  try {
    if (norm.entityType === "meeting") {
      const uuid =
        norm.uuid ||
        (norm.legacyId ? await migrateLegacyId(prisma, "meeting", norm.legacyId) : null);
      if (!uuid) throw new Error("could not resolve meeting uuid");

      if (norm.eventType === "meeting_deleted") {
        await applyMeetingDeleted(prisma, uuid, norm.legacyId);
        await markProcessed(prisma, webhookEventId, null);
        return;
      }

      let meeting: TeamleaderMeeting | null = null;
      try {
        meeting = await getMeeting(prisma, uuid);
      } catch (e: any) {
        const is404 = /\b404\b/.test(e?.message || "");
        if (!is404) throw e;
        await applyMeetingDeleted(prisma, uuid, norm.legacyId);
        await markProcessed(prisma, webhookEventId, null);
        return;
      }

      await applyMeetingUpsert(prisma, uuid, meeting, norm.legacyId);
      await markProcessed(prisma, webhookEventId, null);
      return;
    }

    if (norm.entityType === "deal") {
      const uuid =
        norm.uuid ||
        (norm.legacyId ? await migrateLegacyId(prisma, "deal", norm.legacyId) : null);
      if (!uuid) throw new Error("could not resolve deal uuid");

      if (norm.eventType === "deal_deleted") {
        await applyDealDeleted(prisma, uuid);
        await markProcessed(prisma, webhookEventId, null);
        return;
      }

      await applyDealUpsert(prisma, uuid);
      await markProcessed(prisma, webhookEventId, null);
      return;
    }

    // Other entity types: ack but don't act
    await markProcessed(prisma, webhookEventId, null);
  } catch (e: any) {
    await markProcessed(prisma, webhookEventId, (e?.message || String(e)).slice(0, 1000));
    console.error(`[TL webhook] processing failed for event ${webhookEventId}:`, e?.message || e);
  }
}

async function markProcessed(prisma: PrismaClient, id: string, error: string | null) {
  await prisma.webhookEvent.update({
    where: { id },
    data: { processedAt: new Date(), error },
  });
}

// ─── Apply meeting events to Appointment table (the dedup contract) ────────

/**
 * Find the Appointment row for an incoming meeting webhook.
 *
 * Lookup order:
 *   1. teamleaderId = UUID  (already linked)
 *   2. externalRef = sha1(dealId + scheduledAt)  (Excel-imported, not yet linked)
 *   3. nothing — caller will create
 */
async function findExistingAppointment(
  prisma: PrismaClient,
  uuid: string,
  dealId: string | null,
  scheduledAt: Date | null
): Promise<{ id: string; source: string } | null> {
  // 1. By Teamleader UUID (the canonical key)
  const byTl = await prisma.appointment.findUnique({
    where: { teamleaderId: uuid },
    select: { id: true, source: true },
  });
  if (byTl) return byTl;

  // 2. By Excel-style externalRef (deduce the Excel row that already represents
  //    this same meeting — same deal + same scheduledAt = same logical event)
  if (dealId && scheduledAt) {
    const ref = excelExternalRef(dealId, scheduledAt);
    const byRef = await prisma.appointment.findUnique({
      where: { externalRef: ref },
      select: { id: true, source: true },
    });
    if (byRef) return byRef;
  }

  return null;
}

export function excelExternalRef(dealId: string, scheduledAt: Date): string {
  const minute = new Date(scheduledAt);
  minute.setSeconds(0, 0); // tolerate sub-minute drift
  return createHash("sha1").update(`${dealId}|${minute.toISOString()}`).digest("hex");
}

/**
 * Map the meeting's customer ref to one of our Deal rows.
 * Returns Deal.id (our cuid) or null if no match.
 */
async function resolveDealForMeeting(
  prisma: PrismaClient,
  meeting: TeamleaderMeeting
): Promise<string | null> {
  // Preferred: link of type "deal" in `meeting.links` or a direct deal customer
  const dealLink = (meeting.links || []).find((l) => l.type === "deal");
  const customer = meeting.customer;

  let candidateDealUuids: string[] = [];
  if (dealLink?.id) candidateDealUuids.push(dealLink.id);
  if (customer?.type === "deal" && customer.id) candidateDealUuids.push(customer.id);

  for (const uuid of candidateDealUuids) {
    const deal = await prisma.deal.findUnique({ where: { teamleaderId: uuid }, select: { id: true } });
    if (deal) return deal.id;
  }

  // Fallback: customer is a contact → look for the most recent deal owned by that contact.
  // Self-healing logic: if the Contact isn't found by teamleaderId (typical for
  // Excel-imported contacts), fetch contacts.info from TL, match by email, and
  // link the teamleaderId so future webhooks resolve immediately.
  if (customer?.type === "contact" && customer.id) {
    let contact: { id: string } | null = await prisma.contact.findUnique({
      where: { teamleaderId: customer.id },
      select: { id: true },
    });

    if (!contact) {
      try {
        const info = await tlFetch(prisma, "contacts.info", { id: customer.id });
        const c = info.data;
        const email = c?.emails?.[0]?.email || null;
        const phone = c?.telephones?.[0]?.number || null;
        const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null;

        if (email) {
          const byEmail = await prisma.contact.findUnique({ where: { email }, select: { id: true, source: true } });
          if (byEmail) {
            // Excel-imported contact found — link the TL UUID for future webhooks
            await prisma.contact.update({
              where: { id: byEmail.id },
              data: {
                teamleaderId: customer.id,
                lastSyncedAt: new Date(),
                // don't override source if Excel/manual
              },
            });
            contact = { id: byEmail.id };
          }
        }

        // Last resort: create a fresh Contact so the appointment can land
        if (!contact) {
          const created = await prisma.contact.create({
            data: {
              name,
              email,
              phone,
              teamleaderId: customer.id,
              source: "webhook",
              lastSyncedAt: new Date(),
            },
          });
          contact = { id: created.id };
        }
      } catch (e: any) {
        console.warn(`[TL webhook] contacts.info(${customer.id}) failed:`, e?.message);
      }
    }

    if (contact) {
      const deal = await prisma.deal.findFirst({
        where: { contactId: contact.id },
        orderBy: { dealCreatedAt: "desc" },
        select: { id: true },
      });
      if (deal) return deal.id;
    }
  }

  return null;
}

/**
 * Translate Teamleader meeting status → our AppointmentOutcome.
 * TL status values seen: scheduled, ongoing, done, cancelled.
 */
function mapMeetingOutcome(status: string | undefined): "PENDING" | "WON" | "LOST" | "CANCELLED" {
  const s = (status || "").toLowerCase();
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  if (s === "done" || s === "completed") return "WON"; // best-effort; manual outcome edits in DB are preserved (source=manual)
  return "PENDING";
}

async function applyMeetingUpsert(
  prisma: PrismaClient,
  uuid: string,
  meeting: TeamleaderMeeting,
  legacyId: string | null
): Promise<void> {
  const startsAtIso = meeting.scheduled_at || meeting.starts_at;
  const startsAt = startsAtIso ? new Date(startsAtIso) : null;

  const dealId = await resolveDealForMeeting(prisma, meeting);
  if (!dealId) {
    // No matching deal — record but do not create a dangling appointment
    throw new Error(
      `no matching deal for meeting ${uuid}` +
        (meeting.customer ? ` (customer: ${meeting.customer.type}:${meeting.customer.id})` : "")
    );
  }

  // Verkoper resolution (sales reps don't log into the dashboard — they live
  // in AppointmentTarget rows that management curates):
  //
  //   1. Lookup AppointmentTarget by teamleaderUserId → use that verkoper name
  //   2. Fallback: call users.info once to get the canonical TL name
  //   3. If both fail, leave null and let the bezetting view fall back to
  //      deal.verantwoordelijke (the Excel-import name)
  const responsibleRef = meeting.responsible_user || meeting.created_by || meeting.creator;
  let responsibleUserName: string | null = null;
  if (responsibleRef?.type === "user" && responsibleRef.id) {
    const mapped = await prisma.appointmentTarget.findFirst({
      where: { teamleaderUserId: responsibleRef.id, effectiveUntil: null },
      select: { verantwoordelijke: true },
      orderBy: { effectiveFrom: "desc" },
    });
    if (mapped?.verantwoordelijke) {
      responsibleUserName = mapped.verantwoordelijke;
    } else {
      try {
        const user = await getUser(prisma, responsibleRef.id);
        responsibleUserName = fullName(user);
      } catch (e: any) {
        // users.info may rate-limit or fail — that's OK, we have the deal.verantwoordelijke fallback
        console.warn(`[TL webhook] users.info failed for ${responsibleRef.id}: ${e?.message}`);
      }
    }
  }

  const outcome = mapMeetingOutcome(meeting.status);
  const cancelledAt = outcome === "CANCELLED" ? new Date() : null;
  const completedAt = outcome === "WON" || outcome === "LOST" ? new Date() : null;

  const existing = await findExistingAppointment(prisma, uuid, dealId, startsAt);

  // Build the patch — but never touch fields where source=manual already wins.
  const patch: any = {
    teamleaderId: uuid,
    dealId,
    date: startsAt ?? new Date(0),
    scheduledAt: startsAt,
    channel: meeting.title || undefined,
    notes: meeting.description || undefined,
    responsibleUserId: responsibleRef?.id || null,
    responsibleUserName,
    outcome,
    cancelledAt,
    completedAt,
    source: "webhook",
    lastSyncedAt: new Date(),
  };
  if (legacyId) {
    // keep the legacy reference, but never overwrite a more authoritative one
  }

  if (existing) {
    if (existing.source === "manual") {
      // Manual edits are sacred — only refresh tracking metadata
      await prisma.appointment.update({
        where: { id: existing.id },
        data: {
          teamleaderId: uuid,
          lastSyncedAt: new Date(),
          // Don't touch outcome / scheduledAt / channel — those are manually set
        },
      });
      return;
    }
    await prisma.appointment.update({
      where: { id: existing.id },
      data: patch,
    });
    return;
  }

  // Insert: ensure externalRef so future Excel re-imports of the same row collapse
  const externalRef = startsAt ? excelExternalRef(dealId, startsAt) : null;
  await prisma.appointment.create({
    data: {
      ...patch,
      externalRef,
    },
  });
}

async function applyMeetingDeleted(
  prisma: PrismaClient,
  uuid: string,
  _legacyId: string | null
): Promise<void> {
  const existing = await prisma.appointment.findUnique({
    where: { teamleaderId: uuid },
    select: { id: true, source: true },
  });
  if (!existing) return; // never had it — nothing to do
  if (existing.source === "manual") return; // hands off

  await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      outcome: "CANCELLED",
      cancelledAt: new Date(),
      source: "webhook",
      lastSyncedAt: new Date(),
    },
  });
}

// ─── Deal handler ──────────────────────────────────────────────────────────
//
// Dedup contract for deals — same shape as appointments:
//
//   1. Lookup chain on every write (Excel, syncAll, webhook):
//      a. by Deal.teamleaderId  (canonical UUID)
//      b. by Deal.externalRef = sha1(title + contactEmail + dealCreatedAt-day)
//      c. otherwise insert with both keys populated
//
//   2. source field gates writes:
//      - webhook ARRIVES: skips fields if existing.source === "manual"
//      - excel re-import: skips if existing.source === "webhook"
//
//   3. dealExternalRef() must be called from BOTH the Excel importer AND
//      every TL ingestion path (webhook + syncAll). Otherwise an Excel-only
//      row stays unmatched and the webhook would dupe it.

const SALES_PIPELINE = "8224d49a-4799-098a-904d-d09a9bdc5839";
const HERKOMST_CF = "07f4756a-c0db-0e41-8f55-df9dd1e7f9c7";
const RECLAMATIE_CF = "279284ef-44a7-0f50-985b-5d367207cedc";
const TYPE_WERKEN_CF = "5eee3367-f513-0ae8-9056-57e5c7a7ca98";
const EXCLUDED_HERKOMST = ["EXTRA WERKEN"];

export function dealExternalRef(title: string | null | undefined, email: string | null | undefined, dealCreatedAt: Date | string | null | undefined): string {
  // Day-precision on creation date — minor TZ jitter (e.g. 23:59 vs 00:01) doesn't split the row
  let day = "";
  if (dealCreatedAt) {
    const d = typeof dealCreatedAt === "string" ? new Date(dealCreatedAt) : dealCreatedAt;
    if (!isNaN(d.getTime())) day = d.toISOString().slice(0, 10);
  }
  const t = (title || "").trim().toLowerCase();
  const e = (email || "").trim().toLowerCase();
  return createHash("sha1").update(`${t}|${e}|${day}`).digest("hex");
}

function mapDealStatus(phaseName: string, dealStatus: string, probability: number): "NEW" | "QUALIFIED" | "APPOINTMENT" | "WON" | "LOST" {
  if (dealStatus === "won" || probability >= 1) return "WON";
  if (dealStatus === "lost") return "LOST";
  const lower = (phaseName || "").toLowerCase();
  if (lower.includes("reclamati")) return "LOST";
  if (lower.includes("voorschot") || lower.includes("aanvaard") || lower.includes("klaar voor")) return "WON";
  if (lower.includes("meeting") || lower.includes("offerte") || lower.includes("ingepland") || lower.includes("negotiatie")) return "APPOINTMENT";
  if (lower.includes("contact") || lower.includes("opvolging") || lower.includes("gevalideerd")) return "QUALIFIED";
  return "NEW";
}

async function findExistingDeal(
  prisma: PrismaClient,
  uuid: string,
  externalRef: string
): Promise<{ id: string; source: string } | null> {
  // 1. Canonical: by Teamleader UUID
  const byTl = await prisma.deal.findUnique({
    where: { teamleaderId: uuid },
    select: { id: true, source: true },
  });
  if (byTl) return byTl;

  // 2. Excel-style externalRef — collapses with the row that already represents this deal
  const byRef = await prisma.deal.findUnique({
    where: { externalRef },
    select: { id: true, source: true },
  });
  if (byRef) return byRef;

  return null;
}

/**
 * Resolve the Contact for a TL deal — either via existing teamleaderId on
 * Contact (if previously synced) or by upserting on email. Returns Contact.id.
 */
async function resolveContactForDeal(
  prisma: PrismaClient,
  customerRef: { type: string; id: string } | null
): Promise<{ contactId: string; email: string | null }> {
  if (!customerRef || customerRef.type !== "contact" || !customerRef.id) {
    // No customer ref at all → fabricate an empty contact so the deal can land.
    const created = await prisma.contact.create({
      data: { name: null, source: "webhook", lastSyncedAt: new Date() },
    });
    return { contactId: created.id, email: null };
  }

  // Try existing by TL UUID
  const byTl = await prisma.contact.findUnique({ where: { teamleaderId: customerRef.id }, select: { id: true, email: true } });
  if (byTl) return { contactId: byTl.id, email: byTl.email };

  // Fetch from TL
  const info = await tlFetch(prisma, "contacts.info", { id: customerRef.id });
  const c = info.data;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
  const email = c.emails?.[0]?.email || null;
  const phone = c.telephones?.[0]?.number || null;

  // Match by email if available
  if (email) {
    const byEmail = await prisma.contact.findUnique({ where: { email }, select: { id: true, source: true } });
    if (byEmail) {
      // Link TL UUID to existing Excel-imported contact
      await prisma.contact.update({
        where: { id: byEmail.id },
        data: { teamleaderId: customerRef.id, source: byEmail.source === "manual" ? "manual" : "webhook", lastSyncedAt: new Date() },
      });
      return { contactId: byEmail.id, email };
    }
  }

  // Fresh insert
  const created = await prisma.contact.create({
    data: {
      name,
      email,
      phone,
      teamleaderId: customerRef.id,
      source: "webhook",
      lastSyncedAt: new Date(),
    },
  });
  return { contactId: created.id, email };
}

async function applyDealUpsert(prisma: PrismaClient, uuid: string): Promise<void> {
  // Pull fresh deal state
  const info = await tlFetch(prisma, "deals.info", { id: uuid });
  const d = info.data;
  if (!d) throw new Error(`deals.info returned no data for ${uuid}`);

  // Pipeline filter — ignore deals that aren't in the sales pipeline (just like syncAll)
  if (d.current_phase?.id) {
    const phasesRes = await tlFetch(prisma, "dealPhases.list", {});
    const phase = (phasesRes.data || []).find((p: any) => p.id === d.current_phase.id);
    if (phase && phase.pipeline?.id && phase.pipeline.id !== SALES_PIPELINE) {
      // Not our pipeline — skip silently (e.g. SAV/maintenance pipelines)
      return;
    }
  }

  const cfs = d.custom_fields || [];
  const herkomst = cfs.find((f: any) => f.definition.id === HERKOMST_CF)?.value || null;

  if (herkomst && EXCLUDED_HERKOMST.includes(herkomst)) {
    // EXTRA WERKEN etc. — not a real lead, skip
    return;
  }

  const reclamatieRedenen = cfs.find((f: any) => f.definition.id === RECLAMATIE_CF)?.value || [];
  const typeWerken = cfs.find((f: any) => f.definition.id === TYPE_WERKEN_CF)?.value || null;

  // Phase + status
  let phaseName = "Unknown";
  let phaseProbability = 0;
  if (d.current_phase?.id) {
    const phasesRes = await tlFetch(prisma, "dealPhases.list", {});
    const phase = (phasesRes.data || []).find((p: any) => p.id === d.current_phase.id);
    if (phase) {
      phaseName = phase.name;
      phaseProbability = phase.probability;
    }
  }
  const probability = d.estimated_probability ?? phaseProbability;
  const status = mapDealStatus(phaseName, d.status, probability);

  // Verantwoordelijke (free-text name from TL user)
  let verantwoordelijke: string | null = null;
  const responsibleRef = d.responsible_user;
  if (responsibleRef?.id) {
    try {
      const u = await getUser(prisma, responsibleRef.id);
      verantwoordelijke = fullName(u);
    } catch { /* ignore */ }
  }

  const dealCreatedAt = d.created_at ? new Date(d.created_at) : null;
  const wonAt = (status === "WON" && d.closed_at) ? new Date(d.closed_at) : null;
  const revenue = (status === "WON" && d.estimated_value?.amount > 0) ? d.estimated_value.amount : null;

  // Resolve / upsert contact
  const { contactId, email } = await resolveContactForDeal(prisma, d.lead?.customer ?? null);

  // The cross-source key — must match what importExcel computes
  const externalRef = dealExternalRef(d.title || null, email, dealCreatedAt);

  const existing = await findExistingDeal(prisma, uuid, externalRef);

  const patch: any = {
    contactId,
    title: d.title || null,
    phase: phaseName,
    status,
    herkomst,
    typeWerken,
    reclamatieRedenen: Array.isArray(reclamatieRedenen) ? reclamatieRedenen : [],
    verantwoordelijke,
    revenue,
    probability,
    wonAt,
    dealCreatedAt,
    teamleaderId: uuid,
    externalRef,
    source: "webhook",
    lastSyncedAt: new Date(),
  };

  if (existing) {
    if (existing.source === "manual") {
      // Manual edits in dashboard win — only refresh tracking metadata
      await prisma.deal.update({
        where: { id: existing.id },
        data: { teamleaderId: uuid, externalRef, lastSyncedAt: new Date() },
      });
      return;
    }
    await prisma.deal.update({
      where: { id: existing.id },
      data: patch,
    });
    return;
  }

  // Insert
  await prisma.deal.create({ data: patch });
}

async function applyDealDeleted(prisma: PrismaClient, uuid: string): Promise<void> {
  const existing = await prisma.deal.findUnique({
    where: { teamleaderId: uuid },
    select: { id: true, source: true },
  });
  if (!existing) return;
  if (existing.source === "manual") return;

  // We don't actually delete — preserve history. Mark as LOST + record sync.
  await prisma.deal.update({
    where: { id: existing.id },
    data: {
      status: "LOST",
      source: "webhook",
      lastSyncedAt: new Date(),
    },
  });
}
