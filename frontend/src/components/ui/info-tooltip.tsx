import { useState, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMetricInfo, type MetricInfo } from "@/lib/metric-info";

type Tip = MetricInfo | string;

interface TooltipBodyProps {
  tip: Tip;
  pos: { x: number; y: number };
}

function TooltipBody({ tip, pos }: TooltipBodyProps) {
  const isString = typeof tip === "string";
  return createPortal(
    <div
      style={{ left: pos.x, top: pos.y }}
      className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2"
    >
      <div className="max-w-xs rounded-lg border border-border/60 bg-white px-3 py-2 shadow-xl">
        {isString ? (
          <div className="text-[11px] text-foreground/80 whitespace-normal leading-relaxed">{tip}</div>
        ) : (
          <>
            <div className="text-xs font-semibold text-foreground whitespace-normal">{tip.label}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground whitespace-normal leading-relaxed">{tip.description}</div>
            {tip.formula && (
              <div className="mt-1.5 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70 whitespace-normal">
                {tip.formula}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

interface InfoTooltipProps {
  /** Pre-defined metric code from METRIC_INFO registry */
  code?: string;
  /** Or pass a custom string description */
  text?: string;
  /** Or pass a full info object */
  info?: MetricInfo;
  /** Use compact (info icon) or wrap children */
  children?: ReactNode;
  className?: string;
  iconClassName?: string;
}

export function InfoTooltip({ code, text, info, children, className, iconClassName }: InfoTooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const tip: Tip | undefined = info || (code ? getMetricInfo(code) : undefined) || text;

  const handleEnter = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  }, []);

  if (!tip) {
    return children ? <span className={className}>{children}</span> : null;
  }

  return (
    <>
      <span
        ref={ref}
        className={cn("inline-flex items-center gap-1", className)}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        {children ? (
          <span className="cursor-help border-b border-dashed border-current/40">{children}</span>
        ) : (
          <Info className={cn("h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground", iconClassName)} />
        )}
      </span>
      {show && <TooltipBody tip={tip} pos={pos} />}
    </>
  );
}
