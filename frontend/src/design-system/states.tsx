/** EmptyState, ErrorState, Skeleton, QueryState, ConnectionBanner, MockPill */
import { useEffect, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertOctagon, RefreshCw, SearchX, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/api/client";
import { useLive } from "@/live/store";
import { useTransport } from "@/live/LiveProvider";
import { isMock } from "@/lib/env";
import { Button } from "./primitives";

export function EmptyState({ icon: I = SearchX, title, body, action, compact }: { icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", compact ? "px-4 py-6" : "min-h-[220px] px-6 py-10")}>
      <span className="mb-1 grid h-11 w-11 place-items-center rounded-card border border-line bg-surface-2 text-ink-3">
        <I aria-hidden className="h-5 w-5" />
      </span>
      <p className="text-md font-semibold text-ink">{title}</p>
      {body && <p className="max-w-[46ch] text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact, title = "This view could not be loaded" }: { error: unknown; onRetry?: () => void; compact?: boolean; title?: string }) {
  const e = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 text-center", compact ? "px-4 py-6" : "min-h-[220px] px-6 py-10")}>
      <span className="mb-1 grid h-11 w-11 place-items-center rounded-card border border-critical/40 bg-critical/10 text-critical-ink">
        <AlertOctagon aria-hidden className="h-5 w-5" />
      </span>
      <p className="text-md font-semibold">{title}</p>
      <p className="max-w-[46ch] text-sm text-ink-2">{e?.message ?? "Something went wrong while loading. Nothing was changed."}</p>
      {e && <code className="font-mono text-2xs text-ink-3">{`${e.status || "network"} ${e.code}`}</code>}
      {onRetry && (
        <Button className="mt-2" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block h-3", className)} />;
}

/**
 * Four states for every query: skeleton (in the final layout's shape), error with retry,
 * empty with one helpful action, and content. Content dims while the socket reconnects.
 */
export function QueryState<T>({
  query,
  skeleton,
  empty,
  isEmpty,
  children,
  errorTitle,
}: {
  query: Pick<UseQueryResult<T>, "data" | "isPending" | "isError" | "error" | "refetch">;
  skeleton: ReactNode;
  empty?: ReactNode;
  isEmpty?: (d: T) => boolean;
  children: (d: T) => ReactNode;
  errorTitle?: string;
}) {
  const stale = useLive((s) => s.conn.state === "reconnecting");
  if (query.isPending) return <div aria-busy="true">{skeleton}</div>;
  if (query.isError && query.data === undefined) return <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />;
  const d = query.data as T;
  if (empty && (isEmpty ? isEmpty(d) : Array.isArray(d) && d.length === 0)) return <>{empty}</>;
  return <div className={cn("animate-rise", stale && "stale")}>{children(d)}</div>;
}

/** WebSocket lost: banner slides down, data dims, a retry countdown is visible. */
export function ConnectionBanner() {
  const conn = useLive((s) => s.conn);
  const t = useTransport();
  const [, force] = useState(0);
  useEffect(() => {
    if (conn.state !== "reconnecting") return;
    const i = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(i);
  }, [conn.state]);
  if (conn.state !== "reconnecting") return null;
  const secs = conn.nextRetryAt ? Math.max(0, Math.ceil((conn.nextRetryAt - Date.now()) / 1000)) : 0;
  return (
    <div role="status" aria-live="polite" className="flex animate-rise items-center gap-3 border-b border-dump/40 bg-dump/15 px-4 py-2 text-sm text-dump-ink">
      <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
      <span>
        <b>Live connection lost.</b> Showing the last values received. Retrying {secs > 0 ? `in ${secs} s` : "now"} (attempt {conn.attempts}).
      </span>
      <Button size="sm" className="ml-auto" icon={RefreshCw} onClick={() => t?.retryNow()}>
        Retry now
      </Button>
    </div>
  );
}

export function MockPill() {
  if (!isMock) return null;
  return (
    <span title="Mock data: recorded backend responses and WebSocket messages, no backend connected" className="inline-flex h-6 items-center rounded-full border border-dashed border-dump/60 px-2.5 text-2xs font-semibold text-dump-ink">
      Mock data
    </span>
  );
}
