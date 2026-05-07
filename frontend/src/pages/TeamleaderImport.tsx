import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { Upload, CheckCircle, XCircle, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { DataFreshnessBanner } from "@/components/dashboard/DataFreshnessBanner";

export function TeamleaderImportPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const canUpload = user?.role === "ADMIN" || user?.role === "MANAGER";

  const { data: syncLogs } = useQuery({
    queryKey: ["sync-status"],
    queryFn: async () => (await api.get("/sync/status")).data as any[],
    refetchInterval: uploading ? 3000 : false,
  });

  const latestImport = syncLogs?.find((l: any) => l.source.includes("excel-import"));
  const isRunning = latestImport?.status === "RUNNING";

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setResult({ success: false, message: "Alleen .xlsx of .xls bestanden worden ondersteund." });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "deals");

      const res = await api.post("/sync/import/excel", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResult({ success: true, message: res.data.message || "Import gestart!" });

      // Poll for completion
      const logId = res.data.logId;
      const poll = setInterval(async () => {
        const logs = (await api.get("/sync/status")).data as any[];
        const entry = logs.find((l: any) => l.id === logId);
        if (entry && entry.status !== "RUNNING") {
          clearInterval(poll);
          setUploading(false);
          queryClient.invalidateQueries({ queryKey: ["sync-status"] });
          queryClient.invalidateQueries({ queryKey: ["deals"] });
          queryClient.invalidateQueries({ queryKey: ["metrics"] });

          if (entry.status === "SUCCESS") {
            setResult({ success: true, message: `Import voltooid: ${entry.recordsSynced} deals verwerkt. Bestaande deals zijn bijgewerkt, nieuwe deals toegevoegd.` });
          } else {
            setResult({ success: false, message: `Import mislukt: ${entry.error || "Onbekende fout"}` });
          }
        }
      }, 3000);
    } catch (e: any) {
      setUploading(false);
      setResult({ success: false, message: e.response?.data?.error || "Upload mislukt" });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  if (!canUpload) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Je hebt geen toegang tot deze pagina.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Teamleader Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload een Teamleader Excel export voor de baseline. Daarna nemen webhooks het over.
        </p>
      </div>

      <DataFreshnessBanner />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Excel Upload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Hoe werkt het?</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Exporteer deals vanuit Teamleader als Excel (.xlsx)</li>
                <li>Zorg dat de kolommen <strong>Titel, Klant: E-mail, Fase, Herkomst, Verantwoordelijke, Slaagkans (%)</strong> aanwezig zijn</li>
                <li><strong>Geen dubbele data:</strong> bestaande deals worden bijgewerkt op basis van titel + email</li>
                <li>Nieuwe deals worden automatisch toegevoegd</li>
                <li>Afspraken worden automatisch afgeleid uit deal fases</li>
              </ul>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
              } ${uploading || isRunning ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
              onClick={() => !uploading && !isRunning && document.getElementById("file-input")?.click()}
            >
              {uploading || isRunning ? (
                <>
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm font-medium text-foreground">Bezig met importeren...</p>
                  <p className="text-xs text-muted-foreground">Dit kan even duren bij grote bestanden</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Sleep je Excel hierheen</p>
                    <p className="text-xs text-muted-foreground mt-1">of klik om een bestand te kiezen</p>
                  </div>
                </>
              )}
              <input id="file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
            </div>

            {result && (
              <div className={`flex items-start gap-3 rounded-xl border p-4 ${result.success ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                {result.success ? <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" /> : <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
                <p className="text-sm">{result.message}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent imports */}
      {syncLogs && syncLogs.filter((l: any) => l.source.includes("excel")).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recente Imports</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-2">Datum</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="text-right">Records</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.filter((l: any) => l.source.includes("excel")).map((log: any) => (
                  <tr key={log.id} className="border-b border-border/20">
                    <td className="py-2.5 text-muted-foreground">{new Date(log.startedAt).toLocaleString("nl-BE")}</td>
                    <td>{log.source.replace("excel-import-", "")}</td>
                    <td>
                      {log.status === "SUCCESS" && <span className="inline-flex items-center gap-1 text-success"><CheckCircle className="h-3.5 w-3.5" /> Voltooid</span>}
                      {log.status === "FAILED" && <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" /> Mislukt</span>}
                      {log.status === "RUNNING" && <span className="inline-flex items-center gap-1 text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Bezig</span>}
                    </td>
                    <td className="text-right font-medium">{log.recordsSynced || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
