/** Host Portal (/host): Today, Energy, My installation, Savings and reports, Notifications. Phone first. */
import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Bell, ChartColumn, LifeBuoy, Server, Sun, Wallet } from "lucide-react";
import { PortalShell, type NavItem } from "@/app/PortalShell";
import { PanelBoundary } from "@/app/guards";
import { useNotifications } from "@/api/queries";
import { terms } from "@/lib/terms";
import { useHostSite } from "./site";

const TodayPage = lazy(() => import("./TodayPage"));
const EnergyPage = lazy(() => import("./EnergyPage"));
const InstallationPage = lazy(() => import("./InstallationPage"));
const SavingsPage = lazy(() => import("./SavingsPage"));
const AlertsPage = lazy(() => import("./AlertsPage"));

const titles: Record<string, string> = {
  "": "Today",
  energy: "Energy",
  installation: "My installation",
  savings: "Savings and reports",
  alerts: "Notifications",
};

function SiteSwitcher() {
  const { list, siteId, select } = useHostSite();
  if (list.length < 2) return null;
  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-2">
      <span className="max-sm:sr-only">Site</span>
      <select
        value={siteId}
        onChange={(e) => select(e.target.value)}
        className="h-9 rounded-ctl border border-line-strong bg-surface px-2 text-sm text-ink max-md:h-11"
        aria-label="Choose a site"
      >
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function HostApp() {
  const loc = useLocation();
  const { site, search } = useHostSite();
  const notes = useNotifications();
  const unread = (notes.data ?? []).filter((n) => n.read === false && (!site || !n.siteId || n.siteId === site.id)).length;
  const seg = loc.pathname.replace(/^\/host\/?/, "").split("/")[0];
  const nav: NavItem[] = [
    { to: `/host${search}`, label: "Today", short: "Today", icon: Sun, end: true },
    { to: `/host/energy${search}`, label: "Energy", short: "Energy", icon: ChartColumn },
    { to: `/host/installation${search}`, label: "My installation", short: "Servers", icon: Server },
    { to: `/host/savings${search}`, label: "Savings and reports", short: "Savings", icon: Wallet },
    { to: `/host/alerts${search}`, label: "Notifications", short: "Alerts", icon: Bell, badge: unread > 99 ? 99 : unread },
  ];
  const title = (
    <span className="flex flex-col">
      <span>{titles[seg] ?? "Today"}</span>
      {site && <span className="text-xs font-normal text-ink-3">{site.name}</span>}
    </span>
  );
  return (
    <PortalShell
      product={terms.hostPortal}
      nav={nav}
      tabs
      title={title}
      actions={<SiteSwitcher />}
      footer={
        <a href="mailto:support@digitalheat.example" className="flex min-h-10 items-center gap-3 rounded-ctl px-3 text-sm text-[#A9B6C9] hover:bg-white/5 hover:text-white">
          <LifeBuoy aria-hidden className="h-[18px] w-[18px]" />
          Help and contact
        </a>
      }
    >
      <PanelBoundary label="This screen">
        <Suspense fallback={<p className="text-sm text-ink-3">Loading…</p>}>
          <Routes>
            <Route index element={<TodayPage />} />
            <Route path="energy" element={<EnergyPage />} />
            <Route path="installation" element={<InstallationPage />} />
            <Route path="savings" element={<SavingsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="*" element={<TodayPage />} />
          </Routes>
        </Suspense>
      </PanelBoundary>
    </PortalShell>
  );
}
