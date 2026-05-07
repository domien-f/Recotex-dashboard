import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DealsDrillModal, type DrillFilter } from "./DealsDrillModal";

interface DrillableNumberProps {
  filter: DrillFilter;
  children: ReactNode;
  className?: string;
  /** Whether to render as a span (inline) or button */
  as?: "span" | "button";
}

export function DrillableNumber({ filter, children, className, as = "button" }: DrillableNumberProps) {
  const [open, setOpen] = useState(false);
  const Tag: any = as;

  return (
    <>
      <Tag
        type={as === "button" ? "button" : undefined}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "cursor-pointer underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:text-primary hover:decoration-primary/60 transition-colors",
          className
        )}
        title="Klik om alle deals te zien"
      >
        {children}
      </Tag>
      {open && <DealsDrillModal filter={filter} onClose={() => setOpen(false)} />}
    </>
  );
}
