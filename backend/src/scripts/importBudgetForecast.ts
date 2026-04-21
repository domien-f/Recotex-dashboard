import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

// Parse the Actieplan CSV into budget forecast rows
const MONTH_COLS = [
  { col: "Januari", month: "2026-01" },
  { col: "Februari", month: "2026-02" },
  { col: "Maart", month: "2026-03" },
  { col: "April", month: "2026-04" },
  { col: "Mei", month: "2026-05" },
  { col: "Juni", month: "2026-06" },
  { col: "Juli", month: "2026-07" },
  { col: "Augustus", month: "2026-08" },
  { col: "September", month: "2026-09" },
  { col: "Oktober", month: "2026-10" },
  { col: "November", month: "2026-11" },
  { col: "December", month: "2026-12" },
];

// Categories are rows with sub-items underneath, separated by blank rows
const CATEGORIES = [
  "Lead Kanalen",
  "Beurzen",
  "Offline marketing + diverse kosten",
  "Call Centre kosten",
  "Marketing team",
  "Fees",
  "Sponsoring kosten",
  "IT-Systemen",
  "Totaal Marketing budget",
];

function parseAmount(val: string): number {
  if (!val || val.trim() === "" || val.trim() === "-" || val.trim() === "0") return 0;
  let cleaned = val.trim();
  // European format: 120.000 = 120000, 231,4 = 231.4
  // Check if it uses dots as thousand separators (e.g., "120.000")
  if (cleaned.match(/^\d{1,3}\.\d{3}$/)) {
    cleaned = cleaned.replace(/\./g, "");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx src/scripts/importBudgetForecast.ts <path-to-csv>");
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").map((l) => {
    // Parse CSV respecting quotes
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of l) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === "," && !inQuotes) { result.push(current); current = ""; continue; }
      current += char;
    }
    result.push(current);
    return result.map((c) => c.trim());
  });

  // Find header row
  const headerIdx = lines.findIndex((l) => l[0] === "Kolom 1");
  if (headerIdx === -1) {
    console.error("Could not find header row (Kolom 1)");
    process.exit(1);
  }
  const headers = lines[headerIdx];

  // Map month columns to their indices
  const monthIndices = MONTH_COLS.map((mc) => ({
    month: mc.month,
    idx: headers.indexOf(mc.col),
  })).filter((m) => m.idx !== -1);

  let currentCategory = "";
  let upserted = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i];
    const name = cols[0]?.trim();

    if (!name) {
      currentCategory = "";
      continue;
    }

    // Skip the "Totaal" row - we'll let the frontend sum
    if (name === "Totaal Marketing budget") continue;
    // Skip placeholder rows
    if (name === "x") continue;

    const isCategory = CATEGORIES.includes(name);

    if (isCategory) {
      currentCategory = name;
      // Save the category totals as a row with no subcategory
      for (const { month, idx } of monthIndices) {
        const amount = parseAmount(cols[idx]);
        if (amount <= 0) continue;
        const monthDate = new Date(month + "-01");
        await prisma.budgetForecast.upsert({
          where: { category_sub_month: { category: currentCategory, subcategory: "", month: monthDate } },
          update: { amount },
          create: { category: currentCategory, subcategory: "", month: monthDate, amount },
        });
        upserted++;
      }
    } else if (currentCategory) {
      // Sub-item
      for (const { month, idx } of monthIndices) {
        const amount = parseAmount(cols[idx]);
        if (amount <= 0) continue;
        const monthDate = new Date(month + "-01");
        await prisma.budgetForecast.upsert({
          where: { category_sub_month: { category: currentCategory, subcategory: name, month: monthDate } },
          update: { amount },
          create: { category: currentCategory, subcategory: name, month: monthDate, amount },
        });
        upserted++;
      }
    }
  }

  console.log(`Imported ${upserted} budget forecast rows`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
