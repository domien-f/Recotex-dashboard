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
      lower.includes("ingepland") || lower.includes("negotiatie") ||
      lower.includes("technisch gevalideerd") || lower.includes("technisch geblokkeerd")) return "APPOINTMENT";

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
  return `${title}||${email}`;
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

  // Build lookup of existing deals (by title + email) for upsert
  const existingDeals = await prisma.deal.findMany({
    select: { id: true, title: true, contact: { select: { email: true } } },
  });
  const existingDealMap = new Map<string, string>();
  for (const d of existingDeals) {
    const key = `${d.title || ""}||${(d.contact?.email || "").toLowerCase()}`;
    existingDealMap.set(key, d.id);
  }

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
        // Dedup on email; never overwrite webhook-fresh fields
        const found = await prisma.contact.findUnique({ where: { email }, select: { id: true, source: true } });
        if (found) {
          if (found.source !== "webhook") {
            contact = await prisma.contact.update({
              where: { id: found.id },
              data: { phone: data.phone || undefined, name: data.name || undefined, source: "excel", lastSyncedAt: new Date() },
            });
          } else {
            // Webhook-managed contact — only refresh lastSyncedAt to acknowledge we saw it
            contact = await prisma.contact.update({ where: { id: found.id }, data: { lastSyncedAt: new Date() } });
          }
        } else {
          contact = await prisma.contact.create({ data: { ...data, email, source: "excel", lastSyncedAt: new Date() } });
        }
      } else {
        contact = await prisma.contact.create({ data: { ...data, email: null, source: "excel", lastSyncedAt: new Date() } });
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

  // Upsert deals — create new, update existing
  console.log("Upserting deals...");
  let created = 0;
  let updated = 0;
  let dealErrors = 0;

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

      const wonAt = excelDateToJS(row["Datum gewonnen"]);
      const effectiveWonAt = status === "WON" ? (wonAt || dealCreatedAt) : null;

      const reclamatieRedenen = parseReclamatieRedenen(
        row["Reclamatie redenen"] ? String(row["Reclamatie redenen"]) : null
      );

      let herkomst = row["Herkomst (verplicht)"] ? String(row["Herkomst (verplicht)"]).trim() : null;
      if (herkomst === "Google Leads") herkomst = "Eigen lead medewerker";

      // Skip non-lead entries like "EXTRA WERKEN"
      if (herkomst === "EXTRA WERKEN") continue;

      const dealData = {
        contactId,
        title,
        phase: fase,
        status,
        herkomst,
        typeWerken: row["Type werken"] ? String(row["Type werken"]).trim() : null,
        reclamatieRedenen,
        verantwoordelijke: row["Verantwoordelijke"] ? String(row["Verantwoordelijke"]).trim() : null,
        revenue: revenue != null && revenue > 0 ? revenue : null,
        probability: slaagkans,
        wonAt: effectiveWonAt,
        dealCreatedAt,
      };

      const checkKey = `${title || ""}||${(email || "").toLowerCase()}`;
      const existingId = existingDealMap.get(checkKey);

      // Cross-source dedup key — must match what teamleaderWebhook.dealExternalRef computes.
      // Re-imports will collide on this key, AND TL webhooks for the same deal will
      // match this row (and set teamleaderId), so no duplicate ever appears.
      const { dealExternalRef } = await import("../services/teamleaderWebhook.js");
      const externalRef = dealExternalRef(title, email, dealCreatedAt);

      if (existingId && existingId !== "new") {
        // Skip overwriting webhook-fresh rows — Excel respects webhook truth
        const existing = await prisma.deal.findUnique({ where: { id: existingId }, select: { source: true } });
        if (existing?.source !== "webhook") {
          await prisma.deal.update({
            where: { id: existingId },
            data: { ...dealData, externalRef, source: "excel", lastSyncedAt: new Date() },
          });
        } else {
          await prisma.deal.update({ where: { id: existingId }, data: { externalRef, lastSyncedAt: new Date() } });
        }
        updated++;
      } else if (!existingId) {
        // Last guard: try matching by externalRef before insert (in case the same
        // deal already exists from a webhook arriving before this Excel import)
        const byRef = await prisma.deal.findUnique({ where: { externalRef }, select: { id: true, source: true } });
        if (byRef) {
          if (byRef.source !== "webhook" && byRef.source !== "manual") {
            await prisma.deal.update({
              where: { id: byRef.id },
              data: { ...dealData, externalRef, source: "excel", lastSyncedAt: new Date() },
            });
          } else {
            await prisma.deal.update({ where: { id: byRef.id }, data: { lastSyncedAt: new Date() } });
          }
          existingDealMap.set(checkKey, byRef.id);
          updated++;
        } else {
          await prisma.deal.create({ data: { ...dealData, externalRef, source: "excel", lastSyncedAt: new Date() } });
          existingDealMap.set(checkKey, "new"); // Prevent duplicates within same import
          created++;
        }
      }
      if ((created + updated) % 500 === 0) console.log(`  ${created} created, ${updated} updated...`);
    } catch (e: any) {
      dealErrors++;
      if (dealErrors <= 5) console.error(`Deal error:`, e.message);
    }
  }

  // ─── Sync appointments from deal phases ────────────────────────────────
  // CRITICAL: do NOT wipe appointments — webhook-written rows must survive
  // re-imports. We upsert by externalRef = sha1(dealId + scheduledAt-minute)
  // so re-running the same Excel file is idempotent.
  console.log("Syncing appointments from deal phases (preserving webhook + manual rows)...");

  const APPOINTMENT_PHASES = [
    'Meeting gepland', 'Negotiatie', 'Opvolging adviseur',
    'Aanvaard', 'Technisch Gevalideerd', 'Technisch Geblokkeerd', 'Voorschot verstuurd', 'Voorschotfactuur betaald',
    'Offerte verzonden', 'Ingepland', 'Eindfactuur verstuurd',
    'Tweede voorschotfactuur verstuurd', 'Tweede voorschotfactuur betaald', 'Afsluit dossier',
    'Geweigerd',
  ];

  // 1 appointment per unique contact (earliest deal in appointment phase)
  const appointmentDeals = await prisma.$queryRaw<{ id: string; deal_created_at: Date; herkomst: string | null; title: string | null }[]>`
    SELECT DISTINCT ON (contact_id) id, deal_created_at, herkomst, title
    FROM deals
    WHERE phase = ANY(${APPOINTMENT_PHASES})
    ORDER BY contact_id, deal_created_at ASC
  `;

  const { createHash } = await import("node:crypto");
  const externalRefFor = (dealId: string, scheduledAt: Date) => {
    const m = new Date(scheduledAt);
    m.setSeconds(0, 0);
    return createHash("sha1").update(`${dealId}|${m.toISOString()}`).digest("hex");
  };

  let apptCreated = 0;
  let apptUpdated = 0;
  let apptSkippedWebhook = 0;
  for (const d of appointmentDeals) {
    if (!d.deal_created_at) continue;
    const externalRef = externalRefFor(d.id, d.deal_created_at);

    // Look up by externalRef (Excel-style key)
    const existing = await prisma.appointment.findUnique({
      where: { externalRef },
      select: { id: true, source: true },
    });

    if (existing) {
      if (existing.source === "webhook" || existing.source === "manual") {
        // Hands off — webhook/manual owns this row
        apptSkippedWebhook++;
        continue;
      }
      await prisma.appointment.update({
        where: { id: existing.id },
        data: {
          dealId: d.id,
          date: d.deal_created_at,
          scheduledAt: d.deal_created_at,
          channel: d.herkomst,
          notes: d.title,
          source: "excel",
          lastSyncedAt: new Date(),
        },
      });
      apptUpdated++;
    } else {
      await prisma.appointment.create({
        data: {
          dealId: d.id,
          date: d.deal_created_at,
          scheduledAt: d.deal_created_at,
          channel: d.herkomst,
          notes: d.title,
          externalRef,
          source: "excel",
          lastSyncedAt: new Date(),
        },
      });
      apptCreated++;
    }
  }

  console.log(`  Appointments: ${apptCreated} created, ${apptUpdated} updated, ${apptSkippedWebhook} skipped (webhook/manual)`);

  console.log(`\nImport complete: ${created} created, ${updated} updated, ${contactCount} contacts, ${dealErrors} errors, ${appointmentDeals.length} appointments`);
  return { contacts: contactCount, deals: created + updated, skipped: 0, errors: dealErrors };
}

