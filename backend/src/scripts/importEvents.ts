import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TL_API_URL = "https://api.focus.teamleader.eu";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tlFetch(token: string, endpoint: string, body: any = {}): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${TL_API_URL}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = Math.pow(2, attempt + 1) * 1000;
      console.log(`  Rate limited, waiting ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`API error (${endpoint}): ${res.status} ${await res.text()}`);
    await sleep(150);
    return res.json();
  }
  throw new Error(`Rate limit exceeded on ${endpoint}`);
}

// Determine if an event is a real appointment and its outcome
function classifyEvent(title: string | null): { isAppointment: boolean; outcome: "PENDING" | "CANCELLED" } {
  if (!title || title.trim() === "") return { isAppointment: false, outcome: "PENDING" };

  const lower = title.toLowerCase();

  // Not appointments — skip these only
  if (lower.includes("opvolg") && !lower.includes("annul")) return { isAppointment: false, outcome: "PENDING" };
  if (lower.includes("vervolg") && !lower.includes("vervolg afspraak") && !lower.includes("annul")) return { isAppointment: false, outcome: "PENDING" };

  // Everything else is an appointment
  return { isAppointment: true, outcome: "PENDING" };
}

async function main() {
  const cred = await prisma.integrationCredential.findUnique({ where: { platform: "teamleader" } });
  if (!cred) throw new Error("Teamleader not connected");

  const token = cred.accessToken;
  let page = 1;
  let synced = 0;
  let cancelled = 0;
  let skipped = 0;

  console.log("Fetching events from Teamleader...");

  while (true) {
    const res = await tlFetch(token, "events.list", {
      filter: { starts_after: "2025-09-01T00:00:00+00:00", activity_type_id: "93eb57c8-96e3-0883-bb1f-0eff9277bc80" },
      page: { size: 100, number: page },
    });

    const events = res.data || [];
    if (events.length === 0) break;

    if (page % 25 === 0) console.log(`Page ${page}: synced=${synced} cancelled=${cancelled} skipped=${skipped}`);

    for (const event of events) {
      const dealLink = (event.links || []).find((l: any) => l.type === "deal");
      if (!dealLink) { skipped++; continue; }

      const deal = await prisma.deal.findUnique({
        where: { teamleaderId: dealLink.id },
        select: { id: true, herkomst: true, dealCreatedAt: true },
      });
      if (!deal) { skipped++; continue; }

      const { isAppointment, outcome } = classifyEvent(event.title);
      if (!isAppointment) { skipped++; continue; }

      try {
        // Manual edits in the dashboard win over Teamleader bulk pulls
        const existing = await prisma.appointment.findUnique({
          where: { teamleaderId: event.id },
          select: { id: true, source: true },
        });
        if (existing?.source === "manual") {
          // Hands off — only refresh sync timestamp
          await prisma.appointment.update({ where: { id: existing.id }, data: { lastSyncedAt: new Date() } });
        } else {
          await prisma.appointment.upsert({
            where: { teamleaderId: event.id },
            create: {
              teamleaderId: event.id,
              dealId: deal.id,
              date: new Date(event.starts_at),
              scheduledAt: deal.dealCreatedAt || null,
              channel: deal.herkomst || null,
              notes: event.title || null,
              outcome,
              source: "webhook", // came from TL API → treat as authoritative like a webhook
              lastSyncedAt: new Date(),
            },
            update: {
              date: new Date(event.starts_at),
              scheduledAt: deal.dealCreatedAt || null,
              channel: deal.herkomst || null,
              notes: event.title || null,
              outcome,
              source: "webhook",
              lastSyncedAt: new Date(),
            },
          });
        }
        if (outcome === "CANCELLED") cancelled++;
        synced++;
      } catch (e: any) {
        console.error(`  Event ${event.id}: ${e.message}`);
      }
    }

    if (events.length < 100) break;
    page++;
  }

  console.log(`\nDone:`);
  console.log(`  Total appointments: ${synced}`);
  console.log(`  - Cancelled: ${cancelled}`);
  console.log(`  - Active: ${synced - cancelled}`);
  console.log(`  Skipped: ${skipped}`);

  // Monthly breakdown - by starts_at (doorgaat)
  const byDate = await prisma.$queryRaw`
    SELECT to_char(date, 'YYYY-MM') as month,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE outcome = 'CANCELLED') as cancelled,
      COUNT(*) FILTER (WHERE outcome != 'CANCELLED') as active
    FROM appointments GROUP BY 1 ORDER BY 1
  ` as any[];

  console.log("\nPer maand (doorgaat op):");
  for (const m of byDate) {
    console.log(`  ${m.month}: ${m.active} actief + ${m.cancelled} geannuleerd = ${m.total}`);
  }

  // Monthly breakdown - by scheduledAt (gepland in)
  const byScheduled = await prisma.$queryRaw`
    SELECT to_char(COALESCE(scheduled_at, date), 'YYYY-MM') as month,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE outcome = 'CANCELLED') as cancelled,
      COUNT(*) FILTER (WHERE outcome != 'CANCELLED') as active
    FROM appointments GROUP BY 1 ORDER BY 1
  ` as any[];

  console.log("\nPer maand (gepland in):");
  for (const m of byScheduled) {
    console.log(`  ${m.month}: ${m.active} actief + ${m.cancelled} geannuleerd = ${m.total}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Import failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
