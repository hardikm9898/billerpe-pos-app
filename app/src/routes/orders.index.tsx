import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/pos/AppShell";
import { OrderRow } from "@/components/pos/OrderRow";
import { PullToRefresh } from "@/components/pos/PullToRefresh";
import { Chip, EmptyState, ErrorState, ListSkeleton, Spinner } from "@/components/pos/primitives";
import { Input } from "@/components/ui/input";
import {
  NetworkError,
  type OrderListRange,
  type OrderListStatus,
  type OrderPage,
} from "@/lib/pos/backend/types";
import { backend, usePos } from "@/lib/pos/store";
import type { Order } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/")({
  component: OrdersPage,
});

const tabs: { id: OrderListStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "settled", label: "Settled" },
  { id: "cancelled", label: "Cancelled" },
  { id: "due", label: "Due" },
];

const ranges: { id: OrderListRange; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

/**
 * Every order, newest first, loaded from the server 20 at a time as the list
 * is scrolled (owner bug list 2026-09-26): status tabs, business-day ranges
 * (All by default) and a search that runs on the server - bill no, token,
 * customer name or mobile, table.
 */
function OrdersPage() {
  const pos = usePos();
  const [tab, setTab] = useState<OrderListStatus>("all");
  const [range, setRange] = useState<OrderListRange>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState<OrderPage | null>(null);
  const [pageNo, setPageNo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const rangeReady = tab === "running" || range !== "custom" || Boolean(custom.from && custom.to);

  const fetchPage = useCallback(
    async (n: number, quiet = false) => {
      if (!rangeReady) return;
      const id = ++request.current;
      if (n === 0 && !quiet) setLoading(true);
      if (n > 0) setMore(true);
      setFailed(false);
      try {
        const r = await backend.listOrders({
          status: tab,
          range: { key: range, from: custom.from, to: custom.to },
          search,
          page: n,
        });
        if (id !== request.current) return; // a newer filter won
        setPage(r);
        setPageNo(n);
        setOrders((prev) =>
          n === 0
            ? r.orders
            : [...prev, ...r.orders.filter((o) => !prev.some((p) => p.id === o.id))],
        );
      } catch (e) {
        if (id !== request.current) return;
        if (n === 0 && !quiet) setFailed(true);
        if (n > 0)
          toast.error(
            e instanceof NetworkError ? "No internet connection" : "Could not load more orders",
          );
      } finally {
        if (id === request.current) {
          setLoading(false);
          setMore(false);
        }
      }
    },
    [tab, range, custom.from, custom.to, search, rangeReady],
  );

  // New filter: back to the first page.
  useEffect(() => {
    void fetchPage(0);
  }, [fetchPage]);

  // Live updates (another phone's KOT, a settle): the first page follows
  // along quietly while older pages have not been opened.
  const dataStamp = pos.data;
  useEffect(() => {
    if (pageNo === 0 && !loading) void fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStamp]);

  // The next page when the end of the list comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !page?.hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !more && !loading) void fetchPage(pageNo + 1);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [page, pageNo, more, loading, fetchPage, orders.length]);

  return (
    <AppShell title="Orders">
      <PullToRefresh onRefresh={() => fetchPage(0)}>
        <NotPrinted />
        <div className="flex gap-1 rounded-md bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "tap min-w-0 flex-1 whitespace-nowrap rounded-md px-1 text-xs font-semibold sm:text-sm",
                tab === t.id ? "bg-card text-primary shadow-soft" : "text-muted-foreground",
              )}
            >
              {t.label}
              {page && (t.id === "running" || t.id === "due") ? ` ${page.counts[t.id]}` : ""}
            </button>
          ))}
        </div>

        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="tap pl-9"
            placeholder="Bill no, name, mobile, table or token"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {tab !== "running" ? (
          <div className="mt-3 space-y-2">
            <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
              {ranges.map((r) => (
                <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
                  {r.label}
                </Chip>
              ))}
            </div>
            {range === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  From
                  <Input
                    type="date"
                    className="tap mt-1"
                    value={custom.from}
                    max={custom.to || undefined}
                    onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  To
                  <Input
                    type="date"
                    className="tap mt-1"
                    value={custom.to}
                    min={custom.from || undefined}
                    onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {page && !loading && rangeReady ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {page.total} order{page.total === 1 ? "" : "s"}
          </p>
        ) : null}

        <div className="mt-2 space-y-2">
          {!rangeReady ? (
            <EmptyState
              icon={<ClipboardList className="size-6" />}
              title="Pick the dates"
              body="Choose From and To to see those days."
            />
          ) : loading ? (
            <ListSkeleton rows={5} />
          ) : failed ? (
            <ErrorState onRetry={() => void fetchPage(0)} />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-6" />}
              title="No orders here"
              body={
                search ? "Nothing matches your search." : "Orders will show up as they come in."
              }
            />
          ) : (
            <>
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
              <div ref={sentinel} className="flex justify-center py-3">
                {more ? (
                  <Spinner />
                ) : page?.hasMore ? null : (
                  <span className="text-xs text-muted-foreground">All orders shown</span>
                )}
              </div>
            </>
          )}
        </div>
      </PullToRefresh>
    </AppShell>
  );
}

/** KOTs saved on the server that did not print on this device. */
function NotPrinted() {
  const pos = usePos();
  const [busy, setBusy] = useState<string | null>(null);
  if (!pos.pendingPrints.length) return null;
  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary-soft p-3">
      <p className="font-display text-sm font-bold text-primary-soft-foreground">
        Not printed ({pos.pendingPrints.length})
      </p>
      <p className="text-xs text-primary-soft-foreground/80">
        These KOTs are saved and on the kitchen screen, but did not print on this device.
      </p>
      <ul className="mt-2 space-y-2">
        {pos.pendingPrints.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-md bg-card p-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-semibold">
                KOT #{p.kotNo} · {p.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {p.printerName} · {p.error}
              </span>
            </span>
            <Button
              size="sm"
              className="tap"
              disabled={busy === p.id}
              onClick={async () => {
                setBusy(p.id);
                const ok = await pos.retryPending(p.id);
                setBusy(null);
                toast[ok ? "success" : "error"](ok ? "Printed" : "Still not reachable");
              }}
            >
              Retry
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="tap"
              onClick={() => pos.dropPending(p.id)}
            >
              Done
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
