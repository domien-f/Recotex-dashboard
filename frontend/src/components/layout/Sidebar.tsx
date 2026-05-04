import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Trophy,
  CalendarCheck,
  Euro,
  Target,
  MapPin,
  FileText,
  Settings,
  TrendingUp,
  Sparkles,
  FileDown,
  Upload,
  Filter,
} from "lucide-react";

const mainNav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/leads", icon: Users, label: "Leads" },
  { to: "/reclamaties", icon: AlertTriangle, label: "Reclamaties" },
  { to: "/won", icon: Trophy, label: "Won Leads" },
  { to: "/afspraken", icon: CalendarCheck, label: "Afspraken" },
  { to: "/sales-funnel", icon: Filter, label: "Sales Funnel" },
];

const analyticsNav = [
  { to: "/kosten", icon: Euro, label: "Kosten & ROI" },
  { to: "/kpi", icon: Target, label: "KPI Targets" },
  { to: "/budget", icon: TrendingUp, label: "Budget Forecast" },
  { to: "/herkomst", icon: MapPin, label: "Lead Herkomst" },
];

const toolsNav = [
  { to: "/ai", icon: Sparkles, label: "AI Assistent" },
  { to: "/rapport", icon: FileDown, label: "Rapport Export" },
  { to: "/facturen", icon: FileText, label: "Facturen" },
  { to: "/import", icon: Upload, label: "Teamleader Import" },
  { to: "/settings", icon: Settings, label: "Instellingen" },
];

function NavSection({ label, items }: { label: string; items: typeof mainNav }) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium",
                isActive
                  ? "bg-gradient-to-r from-primary to-gradient-end text-white shadow-lg shadow-primary/20"
                  : "text-sidebar-foreground hover:bg-white/[0.06] hover:text-white"
              )
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-5">
        <img src="/Recotex_Logo.png" alt="Recotex" className="h-4 w-auto opacity-90" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <NavSection label="Overzicht" items={mainNav} />
        <NavSection label="Analytics" items={analyticsNav} />
        <NavSection label="Tools" items={toolsNav} />
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-success shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
          <p className="text-[11px] text-sidebar-foreground/50">Systeem actief</p>
        </div>
      </div>
    </aside>
  );
}
