import { useSyncExternalStore } from "react";

/** One switch for reduced motion: the OS setting, or the presenter override from the Shift+D sheet. */
const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
let forced: boolean | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
mq?.addEventListener?.("change", notify);

export function setReducedMotion(on: boolean | null) {
  forced = on;
  document.documentElement.classList.toggle("reduced-motion", on === true);
  notify();
}
export const isReducedMotion = () => forced ?? mq?.matches ?? false;

export function useMotion() {
  const reduced = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    isReducedMotion,
    () => false,
  );
  return { reduced };
}
