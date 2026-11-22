/**
 * Operations Console frame (reference image): left rail with navigation and KPI overview, top bar with the
 * simulated clock, theme switch, alerts and user menu. The map page fills the content area; other pages scroll.
 */
import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertOctagon,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  Clock3,
  FlaskConical,
  ListChecks,
  LogOut,
  Map as MapIcon,
  MapPin,
  Moon,
  Server,
  SlidersHorizontal,
  Sun,
  Target,
  Users,
  Wind,
  Play,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/app/auth-store";
import { useExperienceTheme, useTheme } from "@/app/theme";
import { AlertToasts, AlertTray, AnimatedNumber, ClockControl, ConnectionBanner, DonutGauge, Logo, MockPill, Pop, Skeleton } from "@/design-system";
import type { Alert } from "@/api/types";
import { useTodayKpis } from "./hooks";

const NAV = [
  { to: "/ops", label: "Fleet Map", icon: MapIcon, end: true },
  { to: "/ops/sites", label: "Site Details", icon: MapPin },
  { to: "/ops/servers", label: "Server Details", icon: Server },
  { to: "/ops/tasks", label: "Jobs & Tasks", icon: ListChecks },
  { to: "/ops/customers", label: "Customers", icon: Users },
  { to: "/ops/lab", label: "Scheduler Lab", icon: FlaskConical },
  { to: "/ops/events", label: "Events", icon: Activity },
  { to: "/ops/economics", label: "Platform Economics", icon: CircleDollarSign },
  { to: "/ops/settings", label: "Settings", icon: SlidersHorizontal },
];

