import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();

const IMPORT_START = new Date("2025-09-01");

// Map Fase + Slaagkans to DealStatus
function deriveStatus(fase: string, slaagkans: number): "NEW" | "QUALIFIED" | "APPOINTMENT" | "WON" | "LOST" {
  // Slaagkans 100% = WON
  if (slaagkans >= 100) return "WON";

  const lower = (fase || "").toLowerCase();

  // Reclamation phases
  if (lower.includes("reclamati")) return "LOST";
  if (lower === "geweigerd") return "LOST";

  // Won phases
  if (lower.includes("voorschotfactuur betaald") || lower === "aanvaard" ||
      lower.includes("eindfactuur") || lower.includes("klaar voor oplevering") ||
      lower.includes("nazorg") || lower.includes("afsluit dossier") ||
      lower.includes("referenties")) return "WON";

  // Appointment phases
  if (lower.includes("meeting gepland") || lower.includes("offerte verzonden") ||
      lower.includes("ingepland") || lower.includes("negotiatie")) return "APPOINTMENT";

  // Qualified phases
  if (lower.includes("eerste contact") || lower.includes("tweede contact") ||
      lower.includes("derde contact") || lower.includes("opvolging") ||
      lower.includes("gevalideerd")) return "QUALIFIED";

  return "NEW";
}

// Parse comma-separated reclamatie redenen into array
function parseReclamatieRedenen(value: string | null): string[] {
  if (!value || !value.trim()) return [];
  return value.split(",").map((r) => r.trim()).filter(Boolean);
}

async function main() {
  const xlsxPath = path.resolve(__dirname, "../../../Dev info /Lead_performance_review_20-2026-03-24-15-07-56.xlsx");

  console.log("Reading Excel:", xlsxPath);
  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);

  console.log(`Total rows: ${rows.length}`);

  // Filter from Sept 2025
  const filtered = rows.filter((row) => {
    const datum = row["Datum toegevoegd"];
    if (!datum) return false;
    const date = typeof datum === "number"
      ? new Date(Math.round((datum - 25569) * 86400 * 1000)) // Excel serial date
      : new Date(datum);
    return date >= IMPORT_START;
  });

  console.log(`Rows since Sept 2025: ${filtered.length}`);

  // Group by email to create contacts
  const contactMap = new Map<string, {
    email: string | null;
    phone: string | null;
    name: string | null;
    street: string | null;
    postcode: string | null;
    city: string | null;
  }>();

  // Also track deals per "no email" contacts by name+phone
  let noEmailCount = 0;

  for (const row of filtered) {
    const email = row["Klant: E-mail"] ? String(row["Klant: E-mail"]).trim().toLowerCase() : null;
    const phone = row["Klant: Mobiel nummer"] || row["Klant: Telefoon"] || null;
    const name = row["Klant"] ? String(row["Klant"]).trim() : null;

    const key = email || `no-email-${name || ""}-${phone || ""}-${noEmailCount++}`;

    if (!contactMap.has(key)) {
      contactMap.set(key, {
        email: email || null,
        phone: phone ? String(phone).trim() : null,
        name,
        street: row["Klant: Straat"] ? String(row["Klant: Straat"]).trim() : null,
        postcode: row["Klant: Postcode"] ? String(row["Klant: Postcode"]).trim() : null,
        city: row["Klant: Stad"] ? String(row["Klant: Stad"]).trim() : null,
      });
    }
  }

  console.log(`Unique contacts: ${contactMap.size}`);

  // Create contacts in DB
  console.log("Creating contacts...");
  const contactIdMap = new Map<string, string>(); // key → DB id
  let contactCount = 0;

  for (const [key, data] of contactMap) {
    try {
      let contact;
      if (data.email) {
        contact = await prisma.contact.upsert({
          where: { email: data.email },
          create: data,
          update: { phone: data.phone || undefined, name: data.name || undefined },
        });
      } else {
        contact = await prisma.contact.create({ data });
      }
      contactIdMap.set(key, contact.id);
      contactCount++;
      if (contactCount % 1000 === 0) console.log(`  ${contactCount} contacts created...`);
    } catch (e: any) {
      console.error(`Contact error for ${key}:`, e.message);
    }
  }

  console.log(`Contacts created: ${contactCount}`);

  // Create deals
  console.log("Creating deals...");
  let dealCount = 0;
  let dealErrors = 0;
  let noEmailIdx = 0;

  for (const row of filtered) {
    try {
      const email = row["Klant: E-mail"] ? String(row["Klant: E-mail"]).trim().toLowerCase() : null;
      const phone = row["Klant: Mobiel nummer"] || row["Klant: Telefoon"] || null;
      const name = row["Klant"] ? String(row["Klant"]).trim() : null;

      const key = email || `no-email-${name || ""}-${phone ? String(phone).trim() : ""}-${noEmailIdx++}`;
      const contactId = contactIdMap.get(key);
      if (!contactId) {
        dealErrors++;
        continue;
      }

      const fase = row["Fase"] ? String(row["Fase"]).trim() : null;
      const slaagkans = row["Slaagkans (%)"] != null ? Number(row["Slaagkans (%)"]) : 0;
      const status = deriveStatus(fase || "", slaagkans);

      const revenue = row["Bedrag zonder btw"] != null ? Number(row["Bedrag zonder btw"]) : null;

      // Parse datum
      const datumRaw = row["Datum toegevoegd"];
      const dealCreatedAt = typeof datumRaw === "number"
        ? new Date(Math.round((datumRaw - 25569) * 86400 * 1000))
        : datumRaw ? new Date(datumRaw) : null;

      const wonRaw = row["Datum gewonnen"];
      const wonAt = wonRaw
        ? (typeof wonRaw === "number"
            ? new Date(Math.round((wonRaw - 25569) * 86400 * 1000))
            : new Date(wonRaw))
        : null;

      const reclamatieRedenen = parseReclamatieRedenen(
        row["Reclamatie redenen"] ? String(row["Reclamatie redenen"]) : null
      );

      await prisma.deal.create({
        data: {
          contactId,
          title: row["Titel"] ? String(row["Titel"]).trim() : null,
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
      if (dealCount % 1000 === 0) console.log(`  ${dealCount} deals created...`);
    } catch (e: any) {
      dealErrors++;
      if (dealErrors <= 5) console.error(`Deal error:`, e.message);
    }
  }

  console.log(`\nImport complete:`);
  console.log(`  Contacts: ${contactCount}`);
  console.log(`  Deals: ${dealCount}`);
  console.log(`  Errors: ${dealErrors}`);

  // Print summary
  const stats = await prisma.deal.groupBy({
    by: ["herkomst"],
    _count: true,
    orderBy: { _count: { herkomst: "desc" } },
  });

  console.log(`\nDeals per herkomst:`);
  for (const s of stats) {
    console.log(`  ${(s.herkomst || "GEEN").padEnd(30)} ${s._count}`);
  }

  const statusStats = await prisma.deal.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log(`\nDeals per status:`);
  for (const s of statusStats) {
    console.log(`  ${s.status.padEnd(15)} ${s._count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Import failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
