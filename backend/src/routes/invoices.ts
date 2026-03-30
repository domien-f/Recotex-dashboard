import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { parseInvoice } from "../services/invoiceParser.js";

const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const router = Router();
router.use(authenticate);

// List invoices
router.get("/", async (req: AuthRequest, res: Response) => {
  const { vendor, status, dateFrom, dateTo } = req.query;
  const where: any = {};
  if (vendor) where.vendor = { contains: vendor as string, mode: "insensitive" };
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom as string);
    if (dateTo) where.date.lte = new Date(dateTo as string);
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { name: true } } },
  });
  res.json(invoices);
});

// Upload + AI parse
router.post("/upload", requireRole("ADMIN", "MANAGER"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ error: "Geen bestand geüpload" }); return; }

  // Duplicate check by filename
  const existing = await prisma.invoice.findFirst({ where: { filename: req.file.originalname } });
  if (existing) {
    res.status(409).json({ error: `Factuur "${req.file.originalname}" is al geüpload`, existingId: existing.id });
    return;
  }

  const invoice = await prisma.invoice.create({
    data: {
      filename: req.file.originalname,
      filePath: req.file.path,
      uploadedBy: req.user!.id,
    },
  });

  // Return immediately, parse in background
  res.status(201).json(invoice);

  // AI parsing
  try {
    console.log(`[Invoice] Parsing ${invoice.filename}...`);
    const parsed = await parseInvoice(req.file.path);
    console.log(`[Invoice] Parsed: ${parsed.vendor} - €${parsed.totalAmount} - ${parsed.channel}`);

    // Generate warnings
    const warnings: string[] = [];
    if (!parsed.dateRangeFrom || !parsed.dateRangeTo) warnings.push("Geen factuurperiode (dateRange) gevonden — vul dit handmatig in");
    if (parsed.confidence < 70) warnings.push(`Lage zekerheid (${parsed.confidence}%) — controleer alle velden`);
    if (parsed.channel === "Overig") warnings.push("Kanaal niet herkend — selecteer het juiste kanaal");
    if (!parsed.totalAmount || parsed.totalAmount === 0) warnings.push("Geen bedrag gevonden");

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PARSED",
        vendor: parsed.vendor,
        totalAmount: parsed.totalAmount,
        channel: parsed.channel,
        date: parsed.date ? new Date(parsed.date) : null,
        parsedData: { ...parsed, warnings } as any,
      },
    });
  } catch (e: any) {
    console.error(`[Invoice] Parse error for ${invoice.filename}:`, e.message);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "ERROR", parsedData: { error: e.message } as any },
    });
  }
});

// Update parsed data (review/edit)
router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const { vendor, totalAmount, channel, date, description } = req.body;

  const invoice = await prisma.invoice.update({
    where: { id: req.params.id as string },
    data: {
      vendor,
      totalAmount,
      channel,
      date: date ? new Date(date) : undefined,
      parsedData: req.body.parsedData || undefined,
    },
  });

  res.json(invoice);
});

// Confirm invoice → create cost record
router.post("/:id/confirm", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res: Response) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id as string } });
  if (!invoice) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }
  if (!invoice.totalAmount) { res.status(400).json({ error: "Bedrag ontbreekt" }); return; }

  const channel = req.body.channel || invoice.channel || "Overig";
  const parsed = invoice.parsedData as any;
  const totalAmount = Number(invoice.totalAmount);

  // Check if we need to split across months
  const dateFrom = parsed?.dateRangeFrom ? new Date(parsed.dateRangeFrom) : null;
  const dateTo = parsed?.dateRangeTo ? new Date(parsed.dateRangeTo) : null;

  if (dateFrom && dateTo && dateFrom < dateTo) {
    // Calculate number of months in range
    const months: Date[] = [];
    const d = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
    const endMonth = new Date(dateTo.getFullYear(), dateTo.getMonth(), 1);
    while (d <= endMonth) {
      months.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }

    if (months.length > 1) {
      // Split evenly across months
      const perMonth = parseFloat((totalAmount / months.length).toFixed(2));
      const remainder = parseFloat((totalAmount - perMonth * months.length).toFixed(2));

      for (let i = 0; i < months.length; i++) {
        const amount = i === 0 ? perMonth + remainder : perMonth; // put rounding diff on first month
        await prisma.cost.create({
          data: {
            channel,
            amount,
            date: months[i],
            type: "INVOICE",
            description: `Factuur ${invoice.vendor || invoice.filename} (${i + 1}/${months.length})`,
            invoiceId: invoice.id,
            source: "invoice_ai",
          },
        });
      }
    } else {
      // Single month
      await prisma.cost.create({
        data: {
          channel,
          amount: totalAmount,
          date: dateFrom,
          type: "INVOICE",
          description: `Factuur ${invoice.vendor || invoice.filename}`,
          invoiceId: invoice.id,
          source: "invoice_ai",
        },
      });
    }
  } else {
    // No date range — single cost on invoice date
    await prisma.cost.create({
      data: {
        channel,
        amount: totalAmount,
        date: invoice.date || new Date(),
        type: "INVOICE",
        description: `Factuur ${invoice.vendor || invoice.filename}`,
        invoiceId: invoice.id,
        source: "invoice_ai",
      },
    });
  }

  // Mark as confirmed
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "CONFIRMED", channel },
  });

  // Remove estimated costs for same channel/month
  if (invoice.date) {
    const y = invoice.date.getFullYear();
    const m = invoice.date.getMonth();
    await prisma.cost.deleteMany({
      where: {
        channel,
        isEstimated: true,
        date: { gte: new Date(y, m, 1), lt: new Date(y, m + 1, 1) },
      },
    });
  }

  res.json({ message: "Factuur bevestigd en kosten aangemaakt" });
});

// Delete invoice
router.delete("/:id", requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  await prisma.cost.deleteMany({ where: { invoiceId: req.params.id as string } });
  await prisma.invoice.delete({ where: { id: req.params.id as string } });
  res.json({ message: "Factuur verwijderd" });
});

export default router;
