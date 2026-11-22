import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Cpu, Database, MapPinned } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button, Field, inputClass, Logo, MockPill } from "@/design-system";
import { roleHome, terms, type Role } from "@/lib/terms";
import { isMock } from "@/lib/env";
import { demoLogins, useAuth } from "./auth-store";
import { useExperienceTheme } from "./theme";

const roleIcon = { admin: MapPinned, customer: Cpu, site_owner: Database } as const;

export function Login() {
  useExperienceTheme("ops");
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (user) return <Navigate to={roleHome[user.role as Role]} replace />;

  async function go(u: string, p: string) {
    setBusy(u);
    setError(null);
    try {
      const me = await login(u, p);
      const home = roleHome[me.role as Role];
      nav(loc.state?.from?.startsWith(home) ? loc.state.from : home, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "User name or password is wrong. Demo users use the password demo." : e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (username && password) void go(username, password);
  };

  return (
    <main className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col justify-between gap-10 px-6 py-8 sm:px-12 lg:py-12">
        <div className="flex items-center justify-between">
          <Logo tagline />
          <MockPill />
        </div>
        <div className="max-w-md">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl sm:font-light">Swiss compute that heats Basel.</h1>
          <p className="mt-3 text-base text-ink-2">Choose a view. Each one shows only what that role is allowed to see.</p>
          <div className="mt-6 flex flex-col gap-2">
            {demoLogins.map((d) => {
              const I = roleIcon[d.role];
              return (
                <button
                  key={d.username}
                  type="button"
                  disabled={!!busy}
                  onClick={() => go(d.username, "demo")}
                  className="group flex items-center gap-4 rounded-card border border-line bg-surface px-4 py-3 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ctl bg-surface-3 text-ink-2">
                    <I aria-hidden className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{busy === d.username ? "Signing in…" : d.label}</span>
                    <span className="block truncate text-xs text-ink-3">{d.hint}</span>
                  </span>
                  <ArrowRight aria-hidden className="h-4 w-4 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-ink-2 hover:text-ink">Sign in with another user</summary>
            <form onSubmit={submit} className="mt-3 grid gap-3">
              <Field label="User name" htmlFor="u">
                <input id="u" className={inputClass} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="p" hint="Demo users: admin, acme, globex, h1owner, hotel1owner, hotelgroup. Password: demo">
                <input id="p" type="password" className={inputClass} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Button type="submit" variant="primary" disabled={!username || !password || !!busy}>
                Sign in
              </Button>
            </form>
          </details>
          {error && (
            <p role="alert" className="mt-4 text-sm text-critical-ink">
              {error}
            </p>
          )}
        </div>
        <p className="text-xs text-ink-3">
          Virtual Culture GmbH, Basel. {isMock ? "Mock mode: recorded backend data, no server needed." : "Connected to the DigitalHeat API."} Press Shift + D for connection settings.
        </p>
      </section>
      <ChainPanel />
    </main>
  );
}

/** The four-step story, drawn once on load. */
function ChainPanel() {
  const steps = [
    { n: "01", t: terms.chain[0], d: "Pharma, banks and AI start-ups send jobs with a deadline and a priority.", c: "rgb(var(--idle))" },
    { n: "02", t: terms.chain[1], d: "Every 15 minutes the scheduler places each task where heat is needed.", c: "rgb(var(--tank))" },
    { n: "03", t: terms.chain[2], d: "Sealed liquid-cooled racks turn their electricity into 55 to 65 °C water.", c: "rgb(var(--heat))" },
    { n: "04", t: terms.chain[3], d: "Hotels, pools, plants and apartment blocks use it for hot water and process heat.", c: "rgb(var(--ok))" },
  ];
  return (
    <aside aria-label="How DigitalHeat works" className="relative hidden overflow-hidden border-l border-line bg-rail lg:flex lg:flex-col lg:justify-center lg:px-14">
      <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.35]">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="rgb(var(--line))" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      <ol className="relative flex max-w-lg flex-col gap-8">
        {steps.map((s, i) => (
          <li key={s.n} className="grid animate-rise grid-cols-[48px_1fr] gap-4" style={{ animationDelay: `${120 + i * 90}ms` }}>
            <span className="relative flex flex-col items-center">
              <span className="grid h-10 w-10 place-items-center rounded-full border-2 bg-surface text-xs font-semibold tnum" style={{ borderColor: s.c }}>
                {s.n}
              </span>
              {i < steps.length - 1 && <span aria-hidden className="mt-2 w-0.5 flex-1" style={{ background: `linear-gradient(${s.c}, ${steps[i + 1].c})`, minHeight: 32 }} />}
            </span>
            <span>
              <span className="block text-md font-semibold first-letter:uppercase">{s.t}</span>
              <span className="mt-1 block text-sm text-ink-2">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
