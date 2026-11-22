/** Drawer, Pop (popover), InfoPop, Tip (tooltip), ConfirmDialog */
import { useEffect, useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMotion } from "@/lib/motion";
import { Button, IconButton } from "./primitives";

/**
 * Side drawer over the page. Not modal for the pointer (the map stays clickable), but Tab and Shift+Tab
 * stay inside it, Escape closes it and focus returns to where it came from.
 */
export function Drawer({ label, onClose, head, children, width = 440, className }: { label: string; onClose: () => void; head: ReactNode; children: ReactNode; width?: number; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { reduced } = useMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const sel = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(sel))?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=alertdialog]")) return onClose();
      if (e.key !== "Tab" || !el.contains(document.activeElement)) return;
      const f = [...el.querySelectorAll<HTMLElement>(sel)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <motion.aside
      ref={ref}
      role="dialog"
      aria-label={label}
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? undefined : { opacity: 0, x: 24, transition: { duration: 0.2 } }}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      style={{ width }}
      className={cn(
        "fixed bottom-3 right-3 top-[76px] z-40 flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-drawer border border-line bg-surface shadow-pop max-md:inset-0 max-md:top-0 max-md:max-w-none max-md:rounded-none",
        className,
      )}
    >
      <div className="shrink-0 px-5 pt-4">{head}</div>
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 scrollbar-thin">{children}</div>
    </motion.aside>
  );
}

export function DrawerClose({ onClose }: { onClose: () => void }) {
  return <IconButton data-autofocus icon={X} label="Close" onClick={onClose} />;
}

export function Pop({ trigger, children, align = "start", width = 300, label }: { trigger: ReactNode; children: ReactNode; align?: "start" | "center" | "end"; width?: number; label: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          aria-label={label}
          style={{ width }}
          className="z-50 rounded-card border border-line-strong bg-surface p-4 text-sm text-ink shadow-pop outline-none data-[state=open]:animate-rise"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function InfoPop({ label = "How this is calculated", children, align = "end" }: { label?: string; children: ReactNode; align?: "start" | "center" | "end" }) {
  return (
    <Pop
      label={label}
      align={align}
      trigger={
        <button type="button" aria-label={label} className="inline-grid h-6 w-6 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
          <Info aria-hidden className="h-3.5 w-3.5" />
        </button>
      }
    >
      {children}
    </Pop>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={250}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-ctl bg-ink px-2.5 py-1.5 text-xs text-bg shadow-pop">
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep as is",
  danger,
  busy,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[rgb(3_8_18/0.5)] data-[state=open]:animate-rise" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-[61] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-drawer border border-line-strong bg-surface p-6 shadow-pop"
        >
          <Dialog.Title className="text-md font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-ink-2">{body}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button autoFocus>{cancelLabel}</Button>
            </Dialog.Close>
            <Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
