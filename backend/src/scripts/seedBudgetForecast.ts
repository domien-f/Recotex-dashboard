import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Actieplan 2026 — only Lead Kanalen & Beurzen
const SEED_DATA: { c: string; s: string; m: string; a: number }[] = [{"c":"Beurzen","s":"","m":"2026-01","a":14591},{"c":"Beurzen","s":"","m":"2026-10","a":70000},{"c":"Beurzen","s":"BIS BEURS 2026","m":"2026-10","a":70000},{"c":"Beurzen","s":"Bouw en Reno","m":"2026-01","a":14591},{"c":"Lead Kanalen","s":"","m":"2026-01","a":76159},{"c":"Lead Kanalen","s":"","m":"2026-02","a":73369},{"c":"Lead Kanalen","s":"","m":"2026-03","a":96156},{"c":"Lead Kanalen","s":"","m":"2026-04","a":69341},{"c":"Lead Kanalen","s":"","m":"2026-05","a":70550},{"c":"Lead Kanalen","s":"","m":"2026-06","a":60550},{"c":"Lead Kanalen","s":"","m":"2026-07","a":30075},{"c":"Lead Kanalen","s":"","m":"2026-08","a":31075},{"c":"Lead Kanalen","s":"","m":"2026-09","a":60550},{"c":"Lead Kanalen","s":"","m":"2026-10","a":50550},{"c":"Lead Kanalen","s":"","m":"2026-11","a":54550},{"c":"Lead Kanalen","s":"","m":"2026-12","a":54550},{"c":"Lead Kanalen","s":"RedPepper PPA","m":"2026-01","a":7600},{"c":"Lead Kanalen","s":"RedPepper PPA","m":"2026-02","a":2400},{"c":"Lead Kanalen","s":"RedPepper PPA","m":"2026-03","a":1000},{"c":"Lead Kanalen","s":"Renocheck","m":"2026-01","a":8575},{"c":"Lead Kanalen","s":"Scopr","m":"2026-03","a":3800},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-01","a":4737},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-04","a":10000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-05","a":6000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-06","a":6000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-07","a":4000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-08","a":4000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-09","a":6000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-10","a":6000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-11","a":6000},{"c":"Lead Kanalen","s":"SEA (Google/Bing zoekcampagnes)","m":"2026-12","a":6000},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-01","a":240},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-02","a":780},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-03","a":1500},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-04","a":2400},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-05","a":2400},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-06","a":2400},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-07","a":1000},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-08","a":2000},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-09","a":2400},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-10","a":2400},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-11","a":2400},{"c":"Lead Kanalen","s":"Serieus Verbouwen","m":"2026-12","a":2400},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-01","a":4839},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-02","a":10384},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-03","a":13000},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-04","a":13000},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-05","a":19000},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-06","a":19000},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-07","a":8500},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-08","a":8500},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-09","a":19000},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-10","a":19000},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-11","a":19000},{"c":"Lead Kanalen","s":"Social Ads (Meta, Tiktok, Youtube)","m":"2026-12","a":19000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-01","a":50168},{"c":"Lead Kanalen","s":"Solvari","m":"2026-02","a":59805},{"c":"Lead Kanalen","s":"Solvari","m":"2026-03","a":76856},{"c":"Lead Kanalen","s":"Solvari","m":"2026-04","a":45000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-05","a":40000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-06","a":30000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-07","a":15000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-08","a":15000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-09","a":30000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-10","a":20000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-11","a":24000},{"c":"Lead Kanalen","s":"Solvari","m":"2026-12","a":24000},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-04","a":3150},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-05","a":3150},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-06","a":3150},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-07","a":1575},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-08","a":1575},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-09","a":3150},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-10","a":3150},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-11","a":3150},{"c":"Lead Kanalen","s":"TestAannemer","m":"2026-12","a":3150}];

async function main() {
  // Clean up non-lead categories if they exist (one-time migration)
  const deleted = await prisma.budgetForecast.deleteMany({
    where: { category: { notIn: ["Lead Kanalen", "Beurzen"] } },
  });
  if (deleted.count > 0) console.log(`Cleaned up ${deleted.count} non-lead forecast rows`);

  // Only seed if table is empty — never overwrite manual edits
  const count = await prisma.budgetForecast.count();
  if (count > 0) {
    console.log(`Budget forecast already has ${count} rows — skipping seed`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Seeding ${SEED_DATA.length} budget forecast rows...`);
  for (const row of SEED_DATA) {
    await prisma.budgetForecast.create({
      data: {
        category: row.c,
        subcategory: row.s,
        month: new Date(row.m + "-01"),
        amount: row.a,
      },
    });
  }
  console.log("Budget forecast seed complete");
  await prisma.$disconnect();
}

main().catch((e) => { console.error("Budget seed error:", e); process.exit(1); });
