import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/pos/AppShell";
import { OrderRow } from "@/components/pos/OrderRow";
import { Chip, EmptyState, ErrorState, ListSkeleton } from "@/components/pos/primitives";
import { Input } from "@/components/ui/input";
import { usePos } from "@/lib/pos/store";
import type { Order } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — BillerPe POS" },
      { name: "description", content: "Running, settled, cancelled and due orders with search by bill, mobile or table." },
      { property: "og:title", content: "Orders — BillerPe POS" },
      { property: "og:description", content: "Running, settled, cancelled and due orders with search by bill, mobile or table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});

type Tab = "running" | "settled" | "cancelled" | "due";
type Range = "today" | "yesterday" | "7d";

const tabs: { id: Tab; label: string }[] = [
  { id: "running", label: "Running" },
  { id: "settled", label: "Settled" },
  { id: "cancelled", label: "Cancelled" },
  { id: "due", label: "Due" },
];

function inRange(o: Order, range: Range) {
  const d = new Date(o.settledAt ?? o.createdAt);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "today") return d >= start;
  if (range === "yesterday") {
    const y = new Date(start);
    y.setDate(y.getDate() - 1);
    return d >= y && d < start;
  }
  const w = new Date(start);
  w.setDate(w.getDate() - 6);
  return d >= w;
}

function OrdersPage() {
  const pos = usePos();
  const [tab, setTab] = useState<Tab>("running");
  const [range, setRange] = useState<Range>("today");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    pos.refresh().then(() => setLoading(false), () => { setLoading(false); setFailed(true); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos.orders
      .filter((o) => {
        if (tab === "running") return ["running", "hold", "billed"].includes(o.status);
        if (tab === "settled") return o.status === "settled";
        if (tab === "cancelled") return o.status === "cancelled";
        return (o.dueOutstanding ?? 0) > 0;
      })
      .filter((o) => tab === "running" || tab === "due" || inRange(o, range))
      .filter((o) => {
        if (!q) return true;
        const table = o.tableId ? pos.tableById(o.tableId)?.name ?? "" : "";
        return o.code.toLowerCase().includes(q) || (o.customerMobile ?? "").includes(q) || table.toLowerCase() === q || String(o.tokenNo ?? "") === q;
      })
      .sort((a, b) => (b.settledAt ?? b.createdAt).localeCompare(a.settledAt ?? a.createdAt));
  }, [pos, tab, range, query]);

  const counts = useMemo(
    () => ({
      running: pos.orders.filter((o) => ["running", "hold", "billed"].includes(o.status)).length,
      due: pos.orders.filter((o) => (o.dueOutstanding ?? 0) > 0).length,
    }),
    [pos.orders],
  );

  return (
    <AppShell title="Orders">
      <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("tap rounded-md text-xs font-semibold sm:text-sm", tab === t.id ? "bg-card text-primary shadow-soft" : "text-muted-foreground")}>
            {t.label}
            {t.id === "running" || t.id === "due" ? ` ${counts[t.id]}` : ""}
          </button>
        ))}
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="tap pl-9" placeholder="Bill no, mobile or table" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {tab === "settled" || tab === "cancelled" ? (
        <div className="mt-3 flex gap-2">
          <Chip active={range === "today"} onClick={() => setRange("today")}>Today</Chip>
          <Chip active={range === "yesterday"} onClick={() => setRange("yesterday")}>Yesterday</Chip>
          <Chip active={range === "7d"} onClick={() => setRange("7d")}>Last 7 days</Chip>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : failed ? (
          <ErrorState onRetry={load} />
        ) : list.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-6" />} title="No orders here" body={query ? "Nothing matches your search." : "Orders will show up as they come in."} />
        ) : (
          list.map((o) => <OrderRow key={o.id} order={o} />)
        )}
      </div>
    </AppShell>
  );
}
