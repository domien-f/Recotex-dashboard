import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();

const IMPORT_START = new Date("2025-09-01");

function deriveStatus(fase: string, slaagkans: number): "NEW" | "QUALIFIED" | "APPOINTMENT" | "WON" | "LOST" {
  if (slaagkans >= 100) return "WON";

  const lower = (fase || "").toLowerCase();

  if (lower.includes("reclamati")) return "LOST";
  if (lower === "geweigerd") return "LOST";

  if (lower.includes("voorschotfactuur betaald") || lower === "aanvaard" ||
      lower.includes("eindfactuur") || lower.includes("klaar voor oplevering") ||
      lower.includes("nazorg") || lower.includes("afsluit dossier") ||
      lower.includes("referenties")) return "WON";

  if (lower.includes("meeting gepland") || lower.includes("offerte verzonden") ||
      lower.includes("ingepland") || lower.includes("negotiatie")) return "APPOINTMENT";

  if (lower.includes("eerste contact") || lower.includes("tweede contact") ||
      lower.includes("derde contact") || lower.includes("opvolging") ||
      lower.includes("gevalideerd")) return "QUALIFIED";

  return "NEW";
}

function parseReclamatieRedenen(value: string | null): string[] {
  if (!value || !value.trim()) return [];
  return value.split(",").map((r) => r.trim()).filter(Boolean);
}

