import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  icon?: React.ReactNode;
  trend?: number;
  isEstimated?: boolean;
  className?: string;
  onClick?: () => void;
  formula?: { label: string; description: string; formula: string };
}

export function KpiCard({ title, value, icon, trend, isEstimated, className, onClick, formula }: KpiCardProps) {
  const [showTip, setShowTip] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const titleRef = useRef<HTMLParagraphElement>(null);

  const handleEnter = useCallback(() => {
    if (!titleRef.current || !formula) return;
    const rect = titleRef.current.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShowTip(true);
  }, [formula]);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06)]",
        onClick && "cursor-pointer hover:border-primary/40",
        className
      )}
    >
      {/* Subtle gradient accent top */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary to-gradient-end opacity-80" />

      <div className="flex items-start justify-between">
        <p
          ref={titleRef}
          className={cn("text-[13px] font-medium text-muted-foreground", formula && "cursor-help border-b border-dashed border-muted-foreground/40")}
          onMouseEnter={handleEnter}
          onMouseLeave={() => setShowTip(false)}
        >{title}</p>
        {icon && <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-light text-primary">{icon}</div>}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none tracking-tight text-foreground">{value}</span>
        {isEstimated && <Badge variant="estimated">Geschat</Badge>}
      </div>

      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1.5">
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend >= 0 ? "bg-success-light text-success" : "bg-destructive/10 text-destructive"
            )}
          >
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
          </div>
          <span className="text-[11px] text-muted-foreground">vs vorige periode</span>
        </div>
      )}

      {showTip && formula && createPortal(
        <div
          style={{ left: pos.x, top: pos.y }}
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2"
        >
          <div className="rounded-lg border border-border/60 bg-white px-3 py-2 shadow-xl">
            <div className="text-xs font-semibold text-foreground whitespace-nowrap">{formula.label}</div>
            <div className="text-[11px] text-muted-foreground whitespace-nowrap">{formula.description}</div>
            <div className="mt-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70 whitespace-nowrap">{formula.formula}</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
