import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import {
  Link2, Unlink, RefreshCw, CheckCircle, XCircle, Clock, Loader2,
  Users, Shield, UserPlus, Trash2, Key, Plug, Target, Euro,
} from "lucide-react";

// ─── Types ───

interface PlatformStatus {
  platform: string;
  connected: boolean;
  configType?: string;
  expiresAt: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  lastSync: {
    status: string;
    recordsSynced: number;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
  } | null;
  lastCostUpdate?: { updatedAt: string; source: string } | null;
}

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  teamleader: "Teamleader Focus",
  meta: "Meta Ads",
  solvari: "Solvari",
  google: "Google Ads",
  tiktok: "TikTok Ads",
};

const PLATFORM_DESCRIPTIONS: Record<string, string> = {
  teamleader: "Synchroniseer deals en afspraken vanuit Teamleader Focus CRM",
  meta: "Importeer campagne data en ad spend van Facebook & Instagram",
  solvari: "Automatisch lead kosten ophalen via Solvari API (login via .env credentials)",
  google: "Importeer campagne performance en kosten van Google Ads",
  tiktok: "Importeer campagne data en ad spend van TikTok Ads",
};

const TABS = [
  { id: "integraties", label: "Integraties", icon: Plug },
  { id: "gebruikers", label: "Gebruikers", icon: Users },
  { id: "cron", label: "Cron Jobs", icon: RefreshCw },
  { id: "kpi", label: "KPI Targets", icon: Target },
  { id: "profiel", label: "Profiel", icon: Key },
] as const;

type Tab = typeof TABS[number]["id"];

export function SettingsPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("integraties");

  // OAuth callback handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("error")) {
      window.history.replaceState({}, "", "/settings");
    }
  }, [queryClient]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Instellingen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Integraties, gebruikers en accountbeheer</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "integraties" && <IntegratiesTab />}
      {tab === "gebruikers" && isAdmin() && <GebruikersTab />}
      {tab === "gebruikers" && !isAdmin() && (
        <Card><CardContent className="p-6"><p className="text-muted-foreground">Alleen admins kunnen gebruikers beheren.</p></CardContent></Card>
      )}
      {tab === "cron" && <CronTab />}
      {tab === "kpi" && (isAdmin() || useAuthStore.getState().user?.role === "MANAGER") && <KpiSettingsTab />}
      {tab === "kpi" && !isAdmin() && useAuthStore.getState().user?.role !== "MANAGER" && (
        <Card><CardContent className="p-6"><p className="text-muted-foreground">Alleen admins en managers kunnen KPI targets instellen.</p></CardContent></Card>
      )}
      {tab === "profiel" && <ProfielTab />}
    </div>
  );
}

// ─── Integraties Tab ───

