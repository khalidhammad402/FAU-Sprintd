/**
 * Owns the one WebSocket (or the mock replay) for the logged-in user, subscribes the role's channels,
 * feeds every message through reconcile(), and lets screens add channels while they are open
 * (site drawer -> site:{id}, server drawer -> server:{id}, task detail -> task:{id}).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "@/api/client";
import { adminApi, hostApi } from "@/api/adapters";
import { qk } from "@/api/queries";
import { env, isMock } from "@/lib/env";
import { time } from "@/lib/time";
import type { User, WsMessage } from "@/api/types";
import { LiveSocket, type Transport } from "./socket";
import { reconcile } from "./reconcile";
import { useLive } from "./store";

const Ctx = createContext<Transport | null>(null);

async function roleChannels(user: User): Promise<string[]> {
  if (user.role === "admin") {
    // site:{id} carries the task lifecycle events the Events screen and the map need fleet-wide
    const sites = await adminApi.sites().catch(() => []);
    return ["fleet", ...sites.map((s) => `site:${s.id}`)];
  }
  if (user.role === "customer") return ["customer"];
  const sites = await hostApi.sites().catch(() => []);
  return sites.map((s) => `site-owner:${s.id}`);
}

export function LiveProvider({ user, children }: { user: User; children: ReactNode }) {
  const qc = useQueryClient();
  const [transport, setTransport] = useState<Transport | null>(null);
  const roleRef = useRef(user.role);
  roleRef.current = user.role;

  useEffect(() => {
    let cancelled = false;
    let t: Transport | null = null;
    let offMsg = () => {};
    let offState = () => {};
    (async () => {
      if (isMock) {
        const { MockTransport } = await import("@/mocks/replay");
        t = new MockTransport(user);
      } else {
        t = new LiveSocket(env.wsBase, auth.token ?? "");
      }
      if (cancelled) return;
      offState = t.onState((s) => useLive.getState().setConn(s));
      offMsg = t.onMessage((m: WsMessage) => {
        if (roleRef.current !== "admin" && m.time) useLive.getState().setSimNow(time.addMinutes(m.time, 15));
        reconcile(m, { qc });
      });
      t.connect();
      t.subscribe(await roleChannels(user));
      if (!cancelled) setTransport(t);
      // seed what REST knows before the first push
      if (user.role === "admin") {
        adminApi.scheduler().then((s) => {
          useLive.getState().setClock(s);
          qc.setQueryData(qk.admin.scheduler, s);
        }, () => {});
        adminApi.events({ limit: 100 }).then((p) => useLive.getState().seedAlerts(p.items), () => {});
      }
      if (user.role === "site_owner") {
        hostApi.sites().then(
          (sites) => sites[0] && hostApi.overview(sites[0].id).then((o) => useLive.getState().setSimNow(o.time), () => {}),
          () => {},
        );
      }
    })();
    return () => {
      cancelled = true;
      offMsg();
      offState();
      t?.close();
      useLive.getState().reset();
    };
  }, [user, qc]);

  return <Ctx.Provider value={transport}>{children}</Ctx.Provider>;
}

export const useTransport = () => useContext(Ctx);

/** Subscribe extra channels while the calling component is mounted. */
export function useChannels(channels: (string | null | undefined | false)[]) {
  const t = useTransport();
  const list = useMemo(() => channels.filter(Boolean) as string[], [channels.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!t || !list.length) return;
    t.subscribe(list);
    return () => t.unsubscribe(list);
  }, [t, list]);
}
