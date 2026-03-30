import { Router, Request, Response } from "express";
import { prisma } from "../index.js";
import jwt from "jsonwebtoken";
import puppeteer from "puppeteer";

const router = Router();

// Custom auth for this route — accepts token as query param
router.get("/pdf", async (req: Request, res: Response) => {
  const token = (req.query.token as string) || req.headers.authorization?.slice(7);
  if (!token) { res.status(401).json({ error: "Token required" }); return; }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as any;
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) { res.status(401).json({ error: "Invalid user" }); return; }
  } catch {
    res.status(401).json({ error: "Invalid token" }); return;
  }
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  try {
    console.log("[Report] Generating PDF...");
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    // Set viewport to A4-ish
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

    // Set auth token, filter state, and AI data in localStorage before navigating
    const aiData = req.query.ai as string || "{}";
    await page.evaluateOnNewDocument((authData: string, filterData: string, ai: string) => {
      localStorage.setItem("recotex-auth", authData);
      localStorage.setItem("recotex-filters", filterData);
      localStorage.setItem("recotex-report-ai", ai);
    },
      JSON.stringify({ state: { token, user: { id: "pdf", email: "pdf", name: "PDF", role: "ADMIN" } } }),
      JSON.stringify({ state: { dateFrom: req.query.dateFrom || "", dateTo: req.query.dateTo || "", channel: "", status: "" } }),
      aiData
    );

    // Navigate to the report page with date range
    const dateFrom = req.query.dateFrom || "";
    const dateTo = req.query.dateTo || "";
    await page.goto(`${frontendUrl}/rapport?print=true`, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for content to render
    await page.waitForSelector("[data-report-ready]", { timeout: 20000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // Hide sidebar, header, and main padding for clean PDF
    await page.addStyleTag({
      content: `
        aside, nav, header, .print\\:hidden { display: none !important; }
        main { margin-left: 0 !important; padding: 0 !important; max-width: 100% !important; }
        .ml-\\[260px\\] { margin-left: 0 !important; }
        .p-8 { padding: 0 !important; }
      `,
    });

    // Generate PDF
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    await browser.close();

    console.log("[Report] PDF generated:", (pdf.length / 1024).toFixed(0) + "KB");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=Recotex_Rapport.pdf");
    res.send(Buffer.from(pdf));
  } catch (e: any) {
    console.error("[Report] PDF generation failed:", e.message);
    res.status(500).json({ error: "PDF generatie mislukt: " + e.message });
  }
});

export default router;
