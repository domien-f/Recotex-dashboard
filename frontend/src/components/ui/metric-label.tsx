import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getMetricInfo } from "@/lib/metric-info";

interface MetricLabelProps {
  code: string;
  className?: string;
}

export function MetricLabel({ code, className }: MetricLabelProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const info = getMetricInfo(code);

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
          <div className="max-w-xs rounded-lg border border-border/60 bg-white px-3 py-2 shadow-xl">
            <div className="text-xs font-semibold text-foreground whitespace-normal">{info.label}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground whitespace-normal leading-relaxed">{info.description}</div>
            {info.formula && <div className="mt-1.5 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70 whitespace-normal">{info.formula}</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
