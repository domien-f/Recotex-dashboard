import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Upload, FileText, CheckCircle, XCircle, Loader2, Pencil, Trash2, X, AlertTriangle } from "lucide-react";

interface Invoice {
  id: string;
  filename: string;
  vendor?: string;
  channel?: string;
  totalAmount?: number;
  date?: string;
  status: string;
  parsedData?: any;
  createdAt: string;
  uploader?: { name: string };
}

const STATUS_BADGE: Record<string, { variant: "default" | "success" | "warning" | "destructive" | "outline"; label: string }> = {
  PENDING: { variant: "warning", label: "Verwerken..." },
  PARSED: { variant: "default", label: "Te reviewen" },
  CONFIRMED: { variant: "success", label: "Bevestigd" },
  ERROR: { variant: "destructive", label: "Fout" },
};

const CHANNELS = [
  "Solvari", "Red Pepper", "Renocheck", "PPA", "Bis Beurs",
  "Bouw En Reno", "Offertevergelijker", "Serieus Verbouwen",
  "META Leads", "GOOGLE", "Website", "Eigen lead medewerker",
  "Jaimy", "Fourvision", "Giga Leads", "Reactivatie", "Overig",
];

export function InvoicesPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: async () => (await api.get("/invoices")).data,
    refetchInterval: 5000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return (await api.post("/invoices/upload", formData)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setUploadError(null);
    },
    onError: (err: any) => {
      setUploadError(err.response?.data?.error || "Upload mislukt");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ id, channel }: { id: string; channel: string }) => {
      return (await api.post(`/invoices/${id}/confirm`, { channel })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      setEditInvoice(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return (await api.patch(`/invoices/${id}`, data)).data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setEditInvoice(updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/invoices/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setEditInvoice(null);
    },
  });

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    setUploadError(null);
    for (let i = 0; i < files.length; i++) uploadMutation.mutate(files[i]);
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Facturen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Upload facturen — Claude AI parsed automatisch de kosten</p>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardContent className="p-6">
          <div
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className={`h-8 w-8 mb-3 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
            <p className="text-sm font-medium text-foreground">Sleep facturen hierheen</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG of PNG — max 10MB — duplicaten worden gedetecteerd</p>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
            <Button variant="outline" size="sm" className="mt-4" onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? "Uploading..." : "Of klik om te selecteren"}
            </Button>
          </div>
          {uploadError && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <XCircle className="h-4 w-4 flex-shrink-0" /> {uploadError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Card>
        <CardHeader><CardTitle>Facturen ({invoices?.length || 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden...</div>
          ) : invoices && invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bestand</th>
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vendor</th>
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kanaal</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bedrag</th>
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periode</th>
                    <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const badge = STATUS_BADGE[inv.status] || { variant: "outline" as const, label: inv.status };
                    const parsed = inv.parsedData as any;
                    const warnings = parsed?.warnings as string[] || [];
                    const hasWarnings = warnings.length > 0;
                    const dateRange = parsed?.dateRangeFrom && parsed?.dateRangeTo
                      ? `${parsed.dateRangeFrom} → ${parsed.dateRangeTo}`
                      : null;

                    return (
                      <tr key={inv.id} className={`border-b border-border/30 hover:bg-muted/50 ${hasWarnings && inv.status !== "CONFIRMED" ? "bg-warning/5" : ""}`}>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <span className="font-medium text-foreground">{inv.filename}</span>
                              {hasWarnings && inv.status !== "CONFIRMED" && (
                                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-warning">
                                  <AlertTriangle className="h-3 w-3" />
                                  {warnings[0]}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">{inv.vendor || "-"}</td>
                        <td className="py-3">{inv.channel ? <Badge variant="outline">{inv.channel}</Badge> : "-"}</td>
                        <td className="py-3 text-right font-medium tabular-nums">{inv.totalAmount ? formatCurrency(inv.totalAmount) : "-"}</td>
                        <td className="py-3 text-xs text-muted-foreground">{dateRange || <span className="text-warning">Geen periode</span>}</td>
                        <td className="py-3">
                          <Badge variant={badge.variant}>
                            {inv.status === "PENDING" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {inv.status === "CONFIRMED" && <CheckCircle className="mr-1 h-3 w-3" />}
                            {inv.status === "ERROR" && <XCircle className="mr-1 h-3 w-3" />}
                            {hasWarnings && inv.status === "PARSED" && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditInvoice(inv)} title="Bewerken">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Factuur verwijderen?")) deleteMutation.mutate(inv.id); }} className="text-destructive hover:text-destructive" title="Verwijderen">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Nog geen facturen geüpload</p>
          )}
        </CardContent>
      </Card>

      {/* Edit/Review Modal */}
      {editInvoice && (
        <EditModal
          invoice={editInvoice}
          onClose={() => setEditInvoice(null)}
          onConfirm={(channel) => confirmMutation.mutate({ id: editInvoice.id, channel })}
          onUpdate={(data) => updateMutation.mutate({ id: editInvoice.id, data })}
          onDelete={() => { if (confirm("Factuur verwijderen?")) deleteMutation.mutate(editInvoice.id); }}
          confirming={confirmMutation.isPending}
          saving={updateMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Edit/Review Modal ───

function EditModal({ invoice, onClose, onConfirm, onUpdate, onDelete, confirming, saving }: {
  invoice: Invoice;
  onClose: () => void;
  onConfirm: (channel: string) => void;
  onUpdate: (data: any) => void;
  onDelete: () => void;
  confirming: boolean;
  saving: boolean;
}) {
  const parsed = invoice.parsedData as any;
  const warnings = parsed?.warnings as string[] || [];

  const [vendor, setVendor] = useState(invoice.vendor || "");
  const [amount, setAmount] = useState(String(invoice.totalAmount || ""));
  const [channel, setChannel] = useState(invoice.channel || "Overig");
  const [date, setDate] = useState(invoice.date ? invoice.date.slice(0, 10) : "");
  const [rangeFrom, setRangeFrom] = useState(parsed?.dateRangeFrom || "");
  const [rangeTo, setRangeTo] = useState(parsed?.dateRangeTo || "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onUpdate({
      vendor,
      totalAmount: parseFloat(amount) || 0,
      channel,
      date: date || undefined,
      parsedData: { ...parsed, dateRangeFrom: rangeFrom || undefined, dateRangeTo: rangeTo || undefined, warnings },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-2xl rounded-md border border-border/60 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">Factuur Bewerken</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        {/* File info */}
        <div className="mb-4 rounded-md border border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{invoice.filename}</span>
            <Badge variant={STATUS_BADGE[invoice.status]?.variant || "outline"}>{STATUS_BADGE[invoice.status]?.label || invoice.status}</Badge>
            {parsed?.confidence && <span className="text-xs text-muted-foreground">{parsed.confidence}% zeker</span>}
          </div>
          {parsed?.description && <p className="mt-1 text-xs text-muted-foreground">{parsed.description}</p>}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm font-semibold text-warning">Waarschuwingen</span>
            </div>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-warning/80 ml-6">• {w}</p>
            ))}
          </div>
        )}

        {/* Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Vendor</label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Bedrag (excl BTW)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">€</span>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Kanaal</label>
            <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Factuurdatum</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Periode van {!rangeFrom && <span className="text-warning font-normal">(ontbreekt!)</span>}
            </label>
            <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Periode tot {!rangeTo && <span className="text-warning font-normal">(ontbreekt!)</span>}
            </label>
            <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Verwijderen
          </Button>
          <div className="flex gap-2 items-center">
            {saved && <span className="text-xs text-success">Opgeslagen</span>}
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
            {invoice.status !== "CONFIRMED" && (
              <Button size="sm" onClick={() => { handleSave(); setTimeout(() => onConfirm(channel), 500); }} disabled={confirming || !amount || !channel}>
                {confirming ? "Bevestigen..." : "Bevestigen & Kost Aanmaken"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
