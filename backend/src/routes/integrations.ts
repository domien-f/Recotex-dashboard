import { Router, Request, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  isConfigured as tlConfigured,
  syncAll as syncTeamleader,
} from "../services/teamleader.js";
import {
  getAuthUrl as metaAuthUrl,
  exchangeCodeForToken as metaExchangeCode,
  getLongLivedToken,
  isConfigured as metaConfigured,
  importAdSpend,
} from "../services/metaAds.js";
import { isConfigured as solvariConfigured, autoImportAllMonths as solvariImportAll } from "../services/solvari.js";
import {
  getAuthUrl as googleAuthUrl,
  exchangeCodeForTokens as googleExchangeCode,
  isConfigured as googleConfigured,
  importAdSpend as googleImportAdSpend,
} from "../services/googleAds.js";

const router = Router();

// ─── Public: OAuth callbacks (no JWT auth, user is redirected here from external OAuth) ───

router.get("/teamleader/callback", async (req: Request, res: Response) => {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error || !code) {
    res.redirect(`${frontendUrl}/settings?error=teamleader_auth_failed`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code as string);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Store tokens — use a system user or the first admin if no auth context
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) {
      res.redirect(`${frontendUrl}/settings?error=no_admin_user`);
      return;
    }

    await prisma.integrationCredential.upsert({
      where: { platform: "teamleader" },
      create: {
        platform: "teamleader",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        connectedBy: admin.id,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
    });

    res.redirect(`${frontendUrl}/settings?success=teamleader_connected`);
  } catch (e: any) {
    console.error("[Teamleader] OAuth callback error:", e);
    res.redirect(`${frontendUrl}/settings?error=teamleader_token_exchange_failed`);
  }
});

// Meta Ads OAuth callback
router.get("/meta/callback", async (req: Request, res: Response) => {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error || !code) {
    res.redirect(`${frontendUrl}/settings?error=meta_auth_failed`);
    return;
  }

  try {
    const shortToken = await metaExchangeCode(code as string);
    const longToken = await getLongLivedToken(shortToken.access_token);
    const expiresAt = new Date(Date.now() + longToken.expires_in * 1000);

    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) {
      res.redirect(`${frontendUrl}/settings?error=no_admin_user`);
      return;
    }

    await prisma.integrationCredential.upsert({
      where: { platform: "meta" },
      create: {
        platform: "meta",
        accessToken: longToken.access_token,
        expiresAt,
        connectedBy: admin.id,
      },
      update: {
        accessToken: longToken.access_token,
        expiresAt,
      },
    });

    res.redirect(`${frontendUrl}/settings?success=meta_connected`);
  } catch (e: any) {
    console.error("[Meta Ads] OAuth callback error:", e);
    res.redirect(`${frontendUrl}/settings?error=meta_token_exchange_failed`);
  }
});

// Google Ads OAuth callback
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error || !code) {
    res.redirect(`${frontendUrl}/settings?error=google_auth_failed`);
    return;
  }

  try {
    const tokens = await googleExchangeCode(code as string);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) { res.redirect(`${frontendUrl}/settings?error=no_admin_user`); return; }

    await prisma.integrationCredential.upsert({
      where: { platform: "google" },
      create: {
        platform: "google",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        connectedBy: admin.id,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
      },
    });

    res.redirect(`${frontendUrl}/settings?success=google_connected`);
  } catch (e: any) {
    console.error("[Google Ads] OAuth callback error:", e);
    res.redirect(`${frontendUrl}/settings?error=google_token_exchange_failed`);
  }
});

// ─── Protected: All routes below require auth ───

router.use(authenticate);

