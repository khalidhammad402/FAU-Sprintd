/** DataTable, FilterChips, Segmented, Tabs */
import { useMemo, useRef, useState, type ReactNode } from "react";
import * as RTabs from "@radix-ui/react-tabs";
import { ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  label: string;
  num?: boolean;
  sortable?: boolean;
  width?: string;
  render?: (r: T) => ReactNode;
  sortValue?: (r: T) => string | number | null | undefined;
};

const ROW_H = 44;

/** Sortable, sticky header, keyboard rows, simple windowing above 200 rows. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRow,
  selectedKey,
  initialSort,
  empty,
  maxHeight = "70vh",
  caption,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  selectedKey?: string | null;
  initialSort?: { key: string; dir: "asc" | "desc" };
  empty?: ReactNode;
  maxHeight?: string;
  caption: string;
  rowClassName?: (r: T) => string | undefined;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = (r: T) => (col.sortValue ? col.sortValue(r) : (r as Record<string, unknown>)[col.key]) as string | number | null | undefined;
    return [...rows].sort((a, b) => {
      const x = val(a),
        y = val(b);
      const c = x == null ? 1 : y == null ? -1 : x > y ? 1 : x < y ? -1 : 0;
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, sort, columns]);
  const virtual = data.length > 200;
  const viewH = ref.current?.clientHeight ?? 600;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_H) - 10) : 0;
  const end = virtual ? Math.min(data.length, start + Math.ceil(viewH / ROW_H) + 20) : data.length;
  const toggle = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return (
    <div
      ref={ref}
      onScroll={virtual ? (e) => setScrollTop((e.target as HTMLDivElement).scrollTop) : undefined}
      className="overflow-auto rounded-card border border-line bg-surface scrollbar-thin"
      style={{ maxHeight }}
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{ width: c.width }}
                aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                className={cn("sticky top-0 z-10 whitespace-nowrap border-b border-line-strong bg-surface p-0 text-left text-xs font-semibold text-ink-2", c.num && "text-right")}
              >
                {c.sortable === false ? (
                  <span className="inline-block px-3.5 py-2.5">{c.label}</span>
                ) : (
                  <button type="button" onClick={() => toggle(c.key)} className={cn("inline-flex w-full items-center gap-1 px-3.5 py-2.5 hover:text-ink", c.num && "justify-end")}>
                    {c.label}
                    {sort?.key === c.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp aria-hidden className="h-3 w-3" />
                      ) : (
                        <ArrowDown aria-hidden className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown aria-hidden className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? <p className="p-8 text-center text-sm text-ink-3">No rows match.</p>}
              </td>
            </tr>
          ) : (
            <>
              {virtual && start > 0 && <tr style={{ height: start * ROW_H }} aria-hidden />}
              {data.slice(start, end).map((r) => {
                const k = rowKey(r);
                const sel = selectedKey === k;
                return (
                  <tr
                    key={k}
                    onClick={onRow ? () => onRow(r) : undefined}
                    onKeyDown={onRow ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRow(r)) : undefined}
                    tabIndex={onRow ? 0 : undefined}
                    aria-selected={onRow ? sel : undefined}
                    style={{ height: ROW_H }}
                    className={cn(
                      "border-b border-line last:border-0",
                      onRow && "cursor-pointer hover:bg-surface-2",
                      sel && "bg-tank/10 shadow-[inset_2px_0_0_rgb(var(--tank))]",
                      rowClassName?.(r),
                    )}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn("whitespace-nowrap px-3.5 py-2", c.num && "text-right tnum")}>
                        {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "–")}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {virtual && end < data.length && <tr style={{ height: (data.length - end) * ROW_H }} aria-hidden />}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

export type FilterGroup = { label: string; value: string | null; onChange: (v: string | null) => void; options: { value: string; label: string; count?: number }[] };
export function FilterChips({ groups }: { groups: FilterGroup[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="Filters">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-ink-3">{g.label}</span>
          {g.options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={g.value === o.value}
              onClick={() => g.onChange(g.value === o.value ? null : o.value)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                g.value === o.value ? "border-tank/60 bg-tank/15 text-ink" : "border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {o.label}
              {o.count != null && <span className="tnum text-ink-3">{o.count}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: V; label: string; icon?: LucideIcon; title?: string }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-ctl border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const I = o.icon;
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium transition-colors duration-150",
              size === "md" ? "h-8 px-3 text-xs" : "h-7 px-2.5 text-2xs",
              value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}
          >
            {I && <I aria-hidden className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onChange}>
      <RTabs.List aria-label={label} className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="relative px-3 py-2.5 text-sm font-medium text-ink-2 hover:text-ink data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded data-[state=active]:after:bg-tank"
          >
            {t.label}
            {t.count != null && <span className="ml-1 tnum text-ink-3">{t.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}
