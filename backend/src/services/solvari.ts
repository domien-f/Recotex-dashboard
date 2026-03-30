import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";

const SOLVARI_CUSTOMER_ID = "bfe4de3c-c47e-450c-9172-6ef5eef4b26e";
const SOLVARI_API = "https://api.solvari.be/v4";
const SOLVARI_AUTH = "https://auth.solvari.be";

interface ParseResult {
  month: string;
  leadCount: number;
  leadCosts: number;
  refundCount: number;
  refunds: number;
  netCost: number;
  skipped: number;
}

// ─── CSV Parser ───

export function parseSolvariCSV(csvContent: string): ParseResult {
  const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }) as any[];

  let leadCosts = 0, leadCount = 0, refunds = 0, refundCount = 0, skipped = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const row of records) {
    const price = parseFloat(row.Price || "0");
    const details = (row.Details || "").trim().toLowerCase();
    const at = new Date(row.At);

    if (details.includes("purchased credits") || details.includes("automatic topup")) {
      skipped++;
      continue;
    }

    if (!isNaN(at.getTime())) {
      if (!minDate || at < minDate) minDate = at;
      if (!maxDate || at > maxDate) maxDate = at;
    }

    if (price < 0) { leadCosts += Math.abs(price); leadCount++; }
    else if (price > 0) { refunds += price; refundCount++; }
  }

  const d = maxDate || minDate;
  const month = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "unknown";

  return {
    month,
    leadCount,
    leadCosts: parseFloat(leadCosts.toFixed(2)),
    refundCount,
    refunds: parseFloat(refunds.toFixed(2)),
    netCost: parseFloat((leadCosts - refunds).toFixed(2)),
    skipped,
  };
}

// ─── Save to DB ───

export async function saveSolvariCosts(prisma: PrismaClient, result: ParseResult, source = "solvari_csv", overrideMonth?: string) {
  const month = overrideMonth || result.month;
  if (month === "unknown") throw new Error("Geen geldige datums in data");

  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(`${year}-${String(monthNum).padStart(2, "0")}-01T00:00:00Z`);

  const existing = await prisma.cost.findFirst({
    where: {
      channel: "Solvari",
      date: {
        gte: new Date(`${year}-${String(monthNum).padStart(2, "0")}-01T00:00:00Z`),
        lt: new Date(`${monthNum === 12 ? year + 1 : year}-${String(monthNum === 12 ? 1 : monthNum + 1).padStart(2, "0")}-01T00:00:00Z`),
      },
    },
  });

  const description = `Solvari ${month}: ${result.leadCount} leads (€${result.leadCosts.toFixed(2)}) - ${result.refundCount} refunds (€${result.refunds.toFixed(2)})`;

  if (existing) {
    await prisma.cost.update({ where: { id: existing.id }, data: { amount: result.netCost, description, isEstimated: false, source } });
  } else {
    await prisma.cost.create({ data: { channel: "Solvari", amount: result.netCost, date: monthStart, type: "INVOICE", description, isEstimated: false, source } });
  }
}

// ─── Pure fetch login (no browser needed) ───

let cachedCookie: string | null = null;
let cookieExpires = 0;

async function login(): Promise<string> {
  if (cachedCookie && Date.now() < cookieExpires) return cachedCookie;

  const email = process.env.SOLVARI_EMAIL;
  const password = process.env.SOLVARI_PASSWORD;
  if (!email || !password) throw new Error("SOLVARI_EMAIL en SOLVARI_PASSWORD niet ingesteld in .env");

  // GET login page for initial session cookie
  const pageRes = await fetch(`${SOLVARI_AUTH}/nl/login`);
  const initCookie = (pageRes.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");

  // POST login
  const loginRes = await fetch(`${SOLVARI_AUTH}/nl/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: initCookie,
      Origin: SOLVARI_AUTH,
      Referer: `${SOLVARI_AUTH}/nl/login`,
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await loginRes.json() as any;
  if (!body.redirect) throw new Error(`Solvari login mislukt: ${JSON.stringify(body)}`);

  cachedCookie = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  cookieExpires = Date.now() + 90 * 60 * 1000; // 1.5h cache

  return cachedCookie;
}

async function fetchCSV(start: string, end: string): Promise<string> {
  const cookie = await login();
  const url = `${SOLVARI_API}/customer/${SOLVARI_CUSTOMER_ID}/transactions/export?format=csv_comma&types%5B%5D=application&types%5B%5D=credit_block&types%5B%5D=expired&types%5B%5D=refund_reverted&types%5B%5D=refund&start=${start}&end=${end}`;

  const res = await fetch(url, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`Solvari API error: ${res.status}`);

  const text = await res.text();
  if (!text.includes('"At"')) throw new Error("Geen CSV ontvangen — sessie verlopen?");

  return text;
}

// ─── Auto-import ───

export async function autoImportSolvari(prisma: PrismaClient, start: string, end: string) {
  console.log(`[Solvari] Fetching ${start} to ${end}...`);
  const csv = await fetchCSV(start, end);
  const result = parseSolvariCSV(csv);
  const monthKey = start.slice(0, 7);
  await saveSolvariCosts(prisma, result, "solvari_api", monthKey);
  console.log(`[Solvari] ${monthKey}: ${result.leadCount} leads, netto €${result.netCost}`);
  return result;
}

export async function autoImportAllMonths(prisma: PrismaClient) {
  console.log("[Solvari] Importing all months...");
  const results: ParseResult[] = [];
  const d = new Date(2025, 8, 1); // Sept 2025
  const now = new Date();

  while (d <= now) {
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0); // last day
    const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-${String(nextMonth.getDate()).padStart(2, "0")}`;

    try {
      const csv = await fetchCSV(monthStart, monthEnd);
      const result = parseSolvariCSV(csv);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (result.leadCount > 0 || result.refundCount > 0) {
        await saveSolvariCosts(prisma, result, "solvari_api", monthKey);
        results.push(result);
        console.log(`  ${monthKey}: ${result.leadCount} leads, netto €${result.netCost}`);
      }
    } catch (e: any) {
      console.error(`  Error: ${e.message}`);
    }

    d.setMonth(d.getMonth() + 1);
  }

  console.log(`[Solvari] Done: ${results.length} months`);
  return results;
}

export function isConfigured(): boolean {
  return Boolean(process.env.SOLVARI_EMAIL && process.env.SOLVARI_PASSWORD);
}
