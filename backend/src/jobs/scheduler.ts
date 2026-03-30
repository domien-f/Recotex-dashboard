import cron from "node-cron";
import { prisma } from "../index.js";
import { importAdSpend as metaImport } from "../services/metaAds.js";
import { autoImportAllMonths as solvariImport, isConfigured as solvariConfigured } from "../services/solvari.js";
import { importAdSpend as googleImport } from "../services/googleAds.js";
import { syncAll as teamleaderSync } from "../services/teamleader.js";

async function runSync(source: string, fn: () => Promise<any>) {
  const log = await prisma.syncLog.create({ data: { source, status: "RUNNING" } });
  const start = Date.now();

  try {
    const result = await fn();
    const records = typeof result === "object" && result?.insights ? result.insights :
                    typeof result === "object" && result?.length ? result.length :
                    Array.isArray(result) ? result.reduce((s: number, r: any) => s + (r.leadCount || 0), 0) : 0;

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", recordsSynced: records, completedAt: new Date() },
    });

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Cron] ${source}: SUCCESS (${records} records, ${duration}s)`);
  } catch (e: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: e.message?.slice(0, 500), completedAt: new Date() },
    });
    console.error(`[Cron] ${source}: FAILED — ${e.message}`);
  }
}

export function startScheduler() {
  // Daily sync at 02:00 — all data sources
  cron.schedule("0 2 * * *", async () => {
    console.log(`[Cron] Daily sync started at ${new Date().toISOString()}`);

    const today = new Date().toISOString().slice(0, 10);
    const septStart = "2025-09-01";

    // Meta Ads
    const metaCred = await prisma.integrationCredential.findUnique({ where: { platform: "meta" } });
    if (metaCred) {
      await runSync("meta", () => metaImport(prisma, septStart, today));
    }

    // Solvari
    if (solvariConfigured()) {
      await runSync("solvari", () => solvariImport(prisma));
    }

    // Google Ads
    const googleCred = await prisma.integrationCredential.findUnique({ where: { platform: "google" } });
    if (googleCred) {
      await runSync("google", () => googleImport(prisma, septStart, today));
    }

    // Teamleader
    const tlCred = await prisma.integrationCredential.findUnique({ where: { platform: "teamleader" } });
    if (tlCred) {
      await runSync("teamleader", () => teamleaderSync(prisma));
    }

    console.log(`[Cron] Daily sync completed at ${new Date().toISOString()}`);
  });

  console.log("[Scheduler] Daily cron job at 02:00 initialized");
}
