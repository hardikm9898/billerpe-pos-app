import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ban, Pencil, Printer, ReceiptText, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { OrderStatusPill } from "@/components/pos/OrderRow";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { EmptyState, SectionTitle, Spinner, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, money, qty } from "@/lib/pos/format";
import { can, canSpecial } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";
import type { TimelineEvent } from "@/lib/pos/types";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Order detail — BillerPe POS" },
      { name: "description", content: "Items, KOT rounds, payments and the full timeline of an order." },
      { property: "og:title", content: "Order detail — BillerPe POS" },
      { property: "og:description", content: "Items, KOT rounds, payments and the full timeline of an order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();
  const pos = usePos();
  const navigate = useNavigate();
  const order = pos.orderById(orderId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const back = (
    <Link to="/orders" aria-label="Back" className="tap -ml-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
      <ArrowLeft className="size-5" />
    </Link>
  );
  if (!order) {
    return (
      <AppShell title="Order" topBarLeft={back}>
        <EmptyState title="Order not found" body="It may have been merged into another table." />
      </AppShell>
    );
  }

  const table = order.tableId ? pos.tableById(order.tableId) : undefined;
  const bill = pos.billFor(order);
  const open = ["running", "hold", "billed"].includes(order.status);
  const canBill = can(pos.permissions, "billing", "view");

  const timeline: TimelineEvent[] = [
    { at: order.createdAt, label: "Order created", by: order.captainName },
    ...order.rounds.map((r) => ({ at: r.sentAt, label: `KOT #${r.kotNo} (round ${r.roundNo}) ${r.printed ? `printed on ${r.printerName}` : "not printed"}`, by: order.captainName })),
    ...(order.billPrintedAt && !order.events?.some((e) => e.label === "Bill printed") ? [{ at: order.billPrintedAt, label: "Bill printed", by: order.settledBy ?? "Cashier" }] : []),
    ...(order.events ?? []),
    ...(order.settledAt && !order.events?.some((e) => e.label.startsWith("Settled")) ? [{ at: order.settledAt, label: "Settled", by: order.settledBy ?? "Cashier" }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string | undefined }>, msg: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Something went wrong");
    return res.ok;
  };

  return (
    <AppShell title={`${order.code}`} subtitle={table ? `${table.name} · ${order.guests} guests` : `Token ${order.tokenNo ?? "—"}`} topBarLeft={back}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-soft">
          <div>
            <OrderStatusPill status={order.status} />
            <p className="mt-1 text-xs text-muted-foreground">
              {order.captainName}
              {order.customerName ? ` · ${order.customerName}` : ""}
              {order.customerMobile ? ` · ${order.customerMobile}` : ""}
            </p>
            {order.cancelReason ? <p className="mt-1 text-xs font-semibold text-destructive">Reason: {order.cancelReason}</p> : null}
          </div>
          <p className="num font-display text-2xl font-extrabold">{money(order.settledTotal ?? bill.grandTotal)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {open ? (
            <Button variant="outline" className="tap" asChild>
              <Link to="/order/$orderId" params={{ orderId: order.id }}><UtensilsCrossed className="size-4" /> Open order</Link>
            </Button>
          ) : null}
          {canBill && open ? (
            <Button className="tap" asChild>
              <Link to="/bill/$orderId" params={{ orderId: order.id }}><ReceiptText className="size-4" /> Bill & settle</Link>
            </Button>
          ) : null}
          {canBill && (order.billPrintedAt || order.status === "settled") ? (
            <Button variant="outline" className="tap" disabled={busy !== null} onClick={() => void run("rb", () => pos.reprintBill(order.id), `Bill ${order.code} reprinted`)}>
              {busy === "rb" ? <Spinner /> : <Printer className="size-4" />} Reprint bill
            </Button>
          ) : null}
          {order.status === "settled" && canSpecial(pos.permissions, "reopenSettledBill") ? (
            <Button
              variant="outline"
              className="tap"
              disabled={busy !== null}
              onClick={async () => {
                const ok = await run("edit", () => pos.reopenBill(order.id), "Bill reopened for editing");
                if (ok) void navigate({ to: "/bill/$orderId", params: { orderId: order.id } });
              }}
            >
              <Pencil className="size-4" /> Edit settled bill
            </Button>
          ) : null}
          {open && can(pos.permissions, "orders", "delete") ? (
            <Button variant="outline" className="tap text-destructive" onClick={() => setCancelOpen(true)}>
              <Ban className="size-4" /> Cancel
            </Button>
          ) : null}
        </div>

        <section className="space-y-2">
          <SectionTitle>Items</SectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
            {bill.lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-2.5 text-sm">
                <VegMark type={l.vegType} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{l.name}</span>
                  {l.detail ? <span className="text-muted-foreground"> · {l.detail}</span> : null}
                </span>
                <span className="num text-muted-foreground">{qty(l.quantity)} ×</span>
                <span className="num w-20 text-right">{money(l.amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <SectionTitle>KOT rounds</SectionTitle>
          {order.rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No KOT sent yet.</p>
          ) : (
            order.rounds.map((r) => (
              <div key={r.kotNo} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold">KOT #{r.kotNo} · Round {r.roundNo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {dateTime(r.sentAt)} · {r.lines.map((l) => `${qty(l.quantity)} ${l.name}`).join(", ")}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="tap" disabled={busy !== null} onClick={() => void run(`k${r.kotNo}`, () => pos.reprintKot(order.id, r.kotNo), `KOT #${r.kotNo} reprinted`)}>
                  {busy === `k${r.kotNo}` ? <Spinner /> : <Printer className="size-4" />} Reprint
                </Button>
              </div>
            ))
          )}
        </section>

        {order.payments?.length ? (
          <section className="space-y-2">
            <SectionTitle>Payments</SectionTitle>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
              {order.payments.map((p, i) => (
                <li key={i} className="flex justify-between py-2.5 text-sm">
                  <span className="font-semibold">{pos.modeLabel(p.mode)}</span>
                  <span className="num">{money(p.amount)}</span>
                </li>
              ))}
              {order.changeReturned ? (
                <li className="flex justify-between py-2.5 text-sm text-muted-foreground"><span>Change returned</span><span className="num">{money(order.changeReturned)}</span></li>
              ) : null}
              {(order.dueOutstanding ?? 0) > 0 ? (
                <li className="flex justify-between py-2.5 text-sm font-semibold text-status-hold"><span>Still due</span><span className="num">{money(order.dueOutstanding!)}</span></li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <SectionTitle>Timeline</SectionTitle>
          <ol className="relative ml-2 space-y-3 border-l border-border pl-4">
            {timeline.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
                <p className="text-sm font-semibold">{e.label}</p>
                <p className="text-xs text-muted-foreground">{dateTime(e.at)} · {e.by}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <ResponsiveSheet
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${order.code}?`}
        description="A reason is required and is saved in the audit log."
        footer={
          <Button
            variant="destructive"
            className="tap w-full"
            disabled={!reason.trim() || busy !== null}
            onClick={async () => {
              const ok = await run("cancel", () => pos.cancelOrder(order.id, reason), "Order cancelled");
              if (ok) setCancelOpen(false);
            }}
          >
            Cancel order
          </Button>
        }
      >
        <Textarea className="my-2" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ResponsiveSheet>
    </AppShell>
  );
}