function excelDateToJS(val: any): Date | null {
  if (!val) return null;
  if (typeof val === "number") return new Date(Math.round((val - 25569) * 86400 * 1000));
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Generate a stable dedup key from the row data
function dealKey(row: any): string {
  const title = (row["Titel"] || "").trim();
  const email = (row["Klant: E-mail"] || "").trim().toLowerCase();
  const datum = row["Datum toegevoegd"] || "";
  return `${title}||${email}||${datum}`;
}

export async function importFromExcel(filePath: string, since?: Date): Promise<{ contacts: number; deals: number; skipped: number; errors: number }> {
  const startDate = since || IMPORT_START;

  console.log("Reading Excel:", filePath);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);

  console.log(`Total rows: ${rows.length}`);

  // Filter from start date
  const filtered = rows.filter((row) => {
    const date = excelDateToJS(row["Datum toegevoegd"]);
    return date && date >= startDate;
  });

  console.log(`Rows since ${startDate.toISOString().slice(0, 10)}: ${filtered.length}`);

  // Deduplicate rows by key
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const row of filtered) {
    const key = dealKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }
  console.log(`Unique deals: ${unique.length} (${filtered.length - unique.length} duplicates in Excel)`);

  // Check which deals already exist in DB (by title + dealCreatedAt)
  const existingDeals = await prisma.deal.findMany({
    select: { title: true, dealCreatedAt: true },
  });
  const existingSet = new Set(
    existingDeals.map((d) => `${d.title || ""}||${d.dealCreatedAt?.toISOString() || ""}`)
  );

  // Create contacts
  console.log("Creating contacts...");
  const contactIdMap = new Map<string, string>();
  let contactCount = 0;

  for (const row of unique) {
    const email = row["Klant: E-mail"] ? String(row["Klant: E-mail"]).trim().toLowerCase() : null;
    const phone = row["Klant: Mobiel nummer"] || row["Klant: Telefoon"] || null;
    const name = row["Klant"] ? String(row["Klant"]).trim() : null;
    const contactKey = email || `name:${name}|phone:${phone}`;

    if (contactIdMap.has(contactKey)) continue;

    try {
      let contact;
      const data = {
        email: email || undefined,
        phone: phone ? String(phone).trim() : null,
        name,
        street: row["Klant: Straat"] ? String(row["Klant: Straat"]).trim() : null,
        postcode: row["Klant: Postcode"] ? String(row["Klant: Postcode"]).trim() : null,
        city: row["Klant: Stad"] ? String(row["Klant: Stad"]).trim() : null,
      };

      if (email) {
        contact = await prisma.contact.upsert({
          where: { email },
          create: { ...data, email },
          update: { phone: data.phone || undefined, name: data.name || undefined },
        });
      } else {
        contact = await prisma.contact.create({ data: { ...data, email: null } });
      }
      contactIdMap.set(contactKey, contact.id);
      contactCount++;
      if (contactCount % 500 === 0) console.log(`  ${contactCount} contacts processed...`);
    } catch (e: any) {
      // Contact with this email might already exist from a previous import
      if (email) {
        const existing = await prisma.contact.findUnique({ where: { email } });
        if (existing) contactIdMap.set(contactKey, existing.id);
      }
    }
  }

  console.log(`Contacts: ${contactCount}`);

  // Create deals
  console.log("Creating deals...");
  let dealCount = 0;
  let dealErrors = 0;
  let skipped = 0;

  for (const row of unique) {
    try {
      const email = row["Klant: E-mail"] ? String(row["Klant: E-mail"]).trim().toLowerCase() : null;
      const phone = row["Klant: Mobiel nummer"] || row["Klant: Telefoon"] || null;
      const name = row["Klant"] ? String(row["Klant"]).trim() : null;
      const contactKey = email || `name:${name}|phone:${phone}`;
      const contactId = contactIdMap.get(contactKey);

      if (!contactId) {
        dealErrors++;
        continue;
      }

      const fase = row["Fase"] ? String(row["Fase"]).trim() : null;
      const slaagkans = row["Slaagkans (%)"] != null ? Number(row["Slaagkans (%)"]) : 0;
      const status = deriveStatus(fase || "", slaagkans);
      const revenue = row["Bedrag zonder btw"] != null ? Number(row["Bedrag zonder btw"]) : null;
      const dealCreatedAt = excelDateToJS(row["Datum toegevoegd"]);
      const title = row["Titel"] ? String(row["Titel"]).trim() : null;

      // Skip if deal already exists
      const checkKey = `${title || ""}||${dealCreatedAt?.toISOString() || ""}`;
      if (existingSet.has(checkKey)) {
        skipped++;
        continue;
      }

      const wonRaw = row["Datum gewonnen"];
      const wonAt = excelDateToJS(wonRaw);

      const reclamatieRedenen = parseReclamatieRedenen(
        row["Reclamatie redenen"] ? String(row["Reclamatie redenen"]) : null
      );

      await prisma.deal.create({
        data: {
          contactId,
          title,
          phase: fase,
          status,
          herkomst: row["Herkomst (verplicht)"] ? String(row["Herkomst (verplicht)"]).trim() : null,
          typeWerken: row["Type werken"] ? String(row["Type werken"]).trim() : null,
          reclamatieRedenen,
          verantwoordelijke: row["Verantwoordelijke"] ? String(row["Verantwoordelijke"]).trim() : null,
          revenue: revenue != null && revenue > 0 ? revenue : null,
          probability: slaagkans,
          wonAt: status === "WON" ? wonAt : null,
          dealCreatedAt,
        },
      });

      dealCount++;
      existingSet.add(checkKey); // Prevent duplicates within same import
      if (dealCount % 500 === 0) console.log(`  ${dealCount} deals created...`);
    } catch (e: any) {
      dealErrors++;
      if (dealErrors <= 5) console.error(`Deal error:`, e.message);
    }
  }

  console.log(`\nImport complete: ${dealCount} deals, ${contactCount} contacts, ${skipped} skipped, ${dealErrors} errors`);
  return { contacts: contactCount, deals: dealCount, skipped, errors: dealErrors };
}

// CLI mode
if (require.main === module) {
  const filePath = process.argv[2] || path.resolve(__dirname, "../../../Dev info /Lead_performance_review_20-2026-03-24-15-07-56.xlsx");
  importFromExcel(filePath)
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("Import failed:", e);
      prisma.$disconnect();
      process.exit(1);
    });
}
