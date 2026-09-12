import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import "./auth-gate.css";

type AuthState = { user: string | null; logout: () => Promise<void> };
const AuthContext = createContext<AuthState>({
  user: null,
  logout: async () => undefined,
});
export const useOwnerAuth = () => useContext(AuthContext);

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    "checking" | "authenticated" | "anonymous"
  >("checking");
  const [user, setUser] = useState<string | null>(null);
  async function check() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const body = (await response.json()) as {
        authenticated?: boolean;
        user?: string | null;
      };
      setUser(body.authenticated ? (body.user ?? "owner") : null);
      setState(body.authenticated ? "authenticated" : "anonymous");
    } catch {
      setState("anonymous");
    }
  }
  useEffect(() => {
    void check();
  }, []);
  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => undefined);
    localStorage.removeItem("mission_control_admin_token");
    localStorage.removeItem("missionControlAdminToken");
    setUser(null);
    setState("anonymous");
  }
  if (state === "checking")
    return (
      <div className="mc-auth-loading">
        <ShieldCheck />
        <span>Securing Mission Control…</span>
      </div>
    );
  if (state === "anonymous")
    return (
      <Login
        onSuccess={(nextUser) => {
          setUser(nextUser);
          setState("authenticated");
        }}
      />
    );
  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function Login({ onSuccess }: { onSuccess: (user: string) => void }) {
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        user?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Sign-in failed");
      localStorage.removeItem("mission_control_admin_token");
      localStorage.removeItem("missionControlAdminToken");
      onSuccess(body.user || username);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mc-login-shell">
      <div className="mc-login-orbit" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <section className="mc-login-card">
        <div className="mc-login-brand">
          <span className="mc-login-mark">∞</span>
          <div>
            <small>Customli</small>
            <strong>Mission Control</strong>
          </div>
        </div>
        <div className="mc-login-copy">
          <span>Enterprise control plane</span>
          <h1>Command your AI workforce.</h1>
          <p>
            Secure owner access to agents, missions, spend, knowledge and
            production operations.
          </p>
        </div>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          {error && <p className="mc-login-error">{error}</p>}
          <button disabled={busy || !username.trim() || !password}>
            <LockKeyhole />
            {busy ? "Signing in…" : "Enter Mission Control"}
          </button>
        </form>
        <footer>
          <ShieldCheck /> HttpOnly owner session · protected control-plane
          access
        </footer>
      </section>
    </main>
  );
}
