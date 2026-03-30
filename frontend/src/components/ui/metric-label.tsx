import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

const METRIC_INFO: Record<string, { label: string; description: string }> = {
  CPL: { label: "Cost Per Lead", description: "Totale kost / aantal leads" },
  KPA: { label: "Kost Per Afspraak", description: "Totale kost / aantal afspraken" },
  COA: { label: "Cost Of Acquisition", description: "Totale kost / gewonnen deals" },
  ROI: { label: "Return On Investment", description: "Omzet / totale kost" },
  "K/O": { label: "Kost vs Omzet", description: "Kost / Omzet x 100%" },
  "Win%": { label: "Win Percentage", description: "Gewonnen / totaal x 100%" },
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
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
