/** Operations Console routes. Drawers (site, server, task) open from the URL on every screen. */
import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { PanelBoundary } from "@/app/guards";
import { OpsShell } from "./OpsShell";
import { useOpsParams } from "./hooks";

const FleetMapPage = lazy(() => import("./map/FleetMapPage"));
const SitesPage = lazy(() => import("./screens/SitesPage"));
const ServersPage = lazy(() => import("./screens/ServersPage"));
const TasksPage = lazy(() => import("./screens/TasksPage"));
const CustomersPage = lazy(() => import("./screens/CustomersPage"));
const LabPage = lazy(() => import("./screens/LabPage"));
const EventsPage = lazy(() => import("./screens/EventsPage"));
const EconomicsPage = lazy(() => import("./screens/EconomicsPage"));
const SettingsPage = lazy(() => import("./screens/SettingsPage"));
const SiteDrawer = lazy(() => import("./drawers/SiteDrawer"));
const ServerDrawer = lazy(() => import("./drawers/ServerDrawer"));
const TaskDrawer = lazy(() => import("./drawers/TaskDrawer"));

function Drawers() {
  const { get } = useOpsParams();
  const task = get("task"),
    server = get("server"),
    site = get("site");
  return (
    <Suspense fallback={null}>
      <AnimatePresence>
        {task ? <TaskDrawer key={`t${task}`} id={task} /> : server ? <ServerDrawer key={`v${server}`} id={server} /> : site ? <SiteDrawer key={`s${site}`} id={site} /> : null}
      </AnimatePresence>
    </Suspense>
  );
}

export default function OpsApp() {
  const loc = useLocation();
  const isMap = /^\/ops\/?$/.test(loc.pathname);
  return (
    <OpsShell fullBleed={isMap}>
      <PanelBoundary label="This screen">
        <Suspense fallback={<div className="p-8 text-sm text-ink-3">Loading…</div>}>
          <Routes>
            <Route index element={<FleetMapPage />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="servers" element={<ServersPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="lab" element={<LabPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="economics" element={<EconomicsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </PanelBoundary>
      <Drawers />
    </OpsShell>
  );
}