// ─── Afspraken import ───

export async function importAfspraken(filePath: string): Promise<{ appointments: number; skipped: number; errors: number }> {
  console.log("Reading afspraken Excel:", filePath);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);

  console.log(`Total afspraken rows: ${rows.length}`);

  // Build lookup: find deals by title + email
  const allDeals = await prisma.deal.findMany({
    select: { id: true, title: true, herkomst: true, dealCreatedAt: true, contact: { select: { email: true } } },
  });

  // Map: "title||email" -> deal
  const dealLookup = new Map<string, { id: string; herkomst: string | null; dealCreatedAt: Date | null }>();
  for (const d of allDeals) {
    const key = `${(d.title || "").trim().toLowerCase()}||${(d.contact?.email || "").toLowerCase()}`;
    dealLookup.set(key, { id: d.id, herkomst: d.herkomst, dealCreatedAt: d.dealCreatedAt });
  }

  // Get existing appointments to dedup
  const existingAppointments = await prisma.appointment.findMany({
    select: { dealId: true, date: true },
  });
  const existingSet = new Set(
    existingAppointments.map((a) => `${a.dealId}||${a.date.toISOString()}`)
  );

  let appointments = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const title = row["Titel"] ? String(row["Titel"]).trim() : null;
      const email = row["Klant: E-mail"] ? String(row["Klant: E-mail"]).trim().toLowerCase() : "";
      const datumRaw = row["Datum toegevoegd"];
      const date = excelDateToJS(datumRaw);

      if (!title || !date) {
        errors++;
        continue;
      }

      // Look up deal
      const lookupKey = `${title.toLowerCase()}||${email}`;
      const deal = dealLookup.get(lookupKey);

      if (!deal) {
        skipped++;
        continue;
      }

      // Dedup: skip if appointment already exists for this deal on this date
      const dedupKey = `${deal.id}||${date.toISOString()}`;
      if (existingSet.has(dedupKey)) {
        skipped++;
        continue;
      }

      const herkomst = row["Herkomst (verplicht)"] ? String(row["Herkomst (verplicht)"]).trim() : deal.herkomst;

      // Idempotent: upsert by externalRef so re-imports don't create duplicates,
      // and leave webhook/manual rows untouched.
      const refMin = new Date(date);
      refMin.setSeconds(0, 0);
      const { createHash } = await import("node:crypto");
      const externalRef = createHash("sha1").update(`${deal.id}|${refMin.toISOString()}`).digest("hex");

      const found = await prisma.appointment.findUnique({ where: { externalRef }, select: { id: true, source: true } });
      if (found) {
        if (found.source !== "webhook" && found.source !== "manual") {
          await prisma.appointment.update({
            where: { id: found.id },
            data: { dealId: deal.id, date, scheduledAt: deal.dealCreatedAt, channel: herkomst, notes: title, source: "excel", lastSyncedAt: new Date() },
          });
        }
      } else {
        await prisma.appointment.create({
          data: {
            dealId: deal.id,
            date,
            scheduledAt: deal.dealCreatedAt,
            channel: herkomst,
            notes: title,
            externalRef,
            source: "excel",
            lastSyncedAt: new Date(),
          },
        });
      }

      appointments++;
      existingSet.add(dedupKey);
      if (appointments % 200 === 0) console.log(`  ${appointments} appointments created...`);
    } catch (e: any) {
      errors++;
      if (errors <= 5) console.error(`Appointment error:`, e.message);
    }
  }

  console.log(`\nAfspraken import complete: ${appointments} appointments, ${skipped} skipped, ${errors} errors`);
  return { appointments, skipped, errors };
}

// CLI mode
if (require.main === module) {
  const type = process.argv[2] || "deals";
  const filePath = process.argv[3] || process.argv[2];

  if (type === "afspraken") {
    importAfspraken(filePath)
      .then(() => prisma.$disconnect())
      .catch((e) => { console.error("Import failed:", e); prisma.$disconnect(); process.exit(1); });
  } else {
    importFromExcel(filePath)
      .then(() => prisma.$disconnect())
      .catch((e) => { console.error("Import failed:", e); prisma.$disconnect(); process.exit(1); });
  }
}
