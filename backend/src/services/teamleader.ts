import { PrismaClient } from "@prisma/client";

const TL_AUTH_URL = "https://focus.teamleader.eu/oauth2/authorize";
const TL_TOKEN_URL = "https://focus.teamleader.eu/oauth2/access_token";
const TL_API = "https://api.focus.teamleader.eu";
const SALES_PIPELINE = "8224d49a-4799-098a-904d-d09a9bdc5839";
const HERKOMST_CF = "07f4756a-c0db-0e41-8f55-df9dd1e7f9c7";
const MEETING_TYPE_ID = "93eb57c8-96e3-0883-bb1f-0eff9277bc80";
const RECLAMATIE_CF = "279284ef-44a7-0f50-985b-5d367207cedc";
const TYPE_WERKEN_CF = "5eee3367-f513-0ae8-9056-57e5c7a7ca98";

const CLIENT_ID = process.env.TEAMLEADER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.TEAMLEADER_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.TEAMLEADER_REDIRECT_URI || "http://localhost:3001/api/integrations/teamleader/callback";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── OAuth2 ───

export function getAuthUrl(): string {
  const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI });
  return `${TL_AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(TL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

// ─── Token management ───

async function getToken(prisma: PrismaClient): Promise<string> {
  const cred = await prisma.integrationCredential.findUnique({ where: { platform: "teamleader" } });
  if (!cred) throw new Error("Teamleader not connected");

  if (cred.expiresAt && cred.expiresAt.getTime() - 5 * 60 * 1000 < Date.now()) {
    if (!cred.refreshToken) throw new Error("No refresh token");
    const res = await fetch(TL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: cred.refreshToken, grant_type: "refresh_token" }),
    });
    if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
    const tokens = await res.json() as any;
    await prisma.integrationCredential.update({
      where: { platform: "teamleader" },
      data: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000) },
    });
    return tokens.access_token;
  }
  return cred.accessToken;
}

async function tlFetch(prisma: PrismaClient, endpoint: string, body: any = {}): Promise<any> {
  let token = await getToken(prisma);
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${TL_API}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429) {
      const waitTime = Math.min(Math.pow(2, attempt + 1) * 2000, 120000);
      console.log(`[TL] Rate limited on ${endpoint}, waiting ${waitTime / 1000}s (attempt ${attempt + 1}/10)...`);
      await sleep(waitTime);
      continue;
    }
    if (res.status === 401 && attempt === 0) {
      // Token expired mid-request, force refresh
      console.log(`[TL] Token expired on ${endpoint}, refreshing...`);
      const cred = await prisma.integrationCredential.findUnique({ where: { platform: "teamleader" } });
      if (cred?.refreshToken) {
        try {
          const refreshRes = await fetch(TL_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: cred.refreshToken, grant_type: "refresh_token" }),
          });
          if (refreshRes.ok) {
            const tokens = await refreshRes.json() as any;
            await prisma.integrationCredential.update({
              where: { platform: "teamleader" },
              data: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000) },
            });
            token = tokens.access_token;
            continue;
          }
        } catch {}
      }
      throw new Error("Teamleader token expired and refresh failed. Reconnect via Settings.");
    }
    if (!res.ok) throw new Error(`TL API error (${endpoint}): ${res.status} ${await res.text()}`);
    await sleep(150);
    return res.json();
  }
  throw new Error(`Rate limit exceeded on ${endpoint} after 10 retries`);
}

// ─── Status mapping ───

function mapStatus(phaseName: string, dealStatus: string, probability: number): "NEW" | "QUALIFIED" | "APPOINTMENT" | "WON" | "LOST" {
  if (dealStatus === "won" || probability >= 1) return "WON";
  if (dealStatus === "lost") return "LOST";
  const lower = phaseName.toLowerCase();
  if (lower.includes("reclamati")) return "LOST";
  if (lower.includes("voorschot") || lower.includes("aanvaard") || lower.includes("klaar voor")) return "WON";
  if (lower.includes("meeting") || lower.includes("offerte") || lower.includes("ingepland") || lower.includes("negotiatie") || lower.includes("technisch gevalideerd") || lower.includes("technisch geblokkeerd")) return "APPOINTMENT";
  if (lower.includes("contact") || lower.includes("opvolging") || lower.includes("gevalideerd")) return "QUALIFIED";
  return "NEW";
}

function extractName(title: string): string {
  const parts = title.split(" - ");
  return parts.length >= 2 ? parts[0].replace(/^\d+[\/.]\s*\d*[\/.]*\s*/, "").trim() : title;
}

// ─── Sync ───

export async function syncAll(prisma: PrismaClient) {
  const startTime = Date.now();
  console.log("[TL] Starting full sync...");

  // Get latest deal date in our DB for incremental sync
  const latest = await prisma.deal.aggregate({ _max: { dealCreatedAt: true } });
  const sinceRaw = latest._max.dealCreatedAt
    ? new Date(latest._max.dealCreatedAt.getTime() - 24 * 60 * 60 * 1000)
    : new Date("2025-09-01");
  const sinceDate = sinceRaw.toISOString().replace(".000Z", "+00:00");

  console.log(`[TL] Fetching deals since ${sinceDate}`);

  // Load phases
  const phasesRes = await tlFetch(prisma, "dealPhases.list", {});
  const phases: Record<string, { name: string; probability: number }> = {};
  for (const p of phasesRes.data || []) phases[p.id] = { name: p.name, probability: p.probability };
  console.log(`[TL] Loaded ${Object.keys(phases).length} deal phases`);

  // ── Step 1: Fetch ALL deal IDs first (lightweight, only list calls) ──
  const allDeals: any[] = [];
  let page = 1;

  while (true) {
    console.log(`[TL] Fetching deal list page ${page}...`);
    const res = await tlFetch(prisma, "deals.list", {
      filter: { created_after: sinceDate, pipeline_id: SALES_PIPELINE },
      page: { size: 100, number: page },
    });

    const deals = res.data || [];
    if (deals.length === 0) break;
    allDeals.push(...deals);
    console.log(`[TL] Got ${deals.length} deals on page ${page} (total so far: ${allDeals.length})`);

    if (deals.length < 100) break;
    page++;
    await sleep(500);
  }

  console.log(`[TL] Total deals to process: ${allDeals.length}`);

  // ── Step 2: Process each deal one by one with proper pacing ──
  let synced = 0;
  let errors = 0;

  for (let i = 0; i < allDeals.length; i++) {
    const deal = allDeals[i];
    try {
      // Fetch deal details
      const info = await tlFetch(prisma, "deals.info", { id: deal.id });
      const d = info.data;
      const cfs = d.custom_fields || [];

      const herkomst = cfs.find((f: any) => f.definition.id === HERKOMST_CF)?.value || null;
      const reclamatieRedenen = cfs.find((f: any) => f.definition.id === RECLAMATIE_CF)?.value || [];
      const typeWerken = cfs.find((f: any) => f.definition.id === TYPE_WERKEN_CF)?.value || null;

      const phase = phases[d.current_phase?.id] || { name: "Unknown", probability: 0 };
      const status = mapStatus(phase.name, d.status, d.estimated_probability ?? phase.probability);
      const revenue = d.estimated_value?.amount || 0;
      const name = extractName(d.title || "");

      // Fetch contact info
      let contactEmail: string | null = null;
      let contactPhone: string | null = null;
      let contactName: string | null = null;
      const contactId = d.lead?.customer?.type === "contact" ? d.lead?.customer?.id : null;

      if (contactId) {
        try {
          const contact = await tlFetch(prisma, "contacts.info", { id: contactId });
          const c = contact.data;
          contactName = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
          contactEmail = c.emails?.[0]?.email || null;
          contactPhone = c.telephones?.[0]?.number || null;
        } catch (e: any) {
          console.warn(`[TL] Failed to fetch contact ${contactId}: ${e.message}`);
        }
      }

      // Upsert contact
      let dbContactId: string;
      if (contactEmail) {
        const existing = await prisma.contact.findUnique({ where: { email: contactEmail } });
        if (existing) {
          dbContactId = existing.id;
          await prisma.contact.update({ where: { id: existing.id }, data: { phone: contactPhone || undefined, name: contactName || undefined } });
        } else {
          const created = await prisma.contact.create({ data: { email: contactEmail, phone: contactPhone, name: contactName || name } });
          dbContactId = created.id;
        }
      } else {
        const created = await prisma.contact.create({ data: { name: contactName || name, phone: contactPhone } });
        dbContactId = created.id;
      }

      // Upsert deal
      const dealData = {
        contactId: dbContactId,
        title: d.title || name,
        phase: phase.name,
        status,
        herkomst,
        typeWerken,
        reclamatieRedenen: Array.isArray(reclamatieRedenen) ? reclamatieRedenen : [],
        verantwoordelijke: null as string | null,
        revenue: status === "WON" && revenue > 0 ? revenue : null,
        probability: d.estimated_probability ?? phase.probability,
        wonAt: status === "WON" && d.closed_at ? new Date(d.closed_at) : null,
        dealCreatedAt: new Date(d.created_at),
      };

      const existing = await prisma.deal.findUnique({ where: { teamleaderId: deal.id } });
      if (existing) {
        await prisma.deal.update({ where: { teamleaderId: deal.id }, data: dealData });
      } else {
        await prisma.deal.create({ data: { ...dealData, teamleaderId: deal.id } });
      }

      synced++;

      // Log progress every 25 deals
      if (synced % 25 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`[TL] Progress: ${synced}/${allDeals.length} deals synced (${errors} errors, ${elapsed}s elapsed)`);
      }

      // Pace: ~2 API calls per deal + 600ms pause = ~40 calls/min (well under 100/min limit)
      await sleep(600);

    } catch (e: any) {
      errors++;
      console.error(`[TL] Error syncing deal ${deal.id} (${i + 1}/${allDeals.length}): ${e.message}`);
      // Don't stop on individual errors, keep going
      await sleep(2000); // Extra pause after error
    }
  }

  console.log(`[TL] Deals done: ${synced} synced, ${errors} errors`);

  // ── Step 3: Sync events/appointments ──
  console.log("[TL] Syncing events...");
  let eventsSynced = 0;
  let eventsPage = 1;

  while (true) {
    const res = await tlFetch(prisma, "events.list", {
      filter: { starts_after: sinceDate, activity_type_id: MEETING_TYPE_ID },
      page: { size: 100, number: eventsPage },
    });

    const events = res.data || [];
    if (events.length === 0) break;
    console.log(`[TL] Events page ${eventsPage}: ${events.length} events`);

    for (const event of events) {
      const dealLink = (event.links || []).find((l: any) => l.type === "deal");
      if (!dealLink) continue;

      const deal = await prisma.deal.findUnique({ where: { teamleaderId: dealLink.id }, select: { id: true, herkomst: true, dealCreatedAt: true } });
      if (!deal) continue;

      try {
        await prisma.appointment.upsert({
          where: { teamleaderId: event.id },
          create: { teamleaderId: event.id, dealId: deal.id, date: new Date(event.starts_at), scheduledAt: deal.dealCreatedAt, channel: deal.herkomst, notes: event.title },
          update: { date: new Date(event.starts_at), scheduledAt: deal.dealCreatedAt, channel: deal.herkomst, notes: event.title },
        });
        eventsSynced++;
      } catch (e: any) {
        console.warn(`[TL] Failed to upsert appointment ${event.id}: ${e.message}`);
      }
    }

    if (events.length < 100) break;
    eventsPage++;
    await sleep(500);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[TL] ✓ Sync complete in ${elapsed}s: ${synced} deals, ${eventsSynced} events, ${errors} errors`);
  return { synced, events: eventsSynced, errors };
}
