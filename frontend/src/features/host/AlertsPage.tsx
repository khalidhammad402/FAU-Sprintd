import { useState } from "react";
import { Bell, Check, CheckCheck, Mail } from "lucide-react";
import { useMarkRead, useNotifications } from "@/api/queries";
import type { Notification } from "@/api/types";
import { Button, Card, EmptyState, QueryState, Segmented, Skeleton, toneAlpha, toneText } from "@/design-system";
import { cn } from "@/lib/cn";
import { time } from "@/lib/time";
import { adviceFor } from "./content";
import { useHostSite } from "./site";

const PAGE = 15;

/** Repeated notices of one kind on one day become one card ("12 times between 02:15 and 08:45"). */
export type NoteGroup = { key: string; kind: string; read: boolean; items: Notification[] };
export function groupNotifications(list: Notification[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const n of list) {
    const key = `${n.kind}|${time.ymd(n.time)}|${n.read ? "r" : "u"}`;
    const g = groups.get(key) ?? { key, kind: n.kind, read: n.read, items: [] };
    g.items.push(n);
    groups.set(key, g);
  }
  const all = [...groups.values()].map((g) => ({ ...g, items: [...g.items].sort((a, b) => (a.time < b.time ? 1 : -1)) }));
  return all.sort((a, b) => (a.read !== b.read ? (a.read ? 1 : -1) : a.items[0].time < b.items[0].time ? 1 : -1));
}

function GroupCard({ g, onToggle, busy }: { g: NoteGroup; onToggle: () => void; busy: boolean }) {
  const a = adviceFor(g.kind);
  const latest = g.items[0];
  const first = g.items[g.items.length - 1];
  return (
    <li>
      <Card className={cn("grid grid-cols-[32px_1fr] gap-3 p-4", g.read && "opacity-70")} style={g.read ? undefined : { borderLeft: `3px solid ${toneAlpha(a.tone, 1)}` }}>
        <span className={cn("grid h-8 w-8 place-items-center rounded-ctl", g.read ? "text-ink-3" : toneText[a.tone])} style={{ background: g.read ? "rgb(var(--surface-2))" : toneAlpha(a.tone, 0.12) }}>
          {g.read ? <Check aria-hidden className="h-4 w-4" /> : <Bell aria-hidden className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className={cn("text-sm", g.read ? "font-medium" : "font-semibold")}>
              {a.title}
              {!g.read && <span className="sr-only"> (unread)</span>}
            </h3>
            <time dateTime={latest.time} className="text-xs text-ink-3 tnum">
              {time.dayTime(latest.time)}
            </time>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {g.items.length > 1 ? `${g.items.length} times between ${time.hm(first.time)} and ${time.hm(latest.time)}. ` : ""}
            {latest.message}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-medium text-ink">Recommended next action: </span>
            <span className="text-ink-2">{a.next}</span>
          </p>
          <Button size="sm" variant="ghost" className="-ml-2 mt-1 max-md:h-11" disabled={busy} onClick={onToggle} icon={g.read ? Mail : Check}>
            {g.read ? "Mark as unread" : "Mark as read"}
          </Button>
        </div>
      </Card>
    </li>
  );
}

export default function AlertsPage() {
  const { site } = useHostSite();
  const q = useNotifications();
  const mark = useMarkRead();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [shown, setShown] = useState(PAGE);
  const setMany = (items: Notification[], read: boolean) => items.forEach((n) => mark.mutate({ id: n.id, read }));
  return (
    <QueryState
      query={q}
      skeleton={
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="flex flex-col gap-2 p-4">
              <Skeleton className="w-1/2" />
              <Skeleton className="w-5/6" />
              <Skeleton className="w-2/3" />
            </Card>
          ))}
        </div>
      }
      empty={
        <Card>
          <EmptyState icon={Bell} title="No notifications" body="We will tell you here when something needs your attention, with a recommended next action." />
        </Card>
      }
      errorTitle="Notifications could not be loaded"
    >
      {(all) => {
        const mine = all.filter((n) => !site || !n.siteId || n.siteId === site.id);
        const unread = mine.filter((n) => !n.read);
        const groups = groupNotifications(filter === "unread" ? unread : mine);
        const list = groups.slice(0, shown);
        const visibleUnread = list.filter((g) => !g.read).flatMap((g) => g.items);
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                label="Show"
                value={filter}
                onChange={(f) => {
                  setFilter(f);
                  setShown(PAGE);
                }}
                options={[
                  { value: "all", label: `All ${mine.length}` },
                  { value: "unread", label: `Unread ${unread.length}` },
                ]}
              />
              {visibleUnread.length > 0 && (
                <Button size="sm" icon={CheckCheck} disabled={mark.isPending} onClick={() => setMany(visibleUnread, true)}>
                  Mark shown as read
                </Button>
              )}
            </div>
            {list.length === 0 ? (
              <Card>
                <EmptyState compact icon={CheckCheck} title="All caught up" body="Every notification has been read." action={<Button onClick={() => setFilter("all")}>Show all</Button>} />
              </Card>
            ) : (
              <ul className="flex flex-col gap-3" aria-live="polite">
                {list.map((g) => (
                  <GroupCard key={g.key} g={g} busy={mark.isPending} onToggle={() => setMany(g.items, !g.read)} />
                ))}
              </ul>
            )}
            {groups.length > shown && (
              <Button className="self-center max-md:h-11" onClick={() => setShown((s) => s + PAGE)}>
                Show older notifications
              </Button>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}
