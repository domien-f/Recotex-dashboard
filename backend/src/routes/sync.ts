import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { syncAll as syncTeamleader } from "../services/teamleader.js";

const router = Router();

router.use(authenticate);

router.get("/status", async (_req: AuthRequest, res: Response) => {
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  res.json(logs);
});

router.post("/trigger/:source", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const source = req.params.source as string;

  const cred = await prisma.integrationCredential.findUnique({
    where: { platform: source },
  });

  if (!cred) {
    res.status(400).json({ error: `${source} not connected` });
    return;
  }

  res.json({ message: `Sync triggered for ${source}` });

  // Run in background
  try {
    if (source === "teamleader") {
      await syncTeamleader(prisma);
    }
    // TODO: meta, google, tiktok
  } catch (e) {
    console.error(`[Sync] ${source} sync failed:`, e);
  }
});

export default router;
