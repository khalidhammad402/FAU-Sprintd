/**
 * Frame of the Compute Portal and the Host Portal: navy rail with light content on desktop, icon rail on
 * tablet, and on phone either a bottom tab bar (Host) or a slide-in menu (Compute).
 */
import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Clock3, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { time } from "@/lib/time";
import { terms } from "@/lib/terms";
import { useMotion } from "@/lib/motion";
import { useNow } from "@/live/store";
import { AlertToasts, ConnectionBanner, IconButton, Logo, MockPill } from "@/design-system";
import { useAuth } from "./auth-store";
import { useExperienceTheme } from "./theme";

export type NavItem = { to: string; label: string; short?: string; icon: LucideIcon; badge?: number; end?: boolean };

export function PortalShell({ product, nav, title, actions, tabs, footer, children }: { product: string; nav: NavItem[]; title: ReactNode; actions?: ReactNode; tabs?: boolean; footer?: ReactNode; children: ReactNode }) {
  useExperienceTheme("portal");
  const { user, logout } = useAuth();
  const now = useNow();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const { reduced } = useMotion();
  const initials = (user?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const link = (n: NavItem, variant: "rail" | "tab") => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={() => setMenu(false)}
      title={n.label}
      className={({ isActive }) =>
        variant === "rail"
          ? cn(
              "relative flex min-h-10 items-center gap-3 rounded-ctl px-3 text-sm font-medium transition-colors max-lg:justify-center max-lg:px-0 max-md:justify-start max-md:px-3",
              isActive ? "bg-white/10 text-white" : "text-[#A9B6C9] hover:bg-white/5 hover:text-white",
            )
          : cn("relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-ctl text-[11px] font-medium", isActive ? "bg-white/10 text-white" : "text-[#A9B6C9]")
      }
    >
      <n.icon aria-hidden className={variant === "rail" ? "h-[18px] w-[18px] shrink-0" : "h-5 w-5"} />
      <span className={variant === "rail" ? "max-lg:sr-only max-md:not-sr-only" : undefined}>{variant === "tab" ? (n.short ?? n.label) : n.label}</span>
      {!!n.badge && (
        <span
          className={cn(
            "grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-white tnum",
            variant === "rail" ? "ml-auto max-lg:absolute max-lg:right-1 max-lg:top-1 max-md:static max-md:ml-auto" : "absolute right-[calc(50%-18px)] top-1",
          )}
        >
          {n.badge}
        </span>
      )}
    </NavLink>
  );
  return (
    <div className="grid min-h-full grid-cols-[240px_minmax(0,1fr)] max-lg:grid-cols-[72px_minmax(0,1fr)] max-md:grid-cols-1">
      <aside
        data-theme="dark"
        aria-label={product}
        className={cn(
          "sticky top-0 z-30 flex h-screen flex-col bg-[#0A1628] px-3 pb-4 pt-5 text-ink max-md:hidden",
          menu && "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:flex max-md:w-[272px] max-md:shadow-[0_0_0_100vmax_rgb(3_8_18/0.5)]",
        )}
      >
        <div className="mb-6 flex items-center justify-between px-2 max-lg:justify-center max-md:justify-between">
          <span className="max-lg:hidden max-md:inline">
            <Logo tagline />
          </span>
          <span className="hidden max-lg:inline max-md:hidden">
            <Logo compact />
          </span>
          {menu && <IconButton className="md:hidden" icon={X} label="Close menu" onClick={() => setMenu(false)} />}
        </div>
        <p className="mb-2 px-3 text-2xs font-semibold text-[#8494AC] max-lg:hidden max-md:block">{product}</p>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {nav.map((n) => link(n, "rail"))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4">
          {footer && <div className="max-lg:hidden max-md:block">{footer}</div>}
          <div className="flex items-center gap-2.5 px-1 max-lg:justify-center max-md:justify-start">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl border border-white/15 bg-white/10 text-xs font-semibold text-white">
              {initials}
            </span>
            <span className="min-w-0 flex-1 max-lg:hidden max-md:block">
              <span className="block truncate text-sm font-semibold text-white">{user?.name}</span>
              <span className="block truncate text-xs text-[#8494AC]">{user?.role === "customer" ? terms.computeBuyer : terms.host}</span>
            </span>
            <IconButton icon={LogOut} label="Sign out" size="sm" className="text-[#A9B6C9] hover:bg-white/10 hover:text-white max-lg:hidden max-md:inline-grid" onClick={logout} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div data-theme="dark" className="sticky top-0 z-20 flex items-center gap-3 bg-[#0A1628] px-3 py-2 text-ink md:hidden">
          {!tabs && <IconButton icon={Menu} label="Open menu" className="h-11 w-11" onClick={() => setMenu(true)} />}
          <Logo />
          <span className="flex-1" />
          <MockPill />
          {tabs && <IconButton icon={LogOut} label="Sign out" className="h-11 w-11" onClick={logout} />}
        </div>
        <ConnectionBanner />
        <header className="flex flex-wrap items-center gap-3 px-8 pt-6 max-lg:px-6 max-md:px-4 max-md:pt-4">
          <h1 className="min-w-0 flex-1 text-lg font-semibold tracking-tight">{title}</h1>
          {actions}
          <span className="hidden md:inline-flex">
            <MockPill />
          </span>
          <span title="Simulated time: the scheduler clock of the demo, not your wall clock" className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs text-ink-2">
            <Clock3 aria-hidden className="h-3.5 w-3.5" />
            {terms.simulatedTime}
            <b className="font-medium text-ink tnum">{now ? time.clock(now) : "waiting for the scheduler"}</b>
          </span>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={loc.pathname}
            id="main"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={cn("w-full max-w-[1280px] px-8 pb-16 pt-6 max-lg:px-6 max-md:px-4", tabs && "max-md:pb-28")}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      {tabs && (
        <nav aria-label="Main" data-theme="dark" className="fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col gap-1 border-t border-white/10 bg-[#0A1628] px-1 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 md:hidden">
          {nav.map((n) => link(n, "tab"))}
        </nav>
      )}
      <AlertToasts />
    </div>
  );
}
