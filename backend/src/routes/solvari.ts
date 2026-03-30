import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import multer from "multer";
import { readFileSync } from "fs";
import { parseSolvariCSV, saveSolvariCosts, autoImportSolvari, autoImportAllMonths, isConfigured } from "../services/solvari.js";

const router = Router();
const upload = multer({ dest: "/tmp/solvari-uploads/" });

router.use(authenticate);

// Upload and parse Solvari CSV manually
router.post("/upload", requireRole("ADMIN", "MANAGER"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "Geen bestand geüpload" }); return; }
  try {
    const csv = readFileSync(req.file.path, "utf-8");
    const result = parseSolvariCSV(csv);
    await saveSolvariCosts(prisma, result);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: "CSV parsing mislukt: " + e.message });
  }
});

// Auto-fetch single month
router.post("/fetch", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { start, end } = req.body;
  if (!start || !end) { res.status(400).json({ error: "start en end datum vereist" }); return; }
  if (!isConfigured()) { res.status(400).json({ error: "SOLVARI_EMAIL en SOLVARI_PASSWORD niet ingesteld" }); return; }

  res.json({ message: "Solvari import gestart" });
  try {
    await autoImportSolvari(prisma, start, end);
  } catch (e: any) {
    console.error("[Solvari] Auto-fetch failed:", e.message);
  }
});

// Auto-fetch all months (Sept 2025 - now)
router.post("/fetch-all", requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  if (!isConfigured()) { res.status(400).json({ error: "SOLVARI_EMAIL en SOLVARI_PASSWORD niet ingesteld" }); return; }

  res.json({ message: "Solvari import alle maanden gestart" });
  try {
    const results = await autoImportAllMonths(prisma);
    console.log(`[Solvari] All months done: ${results.length} months imported`);
  } catch (e: any) {
    console.error("[Solvari] Full import failed:", e.message);
  }
});

// Get all Solvari cost records
router.get("/costs", async (_req: AuthRequest, res: Response) => {
  const costs = await prisma.cost.findMany({
    where: { channel: "Solvari" },
    orderBy: { date: "desc" },
  });
  res.json(costs);
});

export default router;
