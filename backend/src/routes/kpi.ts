import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.use(authenticate);

router.get("/", async (_req: AuthRequest, res: Response) => {
  const targets = await prisma.kpiTarget.findMany({
    where: { month: null },
    orderBy: [{ category: "asc" }, { metric: "asc" }],
    include: { creator: { select: { name: true } } },
  });
  // Filter out budget metrics that are now stored per-month
  const budgetMetrics = ["total_marketing_budget", "lead_spend_budget"];
  res.json(targets.filter((t) => !budgetMetrics.includes(t.metric)));
});

// Upsert monthly budget targets (total_marketing_budget / lead_spend_budget)
router.put("/budget", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { metric, months } = req.body as { metric: string; months: { month: string; value: number }[] };

  if (!metric || !months?.length) {
    res.status(400).json({ error: "metric and months[] required" });
    return;
  }

  const results = await Promise.all(
    months.map(({ month, value }) => {
      const monthDate = new Date(month + "-01");
      return prisma.kpiTarget.upsert({
        where: { metric_month: { metric, month: monthDate } },
        update: { targetValue: value },
        create: { category: "Kosten", metric, targetValue: value, month: monthDate, period: "MONTHLY", createdBy: req.user!.id },
      });
    })
  );

  res.json(results);
});

// Get monthly budget targets for a metric
router.get("/budget/:metric", async (req: AuthRequest, res: Response) => {
  const targets = await prisma.kpiTarget.findMany({
    where: { metric: req.params.metric as string, month: { not: null } },
    orderBy: { month: "asc" },
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
