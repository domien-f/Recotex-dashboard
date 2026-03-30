import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.use(authenticate);

router.get("/", async (_req: AuthRequest, res: Response) => {
  const targets = await prisma.kpiTarget.findMany({
    orderBy: [{ category: "asc" }, { metric: "asc" }],
    include: { creator: { select: { name: true } } },
  });
  res.json(targets);
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { category, metric, targetValue, channel, period } = req.body;

  if (!category || !metric || targetValue === undefined) {
    res.status(400).json({ error: "category, metric, and targetValue are required" });
    return;
  }

  const target = await prisma.kpiTarget.create({
    data: { category, metric, targetValue, channel, period, createdBy: req.user!.id },
  });

  res.status(201).json(target);
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const target = await prisma.kpiTarget.update({
    where: { id: req.params.id as string },
    data: req.body,
  });
  res.json(target);
});

router.delete("/:id", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  await prisma.kpiTarget.delete({ where: { id: req.params.id as string } });
  res.json({ message: "Deleted" });
});

export default router;
