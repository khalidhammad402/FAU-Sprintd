import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { roleHome, type Role } from "@/lib/terms";
import { useAuth } from "./auth-store";
import { NotFound, RoleGuard, RouteError } from "./guards";
import { Login } from "./Login";

// one lazy chunk per experience; the map libraries load only with /ops
const OpsApp = lazy(() => import("@/features/ops/OpsApp"));
const ComputeApp = lazy(() => import("@/features/compute/ComputeApp"));
const HostApp = lazy(() => import("@/features/host/HostApp"));

function Loading() {
  return (
    <div className="grid h-full place-items-center" aria-busy="true">
      <span className="text-sm text-ink-3">Loading…</span>
    </div>
  );
}
const s = (n: ReactNode) => <Suspense fallback={<Loading />}>{n}</Suspense>;

function Home() {
  const user = useAuth((x) => x.user);
  return <Navigate to={user ? roleHome[user.role as Role] : "/login"} replace />;
}

export const router = createBrowserRouter([
  { path: "/", element: <Home />, errorElement: <RouteError /> },
  { path: "/login", element: <Login />, errorElement: <RouteError /> },
  { path: "/ops/*", element: <RoleGuard role="admin">{s(<OpsApp />)}</RoleGuard>, errorElement: <RouteError /> },
  { path: "/compute/*", element: <RoleGuard role="customer">{s(<ComputeApp />)}</RoleGuard>, errorElement: <RouteError /> },
  { path: "/host/*", element: <RoleGuard role="site_owner">{s(<HostApp />)}</RoleGuard>, errorElement: <RouteError /> },
  { path: "*", element: <NotFound /> },
], { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } });
