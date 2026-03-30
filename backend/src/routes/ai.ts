import { Router, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.use(authenticate);

// List conversations
router.get("/conversations", async (req: AuthRequest, res: Response) => {
  const conversations = await prisma.aiConversation.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  res.json(conversations);
});

// Get single conversation
router.get("/conversations/:id", async (req: AuthRequest, res: Response) => {
  const conv = await prisma.aiConversation.findFirst({
    where: { id: req.params.id as string, userId: req.user!.id },
  });
  if (!conv) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(conv);
});

// Delete conversation
router.delete("/conversations/:id", async (req: AuthRequest, res: Response) => {
  await prisma.aiConversation.deleteMany({ where: { id: req.params.id as string, userId: req.user!.id } });
  res.json({ message: "Verwijderd" });
});

// Chat (create or continue conversation)
router.post("/chat", async (req: AuthRequest, res: Response) => {
  const { message, conversationId, noSave } = req.body;
  if (!message) { res.status(400).json({ error: "Message is required" }); return; }

  try {
    // If noSave, skip conversation storage (used by report generation)
    if (noSave) {
      const context = await buildDataContext();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: context,
        messages: [{ role: "user", content: message }],
      });
      const answer = response.content.find((b) => b.type === "text")?.text || "Geen antwoord";
      res.json({ answer });
      return;
    }

    // Load or create conversation
    let conv: any;
    let history: { role: string; content: string }[] = [];

    if (conversationId) {
      conv = await prisma.aiConversation.findFirst({ where: { id: conversationId, userId: req.user!.id } });
      if (conv) history = conv.messages as any[] || [];
    }

    // Gather data context
    const context = await buildDataContext();

    // Add user message to history
    history.push({ role: "user", content: message });

    // Call Claude with full conversation history
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: context,
      messages: history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });

    const answer = response.content.find((b) => b.type === "text")?.text || "Geen antwoord";
    history.push({ role: "assistant", content: answer });

    // Generate title from first message
    const title = conv?.title || message.slice(0, 60) + (message.length > 60 ? "..." : "");

    // Save conversation
    if (conv) {
      await prisma.aiConversation.update({
        where: { id: conv.id },
        data: { messages: history, title },
      });
    } else {
      conv = await prisma.aiConversation.create({
        data: { userId: req.user!.id, title, messages: history },
      });
    }

    res.json({ answer, conversationId: conv.id });
  } catch (e: any) {
    console.error("[AI Chat] Error:", e.message);
    res.status(500).json({ error: "AI antwoord mislukt: " + e.message });
  }
});

async function buildDataContext(): Promise<string> {
  const [dealStats, channelStats, costData, appointmentStats] = await Promise.all([
    prisma.deal.groupBy({ by: ["status"], _count: true, _sum: { revenue: true } }),
    prisma.deal.groupBy({ by: ["herkomst"], _count: true, _sum: { revenue: true } }),
    prisma.cost.findMany({ select: { channel: true, amount: true, date: true, source: true }, orderBy: { date: "desc" } }),
    prisma.appointment.groupBy({ by: ["channel"], _count: true }),
  ]);

  const monthlyDeals = await prisma.$queryRaw`
    SELECT to_char(deal_created_at, 'YYYY-MM') as month, herkomst, status,
      COUNT(*)::int as count, COALESCE(SUM(revenue), 0) as revenue
    FROM deals WHERE deal_created_at >= '2025-09-01'
    GROUP BY 1, 2, 3 ORDER BY 1, 2
  ` as any[];

  const monthlyAppointments = await prisma.$queryRaw`
    SELECT to_char(COALESCE(scheduled_at, date), 'YYYY-MM') as month, channel, COUNT(*)::int as count
    FROM appointments GROUP BY 1, 2 ORDER BY 1
  ` as any[];

  const monthlyCosts: Record<string, number> = {};
  for (const c of costData) {
    const month = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, "0")}`;
    const key = `${c.channel} | ${month}`;
    monthlyCosts[key] = (monthlyCosts[key] || 0) + Number(c.amount);
  }

  const reclamationStats = await prisma.$queryRaw`
    SELECT herkomst, COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE reclamatie_redenen != '{}' OR phase LIKE 'Reclamaties%')::int as reclamations
    FROM deals WHERE deal_created_at >= '2025-09-01'
    GROUP BY herkomst ORDER BY total DESC
  ` as any[];

  return `Je bent de AI assistent van het Recotex analytics dashboard. Recotex is een Belgisch bouwbedrijf (dakwerken, gevelwerken).
Antwoord altijd in het Nederlands. Gebruik markdown formatting: **bold**, tabellen, lijsten. Wees specifiek met cijfers.
Als je inconsistenties ziet, leg uit wat er mogelijk fout is.

DATA (sept 2025 - nu):

DEALS PER STATUS:
${dealStats.map((s) => `- ${s.status}: ${s._count} deals, €${Number(s._sum.revenue || 0).toLocaleString("nl-BE")}`).join("\n")}

DEALS PER KANAAL:
${channelStats.map((c) => `- ${c.herkomst || "Onbekend"}: ${c._count} deals, €${Number(c._sum.revenue || 0).toLocaleString("nl-BE")}`).join("\n")}

DEALS PER MAAND:
${monthlyDeals.map((d: any) => `${d.month} | ${d.herkomst} | ${d.status}: ${d.count} deals, €${Number(d.revenue || 0).toFixed(0)}`).join("\n")}

KOSTEN PER KANAAL PER MAAND:
${Object.entries(monthlyCosts).map(([k, v]) => `${k}: €${Number(v).toFixed(0)}`).join("\n")}

AFSPRAKEN PER MAAND:
${monthlyAppointments.map((a: any) => `${a.month} | ${a.channel}: ${a.count}`).join("\n")}

RECLAMATIES:
${reclamationStats.map((r: any) => `- ${r.herkomst}: ${r.reclamations}/${r.total} (${r.total > 0 ? ((r.reclamations / r.total) * 100).toFixed(1) : 0}%)`).join("\n")}

AFSPRAKEN PER KANAAL:
${appointmentStats.map((a) => `- ${a.channel}: ${a._count}`).join("\n")}`;
}

export default router;