function KpiOverview({ collapsed }: { collapsed: boolean }) {
  const { today, runTotal } = useTodayKpis();
  const k = today.data;
  const rows = [
    { icon: Wind, tone: "text-dump-ink", label: "Dumped", v: k?.dumpedKwh, d: 1, u: "kWh" },
    { icon: AlertOctagon, tone: "text-critical-ink", label: "Unmet", v: k?.unmetKwh, d: 1, u: "kWh" },
    { icon: Server, tone: "text-ink-3", label: "Utilisation", v: k?.utilisationPct, d: 0, u: "%" },
    { icon: Play, tone: "text-heat-ink", label: "Tasks running", v: k?.tasksRunning, d: 0, u: "" },
    { icon: Clock3, tone: "text-critical-ink", label: "Missed, run", v: runTotal.data?.missedDeadlinesPct, d: 1, u: "%" },
    { icon: Target, tone: "text-ink-3", label: "Break-even", v: k?.breakEvenChfPerServerHour, d: 2, u: "CHF/server-h" },
  ];
  if (collapsed)
    return (
      <div className="grid place-items-center py-2" title="Heat coverage today">
        <DonutGauge value={k?.coveragePct ?? 0} tone="ok" size={44} stroke={5} label={`Heat coverage today ${Math.round(k?.coveragePct ?? 0)} percent`}>
          <span className="text-2xs font-semibold tnum">{Math.round(k?.coveragePct ?? 0)}</span>
        </DonutGauge>
      </div>
    );
  return (
    <section aria-label="KPI overview" className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between text-xs">
        <h2 className="font-semibold text-ink">KPI overview</h2>
        <span className="text-ink-3">Today</span>
      </div>
      {today.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-20 rounded-full" />
          {rows.map((r) => (
            <Skeleton key={r.label} />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3">
            <DonutGauge value={k?.coveragePct ?? 0} tone="ok" size={76} stroke={8} label={`Heat coverage today ${Math.round(k?.coveragePct ?? 0)} percent`}>
              <span className="text-md font-light tnum">
                <AnimatedNumber value={k?.coveragePct} decimals={0} />
                <span className="text-2xs text-ink-3">%</span>
              </span>
            </DonutGauge>
            <p className="text-xs leading-snug text-ink-2">
              <span className="block font-semibold text-ink">Heat coverage</span>
              of host heat demand met by server heat and tanks
            </p>
          </div>
          <dl className="m-0">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-2 border-t border-line py-1.5 text-xs">
                <dt className="flex items-center gap-1.5 text-ink-2">
                  <r.icon aria-hidden className={cn("h-3.5 w-3.5", r.tone)} />
                  {r.label}
                </dt>
                <dd className="m-0 whitespace-nowrap tnum text-ink">
                  <AnimatedNumber value={r.v} decimals={r.d} />
                  {r.u && <span className="ml-1 text-ink-3">{r.u}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function ThemeSwitch() {
  const { theme, set } = useTheme();
  return (
    <div role="group" aria-label="Colour theme" className="inline-flex rounded-full border border-line bg-surface-2 p-0.5">
      {(
        [
          ["light", Sun, "Light theme"],
          ["dark", Moon, "Dark theme"],
        ] as const
      ).map(([t, I, label]) => (
        <button
          key={t}
          type="button"
          aria-label={label}
          aria-pressed={theme === t}
          onClick={() => set(t)}
          className={cn("grid h-7 w-8 place-items-center rounded-full transition-colors", theme === t ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")}
        >
          <I aria-hidden className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export function OpsShell({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  useExperienceTheme("ops");
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const viewAlert = (a: Alert) => nav(a.siteId ? `/ops?site=${a.siteId}` : `/ops/tasks?job=${a.jobId}`);
  return (
    <div className={cn("grid h-full grid-cols-[248px_minmax(0,1fr)] bg-bg transition-[grid-template-columns] duration-300 ease-out max-lg:grid-cols-[72px_minmax(0,1fr)]", collapsed && "grid-cols-[72px_minmax(0,1fr)]")}>
      <aside aria-label="Navigation and KPI overview" className="flex h-full min-h-0 flex-col gap-4 border-r border-line bg-rail px-3 pb-3 pt-4">
        <div className={cn("px-2", collapsed && "px-0 text-center")}>
          <span className={cn(collapsed ? "hidden" : "max-lg:hidden")}>
            <Logo tagline />
          </span>
          <span className={cn(collapsed ? "inline" : "hidden max-lg:inline")}>
            <Logo compact />
          </span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={n.label}
              className={({ isActive }) =>
                cn(
                  "relative flex h-9 items-center gap-3 rounded-ctl px-3 text-sm font-medium transition-colors",
                  (collapsed || undefined) && "justify-center px-0",
                  "max-lg:justify-center max-lg:px-0",
                  isActive ? "bg-surface-3 text-ink before:absolute before:-left-3 before:top-2 before:h-5 before:w-[3px] before:rounded-r before:bg-tank" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )
              }
            >
              <n.icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
              <span className={cn(collapsed ? "sr-only" : "max-lg:sr-only")}>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={cn("min-h-0 flex-1 overflow-y-auto scrollbar-thin", "max-lg:hidden", collapsed && "hidden")}>
          <KpiOverview collapsed={false} />
        </div>
        {(collapsed || undefined) && <KpiOverview collapsed />}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-pressed={collapsed}
          className={cn("mt-auto flex h-9 items-center gap-3 rounded-ctl px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink max-lg:hidden", collapsed && "justify-center px-0")}
        >
          {collapsed ? <ChevronsRight aria-hidden className="h-4 w-4" /> : <ChevronsLeft aria-hidden className="h-4 w-4" />}
          <span className={collapsed ? "sr-only" : undefined}>{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-6 max-md:px-3">
          <span className="text-xs font-semibold tracking-[0.12em] text-ink-2 max-xl:hidden">OPERATIONS CONSOLE</span>
          <span className="flex-1" />
          <ClockControl />
          <span className="flex-1" />
          <MockPill />
          <span className="hidden rounded-md border border-dashed border-line-strong px-2 py-0.5 text-2xs text-ink-3 max-lg:inline">Read-only on tablet</span>
          <ThemeSwitch />
          <AlertTray onView={viewAlert} />
          <Pop
            label="Account"
            align="end"
            width={240}
            trigger={
              <button type="button" className="flex items-center gap-2.5 rounded-ctl py-1 pl-1 pr-2 hover:bg-surface-2" aria-label="Account menu">
                <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-xs font-semibold">
                  OP
                </span>
                <span className="text-left max-md:hidden">
                  <span className="block text-sm font-semibold leading-tight">Operator</span>
                  <span className="block text-xs text-ink-3">{user?.id}</span>
                </span>
                <ChevronDown aria-hidden className="h-4 w-4 text-ink-3" />
              </button>
            }
          >
            <p className="text-sm font-semibold">{user?.name}</p>
            <p className="text-xs text-ink-3">Role: operator (admin)</p>
            <button type="button" onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-sm hover:bg-surface-2">
              <LogOut aria-hidden className="h-4 w-4" />
              Sign out
            </button>
          </Pop>
        </header>
        <ConnectionBanner />
        <main id="main" className={cn("relative min-h-0 flex-1", fullBleed ? "overflow-hidden" : "overflow-y-auto scrollbar-thin")}>
          {children}
        </main>
      </div>
      <AlertToasts onView={viewAlert} />
    </div>
  );
}

/** Page header + padding for the scrolling (non-map) screens */
export function OpsPage({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 pb-16 pt-6 max-md:px-3">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-light tracking-tight">{title}</h1>
          {sub && <p className="mt-1 max-w-[80ch] text-sm text-ink-2">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