// Get integration status for all platforms
router.get("/status", async (_req: AuthRequest, res: Response) => {
  const credentials = await prisma.integrationCredential.findMany({
    select: {
      platform: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true } },
    },
  });

  const lastSyncs = await prisma.syncLog.findMany({
    where: { source: { in: ["teamleader", "meta", "google", "tiktok", "solvari"] } },
    orderBy: { startedAt: "desc" },
    distinct: ["source"],
    take: 10,
  });

  // Get latest cost update per source
  const latestCosts = await prisma.cost.findMany({
    orderBy: { updatedAt: "desc" },
    distinct: ["channel"],
    select: { channel: true, updatedAt: true, source: true, date: true },
  });

  const costChannelMap: Record<string, string> = {
    "META Leads": "meta",
    Solvari: "solvari",
    GOOGLE: "google",
  };

  const allPlatforms = ["teamleader", "meta", "solvari", "google", "tiktok"];

  const platforms = allPlatforms.map((platform) => {
    const cred = credentials.find((c) => c.platform === platform);
    const lastSync = lastSyncs.find((s) => s.source === platform);

    // Solvari uses env credentials, not OAuth
    const isSolvari = platform === "solvari";
    const connected = isSolvari ? solvariConfigured() : Boolean(cred);

    // Find latest cost data for this platform
    const costEntry = latestCosts.find((c) => costChannelMap[c.channel] === platform);

    return {
      platform,
      connected,
      configType: isSolvari ? "credentials" : "oauth",
      expiresAt: cred?.expiresAt || null,
      connectedBy: isSolvari ? null : cred?.user?.name || null,
      connectedAt: cred?.createdAt || null,
      lastSync: lastSync
        ? {
            status: lastSync.status,
            recordsSynced: lastSync.recordsSynced,
            startedAt: lastSync.startedAt,
            completedAt: lastSync.completedAt,
            error: lastSync.error,
          }
        : null,
      lastCostUpdate: costEntry
        ? { updatedAt: costEntry.updatedAt, source: costEntry.source }
        : null,
    };
  });

  res.json(platforms);
});

// Start Teamleader OAuth flow
router.get("/teamleader/connect", requireRole("ADMIN"), (_req: AuthRequest, res: Response) => {
  if (!tlConfigured()) {
    res.status(400).json({ error: "Teamleader client_id and client_secret not configured in .env" });
    return;
  }
  res.json({ url: getAuthUrl() });
});

// Disconnect Teamleader
router.delete("/teamleader", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  await prisma.integrationCredential.deleteMany({ where: { platform: "teamleader" } });
  res.json({ message: "Teamleader disconnected" });
});

// Manual sync trigger
router.post("/teamleader/sync", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  // Prevent duplicate syncs
  const running = await prisma.syncLog.findFirst({ where: { source: "teamleader", status: "RUNNING" } });
  if (running) { res.status(409).json({ error: "Teamleader sync is al bezig" }); return; }

  const cred = await prisma.integrationCredential.findUnique({
    where: { platform: "teamleader" },
  });

  if (!cred) {
    res.status(400).json({ error: "Teamleader not connected" });
    return;
  }

  const log = await prisma.syncLog.create({ data: { source: "teamleader", status: "RUNNING" } });
  res.json({ message: "Teamleader sync started" });

  try {
    const result = await syncTeamleader(prisma);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", recordsSynced: (result as any).synced + (result as any).events, completedAt: new Date() },
    });
  } catch (e: any) {
    console.error("[Teamleader] Manual sync failed:", e.message);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: e.message?.slice(0, 500), completedAt: new Date() },
    });
  }
});

// ─── Meta Ads ───

router.get("/meta/connect", requireRole("ADMIN"), (_req: AuthRequest, res: Response) => {
  if (!metaConfigured()) {
    res.status(400).json({ error: "Facebook App ID en Secret niet geconfigureerd in .env" });
    return;
  }
  res.json({ url: metaAuthUrl() });
});

router.delete("/meta", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  await prisma.integrationCredential.deleteMany({ where: { platform: "meta" } });
  res.json({ message: "Meta Ads disconnected" });
});

router.post("/meta/sync", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  const running = await prisma.syncLog.findFirst({ where: { source: "meta", status: "RUNNING" } });
  if (running) { res.status(409).json({ error: "Meta sync is al bezig" }); return; }
  const cred = await prisma.integrationCredential.findUnique({ where: { platform: "meta" } });
  if (!cred) {
    res.status(400).json({ error: "Meta Ads not connected" });
    return;
  }

  res.json({ message: "Meta Ads sync started" });

  const log = await prisma.syncLog.create({ data: { source: "meta", status: "RUNNING" } });

  try {
    const result = await importAdSpend(prisma, "2025-09-01", new Date().toISOString().slice(0, 10));
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        recordsSynced: result.insights,
        completedAt: new Date(),
      },
    });
  } catch (e: any) {
    console.error("[Meta Ads] Sync failed:", e);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: e.message, completedAt: new Date() },
    });
  }
});

