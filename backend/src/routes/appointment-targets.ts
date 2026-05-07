import { Router, Response } from "express";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(authenticate);

const EXCLUDED_HERKOMST = ["EXTRA WERKEN"];

/**
 * List current weekly afspraak targets per verkoper.
 * Joins distinct verantwoordelijke names from Deal with the latest target row.
 */
router.get("/", async (_req: AuthRequest, res: Response) => {
  // Pull every distinct verkoper that ever owned a deal (excluding noise)
  const verkopers = await prisma.deal.findMany({
    where: {
      verantwoordelijke: { not: null },
      herkomst: { notIn: EXCLUDED_HERKOMST },
    },
    select: { verantwoordelijke: true },
    distinct: ["verantwoordelijke"],
    orderBy: { verantwoordelijke: "asc" },
  });
  const names = verkopers.map((v) => v.verantwoordelijke!).filter(Boolean);

  // Latest active (effectiveUntil = null) target per verkoper
  const targets = await prisma.appointmentTarget.findMany({
    where: { effectiveUntil: null },
    orderBy: { effectiveFrom: "desc" },
  });
  const byVerkoper = new Map(targets.map((t) => [t.verantwoordelijke, t]));

  res.json(
    names.map((name) => {
      const t = byVerkoper.get(name);
      return {
        verantwoordelijke: name,
        weeklyTarget: t?.weeklyTarget ?? null,
        teamleaderUserId: t?.teamleaderUserId ?? null,
        effectiveFrom: t?.effectiveFrom ?? null,
        targetId: t?.id ?? null,
      };
    })
  );
});

/**
 * Upsert weekly target for one verkoper.
 * Closes the previous target (effectiveUntil = now) and opens a new one,
 * so historical bezetting stays accurate for prior periods.
 */
router.put("/", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { verantwoordelijke, weeklyTarget, teamleaderUserId } = req.body as {
    verantwoordelijke: string;
    weeklyTarget: number;
    teamleaderUserId?: string | null;
  };

  if (!verantwoordelijke || typeof weeklyTarget !== "number" || weeklyTarget < 0) {
    res.status(400).json({ error: "verantwoordelijke and non-negative weeklyTarget required" });
    return;
  }

  // Close the open target (if any)
  await prisma.appointmentTarget.updateMany({
    where: { verantwoordelijke, effectiveUntil: null },
    data: { effectiveUntil: new Date() },
  });

  const created = await prisma.appointmentTarget.create({
    data: {
      verantwoordelijke,
      weeklyTarget,
      teamleaderUserId: teamleaderUserId || null,
      effectiveFrom: new Date(),
    },
  });

  res.json(created);
});

/**
 * Bulk save: array of { verantwoordelijke, weeklyTarget, teamleaderUserId? }.
 * Used by the Settings UI "Save all" button.
 */
router.put("/bulk", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const rows = req.body?.rows as Array<{
    verantwoordelijke: string;
    weeklyTarget: number | null;          // null = untrack (clear active target)
    teamleaderUserId?: string | null;
  }>;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "rows[] required" });
    return;
  }

  const now = new Date();
  const results: any[] = [];

  for (const r of rows) {
    if (!r.verantwoordelijke) continue;

    const current = await prisma.appointmentTarget.findFirst({
      where: { verantwoordelijke: r.verantwoordelijke, effectiveUntil: null },
    });

    // Untrack: clear active target without creating a new one
    if (r.weeklyTarget === null || r.weeklyTarget === undefined) {
      if (current) {
        await prisma.appointmentTarget.update({
          where: { id: current.id },
          data: { effectiveUntil: now },
        });
        results.push({ verantwoordelijke: r.verantwoordelijke, cleared: true });
      } else {
        results.push({ verantwoordelijke: r.verantwoordelijke, unchanged: true });
      }
      continue;
    }

    if (typeof r.weeklyTarget !== "number" || r.weeklyTarget < 0) continue;

    // Skip the rewrite if target unchanged (avoids creating noise rows on every save)
    if (
      current &&
      current.weeklyTarget === r.weeklyTarget &&
      (current.teamleaderUserId || null) === (r.teamleaderUserId || null)
    ) {
      results.push({ verantwoordelijke: r.verantwoordelijke, unchanged: true });
      continue;
    }

    await prisma.appointmentTarget.updateMany({
      where: { verantwoordelijke: r.verantwoordelijke, effectiveUntil: null },
      data: { effectiveUntil: now },
    });
    const created = await prisma.appointmentTarget.create({
      data: {
        verantwoordelijke: r.verantwoordelijke,
        weeklyTarget: r.weeklyTarget,
        teamleaderUserId: r.teamleaderUserId || null,
        effectiveFrom: now,
      },
    });
    results.push(created);
  }

  res.json({ saved: results.length, results });
});

export default router;
