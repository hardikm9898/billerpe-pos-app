import { createFileRoute, Link } from "@tanstack/react-router";
import { HandCoins, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, SectionTitle, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateTime, money } from "@/lib/pos/format";
import { usePos, type DueCustomer } from "@/lib/pos/store";
import type { PaymentModeId } from "@/lib/pos/types";

export const Route = createFileRoute("/due")({
  head: () => ({
    meta: [
      { title: "Due ledger — BillerPe POS" },
      { name: "description", content: "Customers with pending dues, full or partial collection and payment history." },
      { property: "og:title", content: "Due ledger — BillerPe POS" },
      { property: "og:description", content: "Customers with pending dues, full or partial collection and payment history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DuePage,
});

function DuePage() {
  const pos = usePos();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos.dueCustomers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q));
  }, [pos.dueCustomers, query]);
  const totalDue = pos.dueCustomers.reduce((a, c) => a + c.outstanding, 0);
  const customer = pos.dueCustomers.find((c) => c.mobile === selected);

  return (
    <AppShell title="Due ledger">
      <div className="rounded-lg bg-primary-soft p-4 text-primary-soft-foreground">
        <p className="text-sm font-semibold">Total outstanding</p>
        <p className="num font-display text-3xl font-extrabold">{money(totalDue)}</p>
        <p className="text-xs">{pos.dueCustomers.filter((c) => c.outstanding > 0).length} customers</p>
      </div>
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="tap pl-9" placeholder="Name or mobile" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="mt-3 space-y-2">
        {list.length === 0 ? (
          <EmptyState icon={<HandCoins className="size-6" />} title="No dues" body="Bills settled as Due show up here." />
        ) : (
          list.map((c) => (
            <button key={c.mobile} type="button" onClick={() => setSelected(c.mobile)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-soft">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted font-display font-bold">{c.name.slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.mobile} · {c.bills.length} bills</p>
              </div>
              <span className={`num ${c.outstanding > 0 ? "text-status-hold" : "text-status-ready"}`}>{c.outstanding > 0 ? money(c.outstanding) : "Cleared"}</span>
            </button>
          ))
        )}
      </div>
      {customer ? <CustomerSheet customer={customer} onClose={() => setSelected(null)} /> : null}
    </AppShell>
  );
}

function CustomerSheet({ customer, onClose }: { customer: DueCustomer; onClose: () => void }) {
  const pos = usePos();
  const [amt, setAmt] = useState(customer.outstanding);
  const [mode, setMode] = useState<PaymentModeId>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modes = pos.billingSettings.paymentModes.filter((m) => m.id !== "due");

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
              const res = await pos.collectDue(customer.mobile, amt, mode);
              setBusy(false);
              if (res.ok) {
                toast.success(`${money(amt)} collected from ${customer.name}`);
                onClose();
              } else setError(res.error ?? "Could not collect");
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
            <NumberField value={amt} onChange={(v) => { setAmt(v); setError(null); }} className="h-12 text-xl" />
            <div className="flex gap-2">
              <Chip active={amt === customer.outstanding} onClick={() => setAmt(customer.outstanding)}>Full</Chip>
              <Chip active={amt === Math.round(customer.outstanding / 2)} onClick={() => setAmt(Math.round(customer.outstanding / 2))}>Half</Chip>
            </div>
            <Label>Paid by</Label>
            <div className="flex flex-wrap gap-2">
              {modes.map((m) => <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</Chip>)}
            </div>
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <SectionTitle>History</SectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {[
              ...customer.bills.map((b) => ({ at: b.settledAt ?? b.createdAt, node: (
                <Link to="/orders/$orderId" params={{ orderId: b.id }} className="flex justify-between px-3 py-2.5 text-sm">
                  <span><span className="font-semibold">Bill {b.code}</span><br /><span className="text-xs text-muted-foreground">{dateTime(b.settledAt ?? b.createdAt)} · due {money(b.payments?.find((p) => p.mode === "due")?.amount ?? 0)}</span></span>
                  <span className="num text-status-hold">{money(b.dueOutstanding ?? 0)} left</span>
                </Link>
              ) })),
              ...customer.collections.map((c) => ({ at: c.at, node: (
                <div className="flex justify-between px-3 py-2.5 text-sm">
                  <span><span className="font-semibold">Collected · {pos.modeLabel(c.mode)}</span><br /><span className="text-xs text-muted-foreground">{dateTime(c.at)} · {c.by}</span></span>
                  <span className="num text-status-ready">− {money(c.amount)}</span>
                </div>
              ) })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((e, i) => <li key={i}>{e.node}</li>)}
          </ul>
        </div>
      </div>
    </ResponsiveSheet>
  );
}