// Sync history with details
router.get("/sync-history", async (req: AuthRequest, res: Response) => {
  const { source, limit = "50" } = req.query;

  const where: any = {};
  if (source) where.source = source;

  const logs = await prisma.syncLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: parseInt(limit as string),
  });

  // Also get next scheduled run info
  const nextRun = new Date();
  nextRun.setHours(2, 0, 0, 0);
  if (nextRun <= new Date()) nextRun.setDate(nextRun.getDate() + 1);

  // Stats per source
  const sources = ["meta", "solvari", "google", "teamleader"];
  const stats = await Promise.all(sources.map(async (s) => {
    const total = await prisma.syncLog.count({ where: { source: s } });
    const success = await prisma.syncLog.count({ where: { source: s, status: "SUCCESS" } });
    const failed = await prisma.syncLog.count({ where: { source: s, status: "FAILED" } });
    const last = await prisma.syncLog.findFirst({ where: { source: s }, orderBy: { startedAt: "desc" } });

    return {
      source: s,
      totalRuns: total,
      successCount: success,
      failedCount: failed,
      successRate: total > 0 ? ((success / total) * 100).toFixed(0) : "0",
      lastRun: last?.startedAt || null,
      lastStatus: last?.status || null,
      lastError: last?.error || null,
    };
  }));

  res.json({ logs, stats, nextScheduledRun: nextRun });
});

// ─── Google Ads ───

router.get("/google/connect", requireRole("ADMIN"), (_req: AuthRequest, res: Response) => {
  if (!googleConfigured()) {
    res.status(400).json({ error: "Google Ads credentials niet geconfigureerd in .env" });
    return;
  }
  res.json({ url: googleAuthUrl() });
});

router.delete("/google", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  await prisma.integrationCredential.deleteMany({ where: { platform: "google" } });
  res.json({ message: "Google Ads disconnected" });
});

router.post("/google/sync", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  const runningG = await prisma.syncLog.findFirst({ where: { source: "google", status: "RUNNING" } });
  if (runningG) { res.status(409).json({ error: "Google sync is al bezig" }); return; }
  const cred = await prisma.integrationCredential.findUnique({ where: { platform: "google" } });
  if (!cred) { res.status(400).json({ error: "Google Ads not connected" }); return; }

  const log = await prisma.syncLog.create({ data: { source: "google", status: "RUNNING" } });
  res.json({ message: "Google Ads sync gestart" });

  try {
    const result = await googleImportAdSpend(prisma, "2025-09-01", new Date().toISOString().slice(0, 10));
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", recordsSynced: result.insights, completedAt: new Date() },
    });
  } catch (e: any) {
    console.error("[Google Ads] Sync failed:", e.message);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: e.message, completedAt: new Date() },
    });
  }
});

// ─── Solvari ───

router.post("/solvari/sync", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  const runningS = await prisma.syncLog.findFirst({ where: { source: "solvari", status: "RUNNING" } });
  if (runningS) { res.status(409).json({ error: "Solvari sync is al bezig" }); return; }
  if (!solvariConfigured()) {
    res.status(400).json({ error: "SOLVARI_EMAIL en SOLVARI_PASSWORD niet ingesteld in .env" });
    return;
  }

  const log = await prisma.syncLog.create({ data: { source: "solvari", status: "RUNNING" } });
  res.json({ message: "Solvari sync gestart" });

  try {
    const results = await solvariImportAll(prisma);
    const total = results.reduce((s, r) => s + r.leadCount, 0);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", recordsSynced: total, completedAt: new Date() },
    });
  } catch (e: any) {
    console.error("[Solvari] Sync failed:", e.message);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: e.message, completedAt: new Date() },
    });
  }
});

export default router;
