import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import { BarChart3, Shield, TrendingUp } from "lucide-react";
import api from "@/lib/api";

const DEV_MODE = import.meta.env.DEV;

const features = [
  { icon: BarChart3, text: "Real-time lead & omzet analytics" },
  { icon: TrendingUp, text: "Marketing ROI tracking per kanaal" },
  { icon: Shield, text: "Veilige data met role-based access" },
];

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { email, password });
      setAuth(res.data.user, res.data.token);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setLoading(true);
    setError("");
    // Clear any stale auth state
    localStorage.removeItem("recotex-auth");
    localStorage.removeItem("token");
    try {
      const res = await api.post("/auth/login", {
        email: "admin@dashboard.local",
        password: "admin123",
      });
      setAuth(res.data.user, res.data.token);
      navigate("/");
    } catch (err: any) {
      setError("Dev login mislukt: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left: branding panel */}
      <div className="relative hidden w-[45%] overflow-hidden bg-sidebar lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-[128px]" />
        <div className="absolute -bottom-48 -right-48 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[128px]" />

        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
          <div className="mb-10">
            <img src="/Recotex_Logo.png" alt="Recotex" className="h-12 w-auto" />
          </div>

          <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-white">
            Lead performance<br /><span className="text-primary">dashboard.</span>
          </h1>
          <p className="mb-10 max-w-sm text-[15px] leading-relaxed text-sidebar-foreground">
            Van lead tot klant — volg elk kanaal, elke kost, en elke conversie in real-time.
          </p>

          <div className="space-y-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08]">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm text-sidebar-foreground">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 px-12 pb-8 xl:px-16">
          <p className="text-xs text-sidebar-foreground/40">recotex.be</p>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex w-full items-center justify-center bg-white lg:w-[55%]">
        <div className="w-full max-w-[380px] px-8">
          <div className="mb-10 lg:hidden">
            <div className="mx-auto mb-4">
              <img src="/Recotex_Logo.png" alt="Recotex" className="h-10 mx-auto" />
            </div>
            <h1 className="text-center text-lg font-bold text-foreground">Recotex Dashboard</h1>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-foreground">Welkom terug</h2>
          <p className="mt-2 mb-8 text-sm text-muted-foreground">
            Log in om je dashboard te bekijken
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{error}</div>
            )}

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jouw@recotex.be"
                className="h-11 rounded-xl"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-foreground">Wachtwoord</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 rounded-xl"
                required
              />
            </div>

            <Button type="submit" className="h-11 w-full text-sm" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Inloggen...
                </span>
              ) : (
                "Inloggen"
              )}
            </Button>
          </form>

          {/* Dev mode bypass */}
          {DEV_MODE && (
            <div className="mt-6 border-t border-border/60 pt-5">
              <Button
                variant="outline"
                className="h-10 w-full text-sm"
                onClick={handleDevLogin}
                disabled={loading}
              >
                Dev login (skip auth)
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground/60">
                Alleen zichtbaar in development
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
