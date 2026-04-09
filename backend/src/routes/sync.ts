import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { syncAll as syncTeamleader } from "../services/teamleader.js";
import { importFromExcel, importAfspraken } from "../scripts/importExcel.js";

const router = Router();
const upload = multer({ dest: path.resolve("/tmp/uploads") });

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

  // Check if a sync is already running
  const running = await prisma.syncLog.findFirst({ where: { status: "RUNNING", source } });
  if (running) {
    res.status(409).json({ error: `${source} sync already running since ${running.startedAt}` });
    return;
  }

  const cred = await prisma.integrationCredential.findUnique({
    where: { platform: source },
  });

  if (!cred) {
    res.status(400).json({ error: `${source} not connected` });
    return;
  }

  const log = await prisma.syncLog.create({
    data: { source, status: "RUNNING" },
  });

  res.json({ message: `Sync triggered for ${source}` });

  // Run in background
  try {
    if (source === "teamleader") {
      const result = await syncTeamleader(prisma);
      await prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "SUCCESS", recordsSynced: result.synced + result.events, completedAt: new Date() },
      });
    }
  } catch (e: any) {
    console.error(`[Sync] ${source} sync failed:`, e);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: e.message?.slice(0, 500), completedAt: new Date() },
    });
  }
});

// Excel upload endpoint for importing historical data
router.post("/import/excel", requireRole("ADMIN"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const filePath = req.file.path;
  const importType = (req.body.type || "deals") as string;
  console.log(`[Import] Excel upload received: ${req.file.originalname} (${req.file.size} bytes), type: ${importType}`);

  const log = await prisma.syncLog.create({
    data: { source: `excel-import-${importType}`, status: "RUNNING" },
  });

  // Run in background so response is fast
  res.json({ message: `${importType} import started`, logId: log.id });

  try {
    if (importType === "afspraken") {
      const result = await importAfspraken(filePath);
      await prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "SUCCESS", recordsSynced: result.appointments, completedAt: new Date() },
      });
    } else {
      const result = await importFromExcel(filePath);
      await prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "SUCCESS", recordsSynced: result.deals, completedAt: new Date() },
      });
    }
  } catch (e: any) {
    console.error(`[Import] ${importType} import failed:`, e);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: e.message?.slice(0, 500), completedAt: new Date() },
    });
  }
});

export default router;
