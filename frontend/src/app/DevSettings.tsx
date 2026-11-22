/** Hidden presenter sheet (Shift + D): API address, mock mode, reduced motion, connection diagnostics. */
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { diagnostics } from "@/api/client";
import { metaApi } from "@/api/adapters";
import { Button, Field, IconButton, inputClass } from "@/design-system";
import { env, setRuntimeOverride, type DemoMode } from "@/lib/env";
import { isReducedMotion, setReducedMotion } from "@/lib/motion";
import { useLive } from "@/live/store";

export function DevSettings() {
  const [open, setOpen] = useState(false);
  const [apiBase, setApiBase] = useState(env.apiBase);
  const [mode, setMode] = useState<DemoMode>(env.mode);
  const [ping, setPing] = useState<string>("–");
  const conn = useLive((s) => s.conn);
  const [, tick] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable]");
      if (e.shiftKey && e.key.toLowerCase() === "d" && !typing) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const i = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, [open]);
  const test = async () => {
    const t0 = performance.now();
    try {
      await metaApi.health();
      setPing(`${Math.round(performance.now() - t0)} ms, ok`);
    } catch (e) {
      setPing(e instanceof Error ? e.message : "failed");
    }
  };
  const apply = () => {
    setRuntimeOverride({ apiBase, wsBase: apiBase.replace(/^http/, "ws") + "/ws", mode });
    location.reload();
  };
  const age = conn.lastMessageAt ? `${Math.round((Date.now() - conn.lastMessageAt) / 1000)} s ago` : "none yet";
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[rgb(3_8_18/0.45)]" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-[71] flex w-[min(400px,100vw)] flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-6 shadow-pop">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-md font-semibold">Presenter settings</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton icon={X} label="Close" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-ink-2">Only for setting up a demo. Changes apply after a reload and last for this browser tab.</Dialog.Description>
          <Field label="API address" htmlFor="api" hint="The WebSocket address is derived from it.">
            <input id="api" className={inputClass} value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold text-ink-2">Data</legend>
            {(["live", "mock"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="accent-[rgb(var(--tank))]" />
                {m === "live" ? "Live: the real backend" : "Mock: recorded responses and messages, no backend"}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={isReducedMotion()} onChange={(e) => setReducedMotion(e.target.checked || null)} className="accent-[rgb(var(--tank))]" />
            Reduce motion
          </label>
          <div className="flex gap-2">
            <Button variant="primary" onClick={apply}>
              Apply and reload
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRuntimeOverride(null);
                location.reload();
              }}
            >
              Reset to defaults
            </Button>
          </div>
          <section className="rounded-card border border-line p-4">
            <h3 className="mb-3 text-sm font-semibold">Connection diagnostics</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-3">Mode</dt>
              <dd>{env.mode}</dd>
              <dt className="text-ink-3">REST latency</dt>
              <dd className="tnum">{diagnostics.lastLatencyMs != null ? `${diagnostics.lastLatencyMs} ms (last request)` : "–"}</dd>
              <dt className="text-ink-3">Last REST error</dt>
              <dd>{diagnostics.lastError ?? "none"}</dd>
              <dt className="text-ink-3">WebSocket</dt>
              <dd>
                {conn.state}
                {conn.attempts ? `, retry ${conn.attempts}` : ""}
              </dd>
              <dt className="text-ink-3">Last message</dt>
              <dd className="tnum">{age}</dd>
              <dt className="text-ink-3">Health check</dt>
              <dd className="tnum">{ping}</dd>
            </dl>
            <Button size="sm" className="mt-3" onClick={test}>
              Test API
            </Button>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
