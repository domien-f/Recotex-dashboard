import { Router, Request, Response } from "express";
import { prisma } from "../index.js";
import { computeIdempotencyKey, processWebhook } from "../services/teamleaderWebhook.js";

// ─── Public webhook receiver (NO auth — Teamleader can't authenticate) ─────
//
// Mounted under /api/webhooks. The route is intentionally NOT behind the
// authenticate middleware — it's how Teamleader pings us.
//
// Hard guarantees:
//   - Always responds 200 (Teamleader retries on non-2xx → would cause duplicates)
//   - Computes idempotencyKey = sha256(rawBody) FIRST
//   - WebhookEvent.upsert by idempotencyKey → exact-duplicate webhook is a no-op
//   - Processing happens AFTER the dedup row insert, fire-and-forget so the HTTP
//     response is fast (< 200ms typical)

const router = Router();

router.post("/teamleader", async (req: Request, res: Response) => {
  // ACK first — Teamleader gets 200 OK regardless of what we do next.
  res.status(200).send("OK");

  const body = (req.body ?? {}) as Record<string, unknown>;

  let webhookEventId: string;
  try {
    const idempotencyKey = computeIdempotencyKey(body);

    // Dedup at the door: same exact body twice → second insert returns the
    // existing row (no double-processing).
    const existing = await prisma.webhookEvent.findUnique({
      where: { idempotencyKey },
      select: { id: true, processedAt: true },
    });

    if (existing) {
      // Already seen this exact webhook. If it never got processed (server
      // crashed mid-handler etc.), we'll retry it; otherwise nothing to do.
      if (existing.processedAt) return;
      webhookEventId = existing.id;
    } else {
      const created = await prisma.webhookEvent.create({
        data: {
          source: "teamleader",
          eventType: "unknown",         // refined by handler after parsing
          idempotencyKey,
          rawBody: body as any,
        },
      });
      webhookEventId = created.id;
    }
  } catch (e: any) {
    console.error("[webhook] failed to record event:", e?.message || e);
    return;
  }

  // Fire and forget — the response has already gone out.
  processWebhook(prisma, webhookEventId, body).catch((e) => {
    console.error("[webhook] processWebhook crashed:", e?.message || e);
  });
});

export default router;
