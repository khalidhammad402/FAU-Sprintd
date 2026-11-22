/** RoleGuard, Forbidden view, NotFound view and a per-route error boundary. */
import { Component, type ReactNode } from "react";
import { Link, Navigate, useLocation, useRouteError } from "react-router-dom";
import { AlertOctagon, Lock } from "lucide-react";
import { Button, EmptyState, ErrorState } from "@/design-system";
import { roleHome, roleLabel, type Role } from "@/lib/terms";
import { LiveProvider } from "@/live/LiveProvider";
import { useAuth } from "./auth-store";

export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.role !== role) return <Forbidden need={role} have={user.role as Role} />;
  return (
    <LiveProvider user={user}>
      {children}
    </LiveProvider>
  );
}

export function Forbidden({ need, have }: { need: Role; have: Role }) {
  return (
    <main className="grid min-h-full place-items-center p-6">
      <EmptyState
        icon={Lock}
        title="This area is for another role"
        body={`You are signed in as ${roleLabel[have]}. This page belongs to the ${roleLabel[need]} view, so its data is not shown to you.`}
        action={
          <Link to={roleHome[have]}>
            <Button variant="primary">Go to my view</Button>
          </Link>
        }
      />
    </main>
  );
}

export function NotFound() {
  const user = useAuth((s) => s.user);
  return (
    <main className="grid min-h-full place-items-center p-6">
      <EmptyState
        title="Page not found"
        body="The address does not match a page in DigitalHeat."
        action={
          <Link to={user ? roleHome[user.role as Role] : "/login"}>
            <Button variant="primary">Back to start</Button>
          </Link>
        }
      />
    </main>
  );
}

export function RouteError() {
  const err = useRouteError();
  return (
    <main className="grid min-h-full place-items-center p-6">
      <ErrorState error={err} title="This screen failed to load" onRetry={() => location.reload()} />
    </main>
  );
}

/** Catches render errors inside one panel so the rest of the screen keeps working. */
export class PanelBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[${this.props.label ?? "panel"}]`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex items-center gap-3 rounded-card border border-critical/40 bg-critical/10 p-4 text-sm">
        <AlertOctagon aria-hidden className="h-4 w-4 text-critical-ink" />
        <span>{this.props.label ?? "This panel"} could not be drawn.</span>
        <Button size="sm" className="ml-auto" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}
