import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilterStore } from "@/store/filterStore";
import api from "@/lib/api";
import type { Deal } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { exportCSV } from "@/lib/export";
import { Download } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "outline"> = {
  NEW: "default",
  QUALIFIED: "warning",
  APPOINTMENT: "outline",
  WON: "success",
  LOST: "destructive",
};

export function LeadsPage() {
  const { dateFrom, dateTo, channel, status, typeWerken, verantwoordelijke } = useFilterStore();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params: Record<string, any> = { dateFrom, dateTo, search, page, limit: 25 };
  if (channel) params.herkomst = channel;
  if (status) params.status = status;
  if (typeWerken) params.typeWerken = typeWerken;
  if (verantwoordelijke) params.verantwoordelijke = verantwoordelijke;

  const { data, isLoading } = useQuery({
    queryKey: ["deals", dateFrom, dateTo, channel, status, typeWerken, verantwoordelijke, search, page],
    queryFn: async () => {
      const res = await api.get("/deals", { params });
      return res.data as { deals: Deal[]; total: number };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Leads</h2>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => {
            if (!data?.deals) return;
            exportCSV("leads", ["Naam", "Email", "Herkomst", "Status", "Type Werken", "Omzet", "Datum"],
              data.deals.map((d) => [d.contact?.name || d.title || "", d.contact?.email || "", d.herkomst || "", d.status, d.typeWerken || "", d.revenue || 0, d.dealCreatedAt?.slice(0, 10) || ""])
            );
          }}><Download className="mr-1.5 h-3.5 w-3.5" />CSV</Button>
          <Input
            placeholder="Zoeken op naam, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-72 rounded-lg"
          />
        </div>
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Laden...</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-3 font-medium">Naam</th>
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Herkomst</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Type Werken</th>
                      <th className="pb-3 font-medium text-right">Omzet</th>
                      <th className="pb-3 font-medium">Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.deals.map((deal) => (
                      <tr key={deal.id} className="border-b border-border/50 transition-colors hover:bg-accent/50">
                        <td className="py-3 font-medium text-foreground">{deal.contact?.name || deal.title || "-"}</td>
                        <td className="py-3 text-muted-foreground">{deal.contact?.email || "-"}</td>
                        <td className="py-3">{deal.herkomst || "-"}</td>
                        <td className="py-3">
                          <Badge variant={STATUS_VARIANT[deal.status] || "default"}>{deal.status}</Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">{deal.typeWerken || "-"}</td>
                        <td className="py-3 text-right">{deal.revenue ? formatCurrency(deal.revenue) : "-"}</td>
                        <td className="py-3 text-muted-foreground">
                          {deal.dealCreatedAt ? new Date(deal.dealCreatedAt).toLocaleDateString("nl-BE") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{data?.total || 0} deals totaal</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Vorige</Button>
                  <Button variant="outline" size="sm" disabled={(data?.deals.length || 0) < 25} onClick={() => setPage(page + 1)}>Volgende</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
