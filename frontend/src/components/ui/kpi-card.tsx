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
}

export function KpiCard({ title, value, icon, trend, isEstimated, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06)]",
        className
      )}
    >
      {/* Subtle gradient accent top */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary to-gradient-end opacity-80" />

      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
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
    </div>
  );
}
