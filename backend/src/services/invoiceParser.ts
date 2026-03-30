import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KNOWN_CHANNELS = [
  "Solvari", "Red Pepper", "Renocheck", "PPA", "Bis Beurs",
  "Bouw En Reno", "Offertevergelijker", "Serieus Verbouwen",
  "META Leads", "GOOGLE", "Website", "Eigen lead medewerker",
  "Jaimy", "Fourvision", "Giga Leads", "Reactivatie",
];

export interface ParsedInvoice {
  vendor: string;
  totalAmount: number;
  date: string; // YYYY-MM-DD
  dateRangeFrom?: string;
  dateRangeTo?: string;
  channel: string;
  description: string;
  costType: "INVOICE" | "MANUAL";
  confidence: number; // 0-100
}

export async function parseInvoice(filePath: string): Promise<ParsedInvoice> {
  const ext = path.extname(filePath).toLowerCase();
  const fileBuffer = readFileSync(filePath);
  const base64 = fileBuffer.toString("base64");

  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  if (ext === ".pdf") mediaType = "application/pdf";
  else if (ext === ".png") mediaType = "image/png";
  else if (ext === ".jpg" || ext === ".jpeg") mediaType = "image/jpeg";
  else if (ext === ".webp") mediaType = "image/webp";
  else throw new Error(`Unsupported file type: ${ext}`);

  const prompt = `Analyseer deze factuur en extraheer de volgende informatie. Retourneer ALLEEN een JSON object, geen extra tekst.

{
  "vendor": "bedrijfsnaam van de leverancier/afzender",
  "totalAmount": 1234.56,  // totaalbedrag EXCL BTW in EUR (als getal, geen string)
  "date": "YYYY-MM-DD",  // factuurdatum
  "dateRangeFrom": "YYYY-MM-DD",  // begin van de periode (als vermeld)
  "dateRangeTo": "YYYY-MM-DD",  // einde van de periode (als vermeld)
  "channel": "kanaal naam",  // kies uit deze opties: ${KNOWN_CHANNELS.join(", ")}, of "Overig"
  "description": "korte beschrijving",
  "costType": "INVOICE",  // INVOICE voor leveranciersfacturen
  "confidence": 85  // hoe zeker ben je (0-100)
}

Tips:
- "totalAmount" is het bedrag ZONDER BTW (netto bedrag). Als alleen bruto staat, trek 21% BTW eraf.
- "channel" bepaal je op basis van de leverancier: Red Pepper = online marketing bureau, Renocheck = lead platform, PPA = pay-per-appointment, Bis Beurs = beurzen, etc.
- Als je de leverancier niet kan matchen aan een kanaal, gebruik "Overig"
- dateRange is de periode waarvoor gefactureerd wordt (bijv. "januari 2026" → from: 2026-01-01, to: 2026-01-31)`;

  const contentBlocks: any[] = [];
  if (mediaType === "application/pdf") {
    contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
  } else {
    contentBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data: base64 } });
  }
  contentBlocks.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned no JSON: " + text.slice(0, 200));

  const parsed = JSON.parse(jsonMatch[0]) as ParsedInvoice;

  // Validate required fields
  if (!parsed.vendor) throw new Error("Missing vendor in parsed result");
  if (!parsed.totalAmount && parsed.totalAmount !== 0) throw new Error("Missing totalAmount");
  if (!parsed.date) throw new Error("Missing date");

  // Normalize channel
  if (!KNOWN_CHANNELS.includes(parsed.channel)) {
    parsed.channel = "Overig";
  }

  return parsed;
}
