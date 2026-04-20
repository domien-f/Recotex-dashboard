import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

const METRIC_INFO: Record<string, { label: string; description: string; formula?: string }> = {
  CPL: { label: "Cost Per Lead", description: "Kost per binnengekregen lead", formula: "Totale kost ÷ Aantal leads" },
  KPA: { label: "Kost Per Afspraak", description: "Kost per gemaakte afspraak", formula: "Totale kost ÷ Aantal afspraken" },
  COA: { label: "Cost Of Acquisition", description: "Kost per gewonnen deal", formula: "Totale kost ÷ Aantal gewonnen deals" },
  ROI: { label: "Return On Investment", description: "Hoeveel omzet per euro kost", formula: "Totale omzet ÷ Totale kost" },
  "K/O": { label: "Kost vs Omzet", description: "Percentage kost t.o.v. omzet", formula: "(Totale kost ÷ Totale omzet) × 100%" },
  "Win%": { label: "Win Percentage", description: "Percentage deals gewonnen", formula: "(Gewonnen deals ÷ Totaal deals) × 100%" },
  "Netto": { label: "Netto Resultaat", description: "Winst na aftrek van kosten", formula: "Totale omzet − Totale kost" },
  "Recl.%": { label: "Reclamatie Percentage", description: "Contacten met reclamatie (zonder WON)", formula: "(Reclamatie contacten ÷ Totaal contacten) × 100%" },
  "Kwaliteit": { label: "Lead Kwaliteit", description: "Percentage bruikbare leads", formula: "100% − Reclamatie %" },
  "Gem.Omzet": { label: "Gemiddelde Omzet per Deal", description: "Gem. opbrengst per gewonnen deal", formula: "Totale omzet ÷ Aantal gewonnen deals" },
  "Doorlooptijd": { label: "Gemiddelde Doorlooptijd", description: "Gem. dagen van lead tot won", formula: "Σ(Won datum − Aanmaakdatum) ÷ Aantal won deals" },
  "Eigen%": { label: "Eigen Leads Percentage", description: "Aandeel leads uit eigen kanalen", formula: "(Eigen leads ÷ Totaal leads) × 100%" },
  "Afspraak Win%": { label: "Afspraak Win Rate", description: "Percentage afspraken die tot deal leiden", formula: "(Won afspraken ÷ Totaal afspraken) × 100%" },
};

interface MetricLabelProps {
  code: string;
  className?: string;
}

export function MetricLabel({ code, className }: MetricLabelProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const info = METRIC_INFO[code];

  const handleEnter = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  }, []);

  if (!info) return <span className={className}>{code}</span>;

  return (
    <>
      <span
        ref={ref}
        className={`cursor-help border-b border-dashed border-current/40 ${className || ""}`}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        {code}
      </span>
      {show && createPortal(
        <div
          style={{ left: pos.x, top: pos.y }}
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2"
        >
          <div className="rounded-lg border border-border/60 bg-white px-3 py-2 shadow-xl">
            <div className="text-xs font-semibold text-foreground whitespace-nowrap">{info.label}</div>
            <div className="text-[11px] text-muted-foreground whitespace-nowrap">{info.description}</div>
            {info.formula && <div className="mt-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70 whitespace-nowrap">{info.formula}</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
