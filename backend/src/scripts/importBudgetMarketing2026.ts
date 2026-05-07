// One-shot importer for "Budgetplan Marketing 2026.xlsx" → BudgetForecast table.
//
// Layout (verified by reading the actual file):
//   Header row at index 5: ["", "", "Kolom 1", 2025, 2026, Verschil, Januari, Februari, Maart, Q1 total, April, Mei, Juni, Q2 total, Juli, Augustus, September, Q3 total, Oktober, November, December, Q4 total]
//   Category rows have category names in col 2; subcategory rows follow until a blank row.
//
// Idempotent: each (category, subcategory, month) is unique, so re-running upserts.
//
// Usage: npx tsx src/scripts/importBudgetMarketing2026.ts [path-to-xlsx]

import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";
import { existsSync } from "node:fs";

const prisma = new PrismaClient();

// Monthly column indices (0-based) — Q-totals at 9, 13, 17, 21 are skipped.
const MONTHS: Array<{ col: number; ym: string }> = [
  { col: 6, ym: "2026-01" },
  { col: 7, ym: "2026-02" },
  { col: 8, ym: "2026-03" },
  { col: 10, ym: "2026-04" },
  { col: 11, ym: "2026-05" },
  { col: 12, ym: "2026-06" },
  { col: 14, ym: "2026-07" },
  { col: 15, ym: "2026-08" },
  { col: 16, ym: "2026-09" },
  { col: 18, ym: "2026-10" },
  { col: 19, ym: "2026-11" },
  { col: 20, ym: "2026-12" },
];

// Top-level category headers — anything else in col 2 between two of these is a subcategory.
// Order matters: rows are scanned top-down.
const CATEGORY_HEADERS = new Set([
  "Lead Kanalen",
  "Beurzen",
  "Offline marketing + diverse kosten",
  "Call Centre kosten",
  "Marketing team",
  "Fees",
  "Sponsoring kosten",
  "IT-Systemen",
  // "Totaal Marketing budget" — grand total, skipped (BudgetForecast aggregates per category)
]);

const SKIP_NAMES = new Set(["Totaal Marketing budget", "x", ""]);

function num(cell: unknown): number | null {
  if (cell == null || cell === "" || cell === "-") return null;
  const n = typeof cell === "number" ? cell : parseFloat(String(cell));
  return Number.isFinite(n) ? n : null;
}

async function main() {
  // CLI override > env var > prod path inside container > local dev path
  const candidates = [
    process.argv[2],
    process.env.BUDGET_XLSX_PATH,
    "/app/backend/data/Budgetplan_Marketing_2026.xlsx",
    "./backend/data/Budgetplan_Marketing_2026.xlsx",
    "/Users/domienfovel/Documents/Dashboard/Budgetplan Marketing 2026.xlsx",
  ].filter(Boolean) as string[];
  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    console.error("Budget xlsx not found. Tried:", candidates);
    await prisma.$disconnect();
    return;
  }

  // Idempotent guard: if all 8 categories are already populated, skip silently
  // (so the Coolify entrypoint can call this on every boot).
  const alreadySeeded = await prisma.budgetForecast.findFirst({
    where: { category: "Marketing team" }, // an algemeen-only category — proves the full import has run
  });
  if (alreadySeeded) {
    console.log("Budget 2026 already imported (Marketing team rows exist) — skipping");
    await prisma.$disconnect();
    return;
  }

  console.log(`Reading ${path}…`);
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  let currentCategory: string | null = null;
  const records: Array<{ category: string; subcategory: string; month: string; amount: number; rowIndex: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r?.[2] ?? "").trim();
    if (!name || SKIP_NAMES.has(name)) {
      // Empty row terminates a category section — but we only need to track the
      // boundary if the next non-empty row is itself a header (handled below).
      continue;
    }

    if (CATEGORY_HEADERS.has(name)) {
      currentCategory = name;
      // Insert the category header row itself with subcategory="" (used by the
      // BudgetForecast comparison route as the per-category total).
      for (const m of MONTHS) {
        const v = num(r[m.col]);
        if (v !== null && v > 0) {
          records.push({ category: name, subcategory: "", month: m.ym, amount: v, rowIndex: i });
        }
      }
      continue;
    }

    if (!currentCategory) {
      console.warn(`Row ${i}: subcategory "${name}" with no parent category — skipping`);
      continue;
    }

    // Subcategory row
    for (const m of MONTHS) {
      const v = num(r[m.col]);
      if (v !== null && v !== 0) {  // include negatives (Renocheck has refunds)
        records.push({ category: currentCategory, subcategory: name, month: m.ym, amount: v, rowIndex: i });
      }
    }
  }

  console.log(`Parsed ${records.length} budget rows across ${new Set(records.map((r) => r.category)).size} categories.`);

  // Upsert
  let upserted = 0;
  for (const rec of records) {
    const monthDate = new Date(rec.month + "-01");
    await prisma.budgetForecast.upsert({
      where: { category_sub_month: { category: rec.category, subcategory: rec.subcategory, month: monthDate } },
      update: { amount: rec.amount },
      create: { category: rec.category, subcategory: rec.subcategory, month: monthDate, amount: rec.amount },
    });
    upserted++;
  }
  console.log(`Upserted ${upserted} BudgetForecast rows.`);

  // Verification — sum per category and compare to Excel category totals
  console.log("\n— Verification (sum of subcategory rows per category, all of 2026) —");
  for (const cat of CATEGORY_HEADERS) {
    const sub = await prisma.budgetForecast.aggregate({
      where: { category: cat, subcategory: { not: "" } },
      _sum: { amount: true },
    });
    const head = await prisma.budgetForecast.aggregate({
      where: { category: cat, subcategory: "" },
      _sum: { amount: true },
    });
    const subSum = Number(sub._sum.amount ?? 0);
    const headSum = Number(head._sum.amount ?? 0);
    const delta = headSum - subSum;
    const flag = Math.abs(delta) < 1 ? "✓" : `Δ ${delta.toFixed(2)}`;
    console.log(`  ${cat.padEnd(40)} subs=${subSum.toFixed(2).padStart(12)}  header=${headSum.toFixed(2).padStart(12)}  ${flag}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Import failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