function IntegratiesTab() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();
  const [connectError, setConnectError] = useState<string | null>(null);

  const { data: platforms, isLoading } = useQuery<PlatformStatus[]>({
    queryKey: ["integrations", "status"],
    queryFn: async () => (await api.get("/integrations/status")).data,
  });

  const connectMutation = useMutation({
    mutationFn: async (platform: string) => {
      setConnectError(null);
      return (await api.get(`/integrations/${platform}/connect`)).data as { url: string };
    },
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err: any) => { setConnectError(err?.response?.data?.error || "Verbinding mislukt"); },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => { await api.delete(`/integrations/${platform}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["integrations"] }); },
  });

  const syncMutation = useMutation({
    mutationFn: async (platform: string) => { await api.post(`/integrations/${platform}/sync`); },
    onSuccess: () => { setTimeout(() => queryClient.invalidateQueries({ queryKey: ["integrations"] }), 3000); },
  });

  if (isLoading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {connectError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <XCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{connectError}</p>
          <button onClick={() => setConnectError(null)} className="ml-auto text-xs text-destructive/60 hover:text-destructive">Sluiten</button>
        </div>
      )}

      {platforms?.map((p) => {
        const oauthPlatforms = ["teamleader", "meta", "google"];
        const syncablePlatforms = ["teamleader", "meta", "solvari", "google"];
        const isCredentialsBased = p.configType === "credentials";
        const canConnect = oauthPlatforms.includes(p.platform);
        const canSync = syncablePlatforms.includes(p.platform) && p.connected;
        const isFuture = !syncablePlatforms.includes(p.platform) && !canConnect;

        return (
          <Card key={p.platform}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{PLATFORM_LABELS[p.platform]}</h3>
                    <Badge variant={p.connected ? "success" : "outline"}>
                      {p.connected ? (isCredentialsBased ? "Geconfigureerd" : "Verbonden") : "Niet verbonden"}
                    </Badge>
                    {isCredentialsBased && p.connected && (
                      <Badge variant="outline">via .env</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{PLATFORM_DESCRIPTIONS[p.platform]}</p>

                  {/* Connection info (OAuth) */}
                  {p.connected && p.connectedBy && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Verbonden door <span className="font-medium text-foreground">{p.connectedBy}</span> op {new Date(p.connectedAt!).toLocaleDateString("nl-BE")}
                      {p.expiresAt && <span> — token verloopt {new Date(p.expiresAt).toLocaleDateString("nl-BE")}</span>}
                    </p>
                  )}

                  {/* Sync status */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {p.lastSync && (
                      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                        {p.lastSync.status === "SUCCESS" ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : p.lastSync.status === "RUNNING" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                        <div>
                          <span className="text-xs font-medium">{p.lastSync.status === "SUCCESS" ? "Laatste sync geslaagd" : p.lastSync.status === "RUNNING" ? "Sync bezig..." : "Sync mislukt"}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{p.lastSync.recordsSynced} records</span>
                          <p className="text-[10px] text-muted-foreground"><Clock className="mr-0.5 inline h-2.5 w-2.5" />{new Date(p.lastSync.startedAt).toLocaleString("nl-BE")}</p>
                        </div>
                      </div>
                    )}

                    {/* Cost data status */}
                    {p.lastCostUpdate && (
                      <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                        <Euro className="h-3.5 w-3.5 text-success" />
                        <div>
                          <span className="text-xs font-medium text-success">Kostendata beschikbaar</span>
                          <p className="text-[10px] text-muted-foreground">
                            Bron: {p.lastCostUpdate.source || "?"} — bijgewerkt {new Date(p.lastCostUpdate.updatedAt).toLocaleString("nl-BE")}
                          </p>
                        </div>
                      </div>
                    )}

                    {!p.lastSync && !p.lastCostUpdate && p.connected && (
                      <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                        <Clock className="h-3.5 w-3.5 text-warning" />
                        <span className="text-xs text-warning">Nog niet gesynced — klik op Sync</span>
                      </div>
                    )}
                  </div>

                  {p.lastSync?.error && (
                    <p className="mt-2 text-xs text-destructive">{p.lastSync.error}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="ml-6 flex flex-shrink-0 gap-2">
                  {p.connected ? (
                    <>
                      {canSync && isAdmin() && (
                        <Button variant="outline" size="sm" onClick={() => syncMutation.mutate(p.platform)} disabled={syncMutation.isPending}>
                          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />Sync
                        </Button>
                      )}
                      {canConnect && isAdmin() && (
                        <Button variant="ghost" size="sm" onClick={() => disconnectMutation.mutate(p.platform)} className="text-destructive hover:text-destructive">
                          <Unlink className="mr-1.5 h-3.5 w-3.5" />Ontkoppelen
                        </Button>
                      )}
                    </>
                  ) : (
                    canConnect && isAdmin() ? (
                      <Button size="sm" onClick={() => connectMutation.mutate(p.platform)} disabled={connectMutation.isPending}>
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />Verbinden
                      </Button>
                    ) : isFuture ? (
                      <Button size="sm" variant="outline" disabled>Binnenkort</Button>
                    ) : null
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

    </div>
  );
}

// ─── Cron Tab ───

function CronTab() {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const syncMutation = useMutation({
    mutationFn: async (platform: string) => { await api.post(`/integrations/${platform}/sync`); },
    onSuccess: () => { setTimeout(() => queryClient.invalidateQueries({ queryKey: ["sync-history"] }), 3000); },
  });

  const { data } = useQuery<{
    logs: { id: string; source: string; status: string; recordsSynced: number; error: string | null; startedAt: string; completedAt: string | null }[];
    stats: { source: string; totalRuns: number; successCount: number; failedCount: number; successRate: string; lastRun: string | null; lastStatus: string | null; lastError: string | null }[];
    nextScheduledRun: string;
  }>({
    queryKey: ["sync-history"],
    queryFn: async () => (await api.get("/integrations/sync-history")).data,
  });

  return (
    <div className="space-y-4">
      {/* Schedule Info + Manual Triggers */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Automatische Synchronisatie</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Elke nacht om <span className="font-medium text-foreground">02:00</span> worden Meta Ads, Solvari en Google Ads automatisch gesynced.
              </p>
              {data?.nextScheduledRun && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  Volgende sync: <span className="font-medium text-foreground">{new Date(data.nextScheduledRun).toLocaleString("nl-BE")}</span>
                </p>
              )}
            </div>
            {isAdmin() && (
              <div className="flex gap-2">
                {["teamleader", "meta", "solvari", "google"].map((p) => (
                  <Button key={p} variant="outline" size="sm" onClick={() => syncMutation.mutate(p)} disabled={syncMutation.isPending}>
                    <RefreshCw className={`mr-1 h-3 w-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    {PLATFORM_LABELS[p]?.split(" ")[0] || p}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sync Stats per Source */}
      {data && data.stats.some((s) => s.totalRuns > 0) && <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sync Overzicht</CardTitle>
            {data.nextScheduledRun && (
              <span className="text-xs text-muted-foreground">
                <Clock className="mr-1 inline h-3 w-3" />
                Volgende sync: {new Date(data.nextScheduledRun).toLocaleString("nl-BE")}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.stats.filter((s) => s.totalRuns > 0).map((s) => (
              <div key={s.source} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">{PLATFORM_LABELS[s.source] || s.source}</span>
                  {s.lastStatus === "SUCCESS" ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : s.lastStatus === "FAILED" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div className="text-lg font-bold text-foreground">{s.successRate}%</div>
                <div className="text-[10px] text-muted-foreground">{s.successCount}/{s.totalRuns} geslaagd</div>
                {s.lastRun && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Laatst: {new Date(s.lastRun).toLocaleString("nl-BE")}
                  </div>
                )}
                {s.lastError && s.lastStatus === "FAILED" && (
                  <div className="mt-1 text-[10px] text-destructive truncate" title={s.lastError}>{s.lastError}</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>}

      {/* Sync Log */}
      {data && data.logs.length > 0 && <Card>
        <CardHeader><CardTitle>Sync Geschiedenis</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bron</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Records</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gestart</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duur</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fout</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.slice(0, 20).map((log) => {
                  const duration = log.completedAt
                    ? Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)
                    : null;
                  return (
                    <tr key={log.id} className="border-b border-border/30 hover:bg-muted/50">
                      <td className="py-2.5 font-medium text-foreground">{PLATFORM_LABELS[log.source] || log.source}</td>
                      <td className="py-2.5">
                        <Badge variant={log.status === "SUCCESS" ? "success" : log.status === "RUNNING" ? "warning" : "destructive"}>
                          {log.status === "SUCCESS" ? <CheckCircle className="mr-1 h-3 w-3" /> : log.status === "RUNNING" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <XCircle className="mr-1 h-3 w-3" />}
                          {log.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{log.recordsSynced}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{new Date(log.startedAt).toLocaleString("nl-BE")}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{duration !== null ? `${duration}s` : "-"}</td>
                      <td className="py-2.5 text-xs text-destructive max-w-[200px] truncate">{log.error || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>}
    </div>
  );
}

// ─── Gebruikers Tab ───

function GebruikersTab() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "VIEWER" });
  const [createError, setCreateError] = useState("");

  const { data: users, isLoading } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/auth/users")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      return (await api.post("/auth/users", data)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setNewUser({ name: "", email: "", password: "", role: "VIEWER" });
      setCreateError("");
    },
    onError: (err: any) => { setCreateError(err?.response?.data?.error || "Aanmaken mislukt"); },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      return (await api.patch(`/auth/users/${id}`, { role })).data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.delete(`/auth/users/${id}`)).data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); },
  });

  if (isLoading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Gebruikers ({users?.length || 0})</h2>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />Gebruiker toevoegen
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 font-semibold text-foreground">Nieuwe gebruiker</h3>
            {createError && <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{createError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Naam</label>
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Jan Janssen" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Email</label>
                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="jan@recotex.be" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Wachtwoord</label>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Min. 6 tekens" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Rol</label>
                <select
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => createMutation.mutate(newUser)} disabled={createMutation.isPending || !newUser.name || !newUser.email || !newUser.password}>
                {createMutation.isPending ? "Aanmaken..." : "Aanmaken"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setCreateError(""); }}>Annuleren</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users list */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gebruiker</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rol</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aangemaakt</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acties</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      className="rounded-lg border border-border bg-white px-2 py-1 text-xs font-medium"
                      value={u.role}
                      onChange={(e) => updateRoleMutation.mutate({ id: u.id, role: e.target.value })}
                      disabled={u.id === currentUser?.id}
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("nl-BE")}</td>
                  <td className="px-6 py-4 text-right">
                    {u.id !== currentUser?.id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { if (confirm(`${u.name} verwijderen?`)) deleteMutation.mutate(u.id); }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Badge variant="outline">Jij</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Role explanation */}
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-3 font-semibold text-foreground flex items-center gap-2"><Shield className="h-4 w-4" /> Rollen uitleg</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-semibold text-foreground">Admin</p>
              <p className="mt-1 text-xs text-muted-foreground">Volledige toegang. Gebruikers beheren, integraties configureren, data bewerken.</p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-semibold text-foreground">Manager</p>
              <p className="mt-1 text-xs text-muted-foreground">Dashboard bekijken, deals bewerken, facturen uploaden, KPI targets instellen.</p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-semibold text-foreground">Viewer</p>
              <p className="mt-1 text-xs text-muted-foreground">Alleen bekijken. Geen bewerkrechten.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Profiel Tab ───

function ProfielTab() {
  const user = useAuthStore((s) => s.user);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const changePwMutation = useMutation({
    mutationFn: async () => {
      return (await api.post("/auth/change-password", { currentPassword: currentPw, newPassword: newPw })).data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Wachtwoord gewijzigd" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    },
    onError: (err: any) => {
      setMessage({ type: "error", text: err?.response?.data?.error || "Wachtwoord wijzigen mislukt" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (newPw !== confirmPw) {
      setMessage({ type: "error", text: "Wachtwoorden komen niet overeen" });
      return;
    }
    if (newPw.length < 6) {
      setMessage({ type: "error", text: "Wachtwoord moet minimaal 6 tekens zijn" });
      return;
    }
    changePwMutation.mutate();
  };

  return (
    <div className="space-y-4">
      {/* Profile info */}
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 font-semibold text-foreground">Account informatie</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Naam</label>
              <p className="mt-1 text-sm font-medium text-foreground">{user?.name}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Email</label>
              <p className="mt-1 text-sm font-medium text-foreground">{user?.email}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Rol</label>
              <Badge variant={user?.role === "ADMIN" ? "default" : user?.role === "MANAGER" ? "warning" : "outline"} className="mt-1">
                {user?.role}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 font-semibold text-foreground">Wachtwoord wijzigen</h3>
          {message && (
            <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${message.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {message.text}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Huidig wachtwoord</label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Nieuw wachtwoord</label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min. 6 tekens" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Bevestig nieuw wachtwoord</label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
            </div>
            <Button type="submit" size="sm" disabled={changePwMutation.isPending}>
              {changePwMutation.isPending ? "Wijzigen..." : "Wachtwoord wijzigen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── KPI Settings Tab ───

const KPI_FIELDS = [
  { metric: "lead_spend_roi", label: "Lead Spend ROI (target multiplier)", unit: "x", placeholder: "16.67" },
  { metric: "kpa", label: "KPA — Kost Per Afspraak", unit: "€", placeholder: "120" },
  { metric: "coa_overachieved", label: "COA — Overachieved (groen)", unit: "€", placeholder: "600" },
  { metric: "coa_target", label: "COA — Target", unit: "€", placeholder: "800" },
  { metric: "coa_acceptable", label: "COA — Acceptable (oranje)", unit: "€", placeholder: "1000" },
  { metric: "own_leads_percentage", label: "Eigen Leads %", unit: "%", placeholder: "50" },
];

const BUDGET_METRICS = [
  { metric: "total_marketing_budget", label: "Total Marketing Budget (incl overhead)", placeholder: "100000" },
  { metric: "lead_spend_budget", label: "Lead Spend Budget", placeholder: "65000" },
];

function generateMonths(): string[] {
  // Sept 2025 → Dec 2026
  const months: string[] = [];
  for (let y = 2025; y <= 2026; y++) {
    const startM = y === 2025 ? 8 : 0; // Sept=8 for 2025, Jan=0 for 2026
    const endM = y === 2026 ? 11 : 11;
    for (let m = startM; m <= endM; m++) {
      months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    }
  }
  return months;
}

const ALL_MONTHS = generateMonths();

function formatMonthLabel(ym: string): string {
  const d = new Date(ym + "-15");
  return d.toLocaleDateString("nl-BE", { month: "short", year: "numeric" });
}

function MonthlyBudgetGrid({ metric, label, placeholder }: { metric: string; label: string; placeholder: string }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: targets, isLoading } = useQuery<{ id: string; metric: string; targetValue: number; month: string }[]>({
    queryKey: ["kpi-budget", metric],
    queryFn: async () => (await api.get(`/kpi/budget/${metric}`)).data,
  });

  useEffect(() => {
    if (targets && Object.keys(values).length === 0) {
      const v: Record<string, string> = {};
      for (const t of targets) {
        const ym = t.month.slice(0, 7); // "2026-04-01" → "2026-04"
        v[ym] = String(t.targetValue);
      }
      setValues(v);
    }
  }, [targets]);

  const total = ALL_MONTHS.reduce((s, m) => s + (parseFloat(values[m] || "0") || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const months = ALL_MONTHS
        .filter((m) => values[m] && parseFloat(values[m]) > 0)
        .map((m) => ({ month: m, value: parseFloat(values[m]) }));
      await api.put("/kpi/budget", { metric, months });
      queryClient.invalidateQueries({ queryKey: ["kpi-budget", metric] });
      queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Budget save error:", e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{label}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Totaal: <span className="font-semibold text-foreground">€{total.toLocaleString("nl-BE", { minimumFractionDigits: 0 })}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-success font-medium">Opgeslagen</span>}
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {ALL_MONTHS.map((m) => (
            <div key={m}>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{formatMonthLabel(m)}</label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">€</span>
                <Input
                  type="number"
                  step="any"
                  className="h-8 text-sm"
                  value={values[m] || ""}
                  onChange={(e) => setValues({ ...values, [m]: e.target.value })}
                  placeholder={placeholder}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSettingsTab() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: targets, isLoading } = useQuery<{ id: string; metric: string; targetValue: number }[]>({
    queryKey: ["kpi-targets"],
    queryFn: async () => (await api.get("/kpi")).data,
  });

  // Populate form when targets load
  useEffect(() => {
    if (targets && Object.keys(values).length === 0) {
      const v: Record<string, string> = {};
      for (const t of targets) {
        v[t.metric] = String(t.targetValue);
      }
      setValues(v);
    }
  }, [targets]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      for (const field of KPI_FIELDS) {
        const val = parseFloat(values[field.metric] || "0");
        const existing = targets?.find((t) => t.metric === field.metric);
        if (existing) {
          await api.patch(`/kpi/${existing.id}`, { targetValue: val });
        } else {
          await api.post("/kpi", { category: "Kosten", metric: field.metric, targetValue: val, period: "MONTHLY" });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("KPI save error:", e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Monthly Budget Grids */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Projected Budget per Maand</h2>
        <div className="space-y-4">
          {BUDGET_METRICS.map((bm) => (
            <MonthlyBudgetGrid key={bm.metric} {...bm} />
          ))}
        </div>
      </div>

      {/* Other KPI Targets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">KPI Target Waarden</h2>
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-success font-medium">Opgeslagen</span>}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {KPI_FIELDS.map((field) => (
                <div key={field.metric}>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">{field.label}</label>
                  <div className="flex items-center gap-2">
                    {field.unit === "€" && <span className="text-sm text-muted-foreground">€</span>}
                    <Input
                      type="number"
                      step="any"
                      value={values[field.metric] || ""}
                      onChange={(e) => setValues({ ...values, [field.metric]: e.target.value })}
                      placeholder={field.placeholder}
                    />
                    {field.unit === "x" && <span className="text-sm text-muted-foreground">x</span>}
                    {field.unit === "%" && <span className="text-sm text-muted-foreground">%</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
