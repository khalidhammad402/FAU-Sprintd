/** Compute Portal (backend role customer): routes inside the shared portal frame. */
import { lazy, Suspense } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { BarChart3, KeyRound, LayoutDashboard, LifeBuoy, ListChecks, Leaf, Plus, Send } from "lucide-react";
import { PortalShell, type NavItem } from "@/app/PortalShell";
import { PanelBoundary } from "@/app/guards";
import { Button, Skeleton } from "@/design-system";
import { terms } from "@/lib/terms";
import { useMyJobs } from "./data";

const Overview = lazy(() => import("./Overview"));
const SubmitJob = lazy(() => import("./SubmitJob"));
const MyJobs = lazy(() => import("./MyJobs"));
const Usage = lazy(() => import("./Usage"));
const Impact = lazy(() => import("./Impact"));
const ApiKeys = lazy(() => import("./ApiKeys"));

const titles: Record<string, string> = {
  "": "Overview",
  submit: "Submit a job",
  jobs: "My jobs",
  usage: "Usage and invoices",
  impact: "Impact",
  keys: "API keys",
};

function Support() {
  return (
    <a href="mailto:support@digitalheat.example" className="flex min-h-9 items-center gap-2 rounded-ctl px-3 text-sm text-[#A9B6C9] hover:bg-white/5 hover:text-white">
      <LifeBuoy aria-hidden className="h-4 w-4" />
      Support
    </a>
  );
}

export default function ComputeApp() {
  const loc = useLocation();
  const section = loc.pathname.replace(/^\/compute\/?/, "").split("/")[0];
  const running = useMyJobs().jobs.filter((j) => j.status === "running").length;
  const nav: NavItem[] = [
    { to: "/compute", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/compute/submit", label: "Submit job", icon: Send },
    { to: "/compute/jobs", label: "My jobs", icon: ListChecks, badge: running || undefined },
    { to: "/compute/usage", label: "Usage and invoices", icon: BarChart3 },
    { to: "/compute/impact", label: "Impact", icon: Leaf },
    { to: "/compute/keys", label: "API keys", icon: KeyRound },
  ];
  return (
    <PortalShell
      product={terms.computePortal}
      nav={nav}
      title={titles[section] ?? "Compute Portal"}
      footer={<Support />}
      actions={
        section !== "submit" ? (
          <Link to="/compute/submit" className="max-sm:hidden">
            <Button variant="primary" icon={Plus}>
              Submit a job
            </Button>
          </Link>
        ) : undefined
      }
    >
      <PanelBoundary label="This screen">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="submit" element={<SubmitJob />} />
            <Route path="jobs" element={<MyJobs />} />
            <Route path="usage" element={<Usage />} />
            <Route path="impact" element={<Impact />} />
            <Route path="keys" element={<ApiKeys />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </Suspense>
      </PanelBoundary>
    </PortalShell>
  );
}
