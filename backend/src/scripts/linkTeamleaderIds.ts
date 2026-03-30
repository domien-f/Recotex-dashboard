import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TL_API_URL = "https://api.focus.teamleader.eu";
const SALES_PIPELINE = "8224d49a-4799-098a-904d-d09a9bdc5839";

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
    await sleep(100);
    return res.json();
  }
  throw new Error(`Rate limit exceeded on ${endpoint}`);
}

async function main() {
  const cred = await prisma.integrationCredential.findUnique({ where: { platform: "teamleader" } });
  if (!cred) throw new Error("Teamleader not connected");
  const token = cred.accessToken;

  // Load all our deals into a lookup by title (trimmed, lowercased)
  console.log("Loading deals from DB...");
  const dbDeals = await prisma.deal.findMany({
    where: { teamleaderId: null },
    select: { id: true, title: true, dealCreatedAt: true },
  });
  console.log(`${dbDeals.length} deals without teamleaderId`);

  // Build lookup: title -> id (use first match)
  const titleMap = new Map<string, string>();
  for (const d of dbDeals) {
    if (d.title) {
      const key = d.title.trim().toLowerCase();
      if (!titleMap.has(key)) titleMap.set(key, d.id);
    }
  }
  console.log(`${titleMap.size} unique titles in DB`);

  let linked = 0;
  let page = 1;

  while (true) {
    const res = await tlFetch(token, "deals.list", {
      filter: { created_after: "2025-09-01T00:00:00+00:00", pipeline_id: SALES_PIPELINE },
      page: { size: 100, number: page },
    });

    const deals = res.data || [];
    if (deals.length === 0) break;

    if (page % 10 === 0) console.log(`Page ${page}: linked ${linked} so far`);

    for (const deal of deals) {
      const key = (deal.title || "").trim().toLowerCase();
      const dbId = titleMap.get(key);
      if (dbId) {
        await prisma.deal.update({
          where: { id: dbId },
          data: { teamleaderId: deal.id },
        });
        titleMap.delete(key); // remove to avoid duplicate matches
        linked++;
      }
    }

    if (deals.length < 100) break;
    page++;
  }

  console.log(`\nDone: ${linked} deals linked with Teamleader IDs`);
  const remaining = await prisma.deal.count({ where: { teamleaderId: null } });
  console.log(`${remaining} deals still without teamleaderId`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
