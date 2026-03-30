import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { LeadsPage } from "./pages/Leads";
import { ReclamatiesPage } from "./pages/Reclamaties";
import { WonLeadsPage } from "./pages/WonLeads";
import { AppointmentsPage } from "./pages/Appointments";
import { CostsPage } from "./pages/Costs";
import { KpiSettingsPage } from "./pages/KpiSettings";
import { LeadSourcesPage } from "./pages/LeadSources";
import { InvoicesPage } from "./pages/Invoices";
import { SettingsPage } from "./pages/Settings";
import { AiAssistantPage } from "./pages/AiAssistant";
import { ReportPage } from "./pages/Report";
import { useAuth } from "./hooks/useAuth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <DashboardLayout />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/reclamaties" element={<ReclamatiesPage />} />
            <Route path="/won" element={<WonLeadsPage />} />
            <Route path="/afspraken" element={<AppointmentsPage />} />
            <Route path="/kosten" element={<CostsPage />} />
            <Route path="/kpi" element={<KpiSettingsPage />} />
            <Route path="/herkomst" element={<LeadSourcesPage />} />
            <Route path="/ai" element={<AiAssistantPage />} />
            <Route path="/rapport" element={<ReportPage />} />
            <Route path="/facturen" element={<InvoicesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
