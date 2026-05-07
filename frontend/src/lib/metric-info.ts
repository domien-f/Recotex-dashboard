export interface MetricInfo {
  label: string;
  description: string;
  formula?: string;
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  // Acquisition cost / efficiency metrics
  CPL: { label: "Cost Per Lead", description: "Gemiddelde kost per binnengekregen lead", formula: "Totale kost ÷ Aantal leads" },
  KPA: { label: "Kost Per Afspraak", description: "Gemiddelde kost per gemaakte afspraak", formula: "Totale kost ÷ Aantal afspraken" },
  COA: { label: "Cost Of Acquisition", description: "Gemiddelde kost per gewonnen deal", formula: "Totale kost ÷ Aantal gewonnen deals" },
  ROI: { label: "Return On Investment", description: "Hoeveel euro omzet je krijgt per euro kost", formula: "Totale omzet ÷ Totale kost" },
  "K/O": { label: "Kost vs Omzet", description: "Welk percentage van de omzet opgaat aan kost", formula: "(Totale kost ÷ Totale omzet) × 100%" },

  // Conversion metrics
  "Win%": { label: "Win Percentage", description: "Percentage deals dat gewonnen wordt", formula: "(Gewonnen deals ÷ Totaal deals) × 100%" },
  "Afspraak Win%": { label: "Afspraak Win Rate", description: "Percentage afspraken dat tot een gewonnen deal leidt", formula: "(Won afspraken ÷ Totaal afspraken) × 100%" },
  "Lead → Afspraak": { label: "Lead → Afspraak conversie", description: "Percentage leads dat omgezet wordt naar een afspraak", formula: "(Afspraken ÷ Leads) × 100%" },
  "Afspraak → Won": { label: "Afspraak → Won conversie", description: "Percentage afspraken dat resulteert in een verkoop", formula: "(Won deals ÷ Afspraken) × 100%" },
  "Afspraak → Offerte": { label: "Afspraak → Offerte conversie", description: "Percentage afspraken waarna een offerte verzonden wordt", formula: "(Offertes ÷ Afspraken) × 100%" },
  "Offerte → Won": { label: "Offerte → Won conversie", description: "Percentage verzonden offertes dat gewonnen wordt", formula: "(Won deals ÷ Offertes) × 100%" },
  "Lead → Won": { label: "Lead → Won conversie", description: "Percentage leads dat uiteindelijk een verkoop wordt", formula: "(Won deals ÷ Leads) × 100%" },

  // Result / revenue metrics
  Netto: { label: "Netto Resultaat", description: "Winst na aftrek van marketingkost", formula: "Totale omzet − Totale kost" },
  "Gem.Omzet": { label: "Gemiddelde Omzet per Deal", description: "Gemiddelde opbrengst per gewonnen deal", formula: "Totale omzet ÷ Aantal gewonnen deals" },
  "Omzet/Afspraak": { label: "Omzet per Afspraak", description: "Gemiddelde opbrengst per gemaakte afspraak", formula: "Totale omzet ÷ Aantal afspraken" },
  "Omzet/Offerte": { label: "Omzet per Offerte", description: "Gemiddelde opbrengst per verzonden offerte", formula: "Totale omzet ÷ Aantal offertes" },

  // Quality
  "Recl.%": { label: "Reclamatie Percentage", description: "Percentage contacten met een reclamatie (gewonnen deals niet meegerekend)", formula: "(Reclamatie contacten ÷ Totaal contacten) × 100%" },
  Kwaliteit: { label: "Lead Kwaliteit", description: "Percentage van de leads dat als bruikbaar beschouwd wordt", formula: "100% − Reclamatie %" },
  "Annulatie%": { label: "Annulatie Percentage", description: "Percentage afspraken dat geannuleerd werd", formula: "(Geannuleerde afspraken ÷ Totaal afspraken) × 100%" },

  // Cycle / speed
  Doorlooptijd: { label: "Gemiddelde Doorlooptijd", description: "Gemiddeld aantal dagen tussen aanmaak van de lead en winnen van de deal", formula: "Σ(Won datum − Aanmaakdatum) ÷ Aantal won deals" },
  "Speed-to-Afspraak": { label: "Speed-to-Afspraak", description: "Gemiddelde tijd tussen lead en eerste afspraak", formula: "Σ(Eerste afspraak − Lead aanmaak) ÷ Aantal afspraken" },

  // Source mix
  "Eigen%": { label: "Eigen Leads Percentage", description: "Aandeel leads dat afkomstig is uit eigen kanalen (geen ad spend)", formula: "(Eigen leads ÷ Totaal leads) × 100%" },

  // Plain terms
  Lead: { label: "Lead", description: "Een binnengekomen aanvraag of contact, ongeacht de status." },
  Deal: { label: "Deal", description: "Een verkoopkans gekoppeld aan een contact in Teamleader." },
  Afspraak: { label: "Afspraak", description: "Een ingeplande verkoopafspraak (huisbezoek of meeting)." },
  Won: { label: "Won deal", description: "Een deal die effectief gewonnen werd (verkocht)." },
  Lost: { label: "Lost deal", description: "Een deal die verloren is gegaan." },
  Reclamatie: { label: "Reclamatie", description: "Een klacht of probleem na verkoop (kwaliteits-indicator)." },
  Offerte: { label: "Offerte", description: "Een prijsvoorstel dat verzonden is naar de klant." },
  Verantwoordelijke: { label: "Verantwoordelijke", description: "De interne verkoper die de deal opvolgt." },
  Herkomst: { label: "Herkomst (kanaal)", description: "Hoe deze lead bij ons binnengekomen is (Meta, Google, Solvari, Website, Referentie...)." },
  Kanaal: { label: "Kanaal", description: "Marketingkanaal waaruit deze lead afkomstig is." },
  "Type werken": { label: "Type werken", description: "Soort werk waarvoor de klant een aanvraag indient (vb. dakwerken, gevelreiniging...)." },
  Fase: { label: "Fase", description: "Huidige stap in het verkoopproces (bv. Eerste contact, Offerte, Won...)." },
  Status: { label: "Status", description: "Algemene toestand van de deal: NEW, QUALIFIED, APPOINTMENT, WON of LOST." },
  Geschat: { label: "Geschatte waarde", description: "Voor deze periode ontbreken nog facturen — een deel van de kost is geschat op basis van gemiddelden." },
  "Gratis kanaal": { label: "Gratis (eigen) kanaal", description: "Dit kanaal heeft geen direct toewijsbare advertentiekost — CPL/KPA/ROI zijn niet van toepassing (NVT)." },

  // Status badges
  NEW: { label: "Status: NEW", description: "Nieuwe lead, nog niet gekwalificeerd." },
  QUALIFIED: { label: "Status: QUALIFIED", description: "Lead is opgevolgd en als geschikt beoordeeld." },
  APPOINTMENT: { label: "Status: APPOINTMENT", description: "Er staat een afspraak ingepland voor deze lead." },
  WON: { label: "Status: WON", description: "Verkoop is rond — deal gewonnen." },
  LOST: { label: "Status: LOST", description: "Deal is verloren gegaan." },

  // Date modes
  "Datum: aanmaak": { label: "Datum-modus: aanmaak", description: "Filter op datum waarop de deal aangemaakt werd in Teamleader." },
  "Datum: won": { label: "Datum-modus: won", description: "Filter op datum waarop de deal effectief gewonnen werd." },

  // Costs / forecast
  "Forecast": { label: "Budget Forecast", description: "Voorspelling van budget en verwachte omzet voor toekomstige periodes." },
  "Pacing": { label: "Pacing", description: "Hoe snel het budget verbrand wordt vergeleken met het einde van de periode." },
  "Run-rate": { label: "Run-rate", description: "Geprojecteerde eindwaarde als de huidige snelheid behouden blijft." },
};

export function getMetricInfo(code: string): MetricInfo | undefined {
  return METRIC_INFO[code];
}
