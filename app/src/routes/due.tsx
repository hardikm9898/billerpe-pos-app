import { createFileRoute, Link } from "@tanstack/react-router";
import { HandCoins, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { RefundSheet } from "@/components/pos/billing/RefundSheet";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, SectionTitle, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateTime, money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { DueCollection, Order, RefundOwed } from "@/lib/pos/types";

export const Route = createFileRoute("/due")({
  component: DuePage,
});

interface DueCustomer {
  mobile: string;
  name: string;
  outstanding: number;
  bills: Order[];
  collections: DueCollection[];
}

/** Customers with bills settled (partly) as Due, and what they paid back. */
function useDueCustomers(): DueCustomer[] {
  const pos = usePos();
  return useMemo(() => {
    const map = new Map<string, DueCustomer>();
    for (const o of pos.data?.orders ?? []) {
      // A bill stays in the ledger once its due is paid off (the payments then show the mode it was paid in).
      const hadDue =
        (o.dueOutstanding ?? 0) > 0 || o.timeline.some((e) => e.label.startsWith("Due collected"));
      if (!o.customerMobile || !hadDue) continue;
      const c = map.get(o.customerMobile) ?? {
        mobile: o.customerMobile,
        name: o.customerName ?? "Customer",
        outstanding: 0,
        bills: [],
        collections: [],
      };
      c.bills.push(o);
      c.outstanding = Math.round((c.outstanding + (o.dueOutstanding ?? 0)) * 100) / 100;
      map.set(o.customerMobile, c);
    }
    for (const col of pos.data?.dueCollections ?? [])
      map.get(col.customerMobile)?.collections.push(col);
    return [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [pos.data]);
}

function DuePage() {
  const pos = usePos();
  const dueCustomers = useDueCustomers();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dueCustomers.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q),
    );
  }, [dueCustomers, query]);
  const totalDue = dueCustomers.reduce((a, c) => a + c.outstanding, 0);
  const customer = dueCustomers.find((c) => c.mobile === selected);
  const refunds = pos.data?.refundsOwed ?? [];
  const [refund, setRefund] = useState<RefundOwed | null>(null);

  return (
    <AppShell title="Due ledger">
      <div className="rounded-lg bg-primary-soft p-4 text-primary-soft-foreground">
        <p className="text-sm font-semibold">Total outstanding</p>
        <p className="num font-display text-3xl font-extrabold">{money(totalDue)}</p>
        <p className="text-xs">{dueCustomers.filter((c) => c.outstanding > 0).length} customers</p>
      </div>
      {refunds.length ? (
        <section className="mt-4 space-y-2">
          <SectionTitle>Refunds owed</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Edited bills that came out lower than what was paid. Hand the money back and mark it
            here.
          </p>
          <ul className="space-y-2">
            {refunds.map((r) => (
              <li
                key={r.orderId}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft"
              >
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: r.orderId }}
                  className="min-w-0 flex-1"
                >
                  <p className="font-semibold">Bill {r.billNo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.customerName, r.customerMobile, dateTime(r.at)].filter(Boolean).join(" · ")}
                  </p>
                </Link>
                <span className="num font-semibold text-status-billed">{money(r.amount)}</span>
                <Button size="sm" variant="outline" className="tap" onClick={() => setRefund(r)}>
                  Refunded
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="tap pl-9"
          placeholder="Name or mobile"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="mt-3 space-y-2">
        {list.length === 0 ? (
          <EmptyState
            icon={<HandCoins className="size-6" />}
            title="No dues"
            body="Bills settled as Due show up here."
          />
        ) : (
          list.map((c) => (
            <button
              key={c.mobile}
              type="button"
              onClick={() => setSelected(c.mobile)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-soft"
            >
              <div className="flex size-11 items-center justify-center rounded-full bg-muted font-display font-bold">
                {c.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <span translate="no">{c.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.mobile} · {c.bills.length} {c.bills.length === 1 ? "bill" : "bills"}
                </p>
              </div>
              <span
                className={`num ${c.outstanding > 0 ? "text-status-hold" : "text-status-ready"}`}
              >
                {c.outstanding > 0 ? money(c.outstanding) : "Cleared"}
              </span>
            </button>
          ))
        )}
      </div>
      {customer ? <CustomerSheet customer={customer} onClose={() => setSelected(null)} /> : null}
      <RefundSheet refund={refund} onClose={() => setRefund(null)} />
    </AppShell>
  );
}

function CustomerSheet({ customer, onClose }: { customer: DueCustomer; onClose: () => void }) {
  const pos = usePos();
  const [amt, setAmt] = useState(customer.outstanding);
  const [mode, setMode] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modes = pos.data!.settings.paymentModes.filter((m) => m.id !== "due" && m.active);
  const modeName = (id: string) =>
    pos.data!.settings.paymentModes.find((m) => m.id === id)?.name ?? id;

  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={customer.name}
      description={`${customer.mobile} · outstanding ${money(customer.outstanding)}`}
      footer={
        customer.outstanding > 0 ? (
          <Button
            className="tap w-full"
            disabled={busy || amt <= 0}
            onClick={async () => {
              setBusy(true);
              const res = await pos.act((b) => b.collectDue(customer.mobile, amt, mode));
              setBusy(false);
              if (res.ok) {
                toast.success(`${money(amt)} collected from ${customer.name}`);
                onClose();
              } else setError(res.error);
            }}
          >
            {busy ? <Spinner /> : null} Collect {money(amt)}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4 py-2">
        {customer.outstanding > 0 ? (
          <div className="space-y-2">
            <Label>Amount</Label>
            <NumberField
              value={amt}
              onChange={(v) => {
                setAmt(v);
                setError(null);
              }}
              className="h-12 text-xl"
            />
            <div className="flex gap-2">
              <Chip
                active={amt === customer.outstanding}
                onClick={() => setAmt(customer.outstanding)}
              >
                Full
              </Chip>
              <Chip
                active={amt === Math.round(customer.outstanding / 2)}
                onClick={() => setAmt(Math.round(customer.outstanding / 2))}
              >
                Half
              </Chip>
            </div>
            <Label>Paid by</Label>
            <div className="flex flex-wrap gap-2">
              {modes.map((m) => (
                <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>
                  {m.name}
                </Chip>
              ))}
            </div>
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <SectionTitle>History</SectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {[
              ...customer.bills.map((b) => ({
                at: b.settledAt ?? b.createdAt,
                node: (
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: b.id }}
                    className="flex justify-between px-3 py-2.5 text-sm"
                  >
                    <span>
                      <span className="font-semibold">Bill {b.billNo}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {dateTime(b.settledAt ?? b.createdAt)} · bill {money(b.totals.grand)}
                      </span>
                    </span>
                    <span className="num text-status-hold">
                      {money(b.dueOutstanding ?? 0)} left
                    </span>
                  </Link>
                ),
              })),
              ...customer.collections.map((c) => ({
                at: c.at,
                node: (
                  <div className="flex justify-between px-3 py-2.5 text-sm">
                    <span>
                      <span className="font-semibold">Collected · {modeName(c.modeId)}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {dateTime(c.at)} · {c.by}
                      </span>
                    </span>
                    <span className="num text-status-ready">− {money(c.amount)}</span>
                  </div>
                ),
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((e, i) => (
                <li key={i}>{e.node}</li>
              ))}
          </ul>
        </div>
      </div>
    </ResponsiveSheet>
  );
}
